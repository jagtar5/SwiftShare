const WebSocket = require('ws');
const crypto = require('crypto');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const rooms = new Map();

function getClientAddress(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const cfIp = req.headers["cf-connecting-ip"];
  const flyIp = req.headers["fly-client-ip"];
  const trueIp = req.headers["true-client-ip"];

  const firstForwardedAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0];

  const address = cfIp || flyIp || trueIp || realIp || firstForwardedAddress?.trim() || req.socket.remoteAddress || "unknown";
  
  let cleanAddress = address.replace(/^::ffff:/, "");
  
  console.log(`[IP DEBUG] Headers: CF=${cfIp||'none'} FLY=${flyIp||'none'} XFF=${forwardedFor||'none'} REAL=${realIp||'none'} Socket=${req.socket.remoteAddress} -> Resolved: ${cleanAddress}`);
  
  return cleanAddress;
}

function resolveRoomId(req, requestedRoomId) {
    if (requestedRoomId !== 'local-mesh' && requestedRoomId !== 'nearby') {
        return requestedRoomId;
    }
    const networkKey = getClientAddress(req);
    const hash = crypto.createHash("sha256").update(networkKey).digest("hex").slice(0, 16);
    return `local-mesh-${hash}`;
}

function broadcastToRoom(roomId, senderWs, message) {
  const room = rooms.get(roomId);
  if (room) {
    for (const ws of room) {
      if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

wss.on('connection', (ws, req) => {
    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            try {
                const parsed = JSON.parse(message.toString());
                
                if (parsed.type === 'join') {
                    const requestedRoom = parsed.room || 'local-mesh';
                    const roomId = resolveRoomId(req, requestedRoom);
                    ws.roomId = roomId;
                    
                    let requestedId = parsed.id;
                    let room = rooms.get(roomId);
                    
                    if (room && requestedId) {
                        for (const p of room) {
                            if (p.peerId === requestedId) requestedId = null;
                        }
                    }
                    
                    ws.peerId = requestedId || Math.random().toString(36).substring(2, 9);
                    ws.device = parsed.device || 'desktop';
                    
                    if (!room) {
                        room = new Set();
                        rooms.set(roomId, room);
                    }
                    
                    const existingPeers = Array.from(room).map(p => ({ id: p.peerId, device: p.device }));
                    
                    ws.send(JSON.stringify({
                        type: 'room-info',
                        peerId: ws.peerId,
                        peers: existingPeers
                    }));
                    
                    broadcastToRoom(roomId, ws, JSON.stringify({
                        type: 'peer-joined',
                        peerId: ws.peerId,
                        device: ws.device
                    }));
                    
                    room.add(ws);
                    console.log(`Peer ${ws.peerId} (${ws.device}) joined room ${roomId}`);
                    return;
                }
                
                // Relaying signaling messages (SDP, ICE) to the target peer
                const { target, type } = parsed;
                const room = rooms.get(ws.roomId);
                
                if (room && target) {
                    // Strict peer validation: Ensure the target actually exists in THIS exact room.
                    let targetPeer = null;
                    for (const peer of room) {
                        if (peer.peerId === target) {
                            targetPeer = peer;
                            break;
                        }
                    }
                    
                    if (targetPeer) {
                        parsed.from = ws.peerId;
                        targetPeer.send(JSON.stringify(parsed));
                    } else {
                        console.warn(`Blocked signal: Peer ${ws.peerId} tried to signal missing/external target ${target}`);
                    }
                }
            } catch (err) {
                console.error('Error parsing message', err);
            }
        }
    });
    
    ws.on('close', () => {
        if (ws.peerId && ws.roomId) {
            const room = rooms.get(ws.roomId);
            if (room) {
                room.delete(ws);
                if (room.size === 0) {
                    rooms.delete(ws.roomId);
                } else {
                    broadcastToRoom(ws.roomId, ws, JSON.stringify({
                        type: 'peer-left',
                        peerId: ws.peerId
                    }));
                }
            }
            console.log(`Peer ${ws.peerId} left room ${ws.roomId}`);
        }
    });
});

console.log(`Signaling server listening to port ${port}`);
