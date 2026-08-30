const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const rooms = new Map();

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
    // Extract the public IP address from the proxy headers (Railway).
    // If no proxy header exists (e.g., testing locally on LAN), fallback to 'local-mesh'.
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : 'local-mesh';
    
    const roomId = clientIp; 
    ws.roomId = roomId;

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            try {
                const parsed = JSON.parse(message.toString());
                
                if (parsed.type === 'join') {
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
                    for (const peer of room) {
                        if (peer.peerId === target) {
                            parsed.from = ws.peerId;
                            peer.send(JSON.stringify(parsed));
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Error parsing message', err);
            }
        }
    });
    
    ws.on('close', () => {
        if (ws.peerId) {
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
