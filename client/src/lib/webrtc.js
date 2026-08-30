import { writable, get } from 'svelte/store';

export const peers = writable(new Map());
export const logs = writable([]);
export const connected = writable(false);
export const localPeerId = writable('');

let ws;

export function connectSignaling(serverUrl, requestedId = null) {
    if (ws) {
        ws.close();
    }
    
    ws = new WebSocket(serverUrl);
    
    ws.onopen = () => {
        addLog('Connected to signaling server');
        connected.set(true);
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const deviceType = isMobile ? 'mobile' : 'desktop';
        
        ws.send(JSON.stringify({ 
            type: 'join', 
            room: 'local-mesh', 
            id: requestedId || get(localPeerId),
            device: deviceType
        }));
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'room-info':
                localPeerId.set(data.peerId);
                data.peers.forEach(p => {
                    addPeer(p.id, p.device);
                });
                break;
            case 'peer-joined':
                addLog(`Peer joined: ${data.peerId}`);
                addPeer(data.peerId, data.device);
                // When a new peer joins, we (the existing peers) initiate the offer
                initiateConnection(data.peerId);
                break;
            case 'peer-left':
                addLog(`Peer left: ${data.peerId}`);
                removePeer(data.peerId);
                break;
            case 'offer':
                await handleOffer(data.from, data.sdp);
                break;
            case 'answer':
                await handleAnswer(data.from, data.sdp);
                break;
            case 'ice-candidate':
                await handleIceCandidate(data.from, data.candidate);
                break;
        }
    };
    
    ws.onclose = () => {
        addLog('Disconnected from signaling server');
        connected.set(false);
    };
}

function addLog(msg) {
    logs.update(l => [...l, msg]);
}

function addPeer(peerId, device = 'desktop') {
    peers.update(p => {
        if (!p.has(peerId)) {
            p.set(peerId, { connection: null, dataChannel: null, status: 'disconnected', device });
        }
        return p;
    });
}

function removePeer(peerId) {
    peers.update(p => {
        const peer = p.get(peerId);
        if (peer?.connection) {
            peer.connection.close();
        }
        p.delete(peerId);
        return p;
    });
}

function updatePeerStatus(peerId, status) {
    peers.update(p => {
        const peer = p.get(peerId);
        if (peer) {
            peer.status = status;
            // if disconnected, we could clean up
        }
        return p;
    });
}

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(configuration);
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: peerId,
                candidate: event.candidate
            }));
        }
    };
    
    pc.onconnectionstatechange = () => {
        updatePeerStatus(peerId, pc.connectionState);
        addLog(`Connection to ${peerId} changed to: ${pc.connectionState}`);
    };
    
    pc.ondatachannel = (event) => {
        setupDataChannel(peerId, event.channel);
    };
    
    peers.update(p => {
        const peer = p.get(peerId);
        if (peer) peer.connection = pc;
        return p;
    });
    
    return pc;
}

function setupDataChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
        addLog(`Data channel with ${peerId} open`);
        updatePeerStatus(peerId, 'connected');
        if (get(history).length === 0) {
            channel.send(JSON.stringify({ type: 'sync-request' }));
        }
    };
    
    channel.onmessage = (event) => {
        handleIncomingData(peerId, event.data);
    };
    
    channel.onclose = () => {
        addLog(`Data channel with ${peerId} closed`);
        updatePeerStatus(peerId, 'disconnected');
    };
    
    peers.update(p => {
        const peer = p.get(peerId);
        if (peer) peer.dataChannel = channel;
        return p;
    });
}

async function initiateConnection(peerId) {
    const pc = createPeerConnection(peerId);
    
    const channel = pc.createDataChannel('swiftshare');
    setupDataChannel(peerId, channel);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    ws.send(JSON.stringify({
        type: 'offer',
        target: peerId,
        sdp: pc.localDescription
    }));
}

async function handleOffer(peerId, sdp) {
    const pc = createPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({
        type: 'answer',
        target: peerId,
        sdp: pc.localDescription
    }));
}

async function handleAnswer(peerId, sdp) {
    const p = get(peers);
    const peer = p.get(peerId);
    if (peer && peer.connection) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
}

async function handleIceCandidate(peerId, candidate) {
    const p = get(peers);
    const peer = p.get(peerId);
    if (peer && peer.connection) {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

// File and Text transfer logic
export const incomingData = writable(null); // { type: 'text' | 'file', data: any, from: string, meta?: any, id: number }

export const history = writable([]);
export const transferProgress = writable({});
const hostedFiles = new Map(); // fileId -> Blob/File

let progressState = {}; // Internal state for speed calculation

function updateProgress(id, fileName, type, progress, currentBytes = 0) {
    const now = performance.now();
    let speedStr = '';
    
    if (!progressState[id]) {
        progressState[id] = { lastStoreUpdate: 0, lastBytes: 0, lastTime: now };
    }
    
    const state = progressState[id];
    
    // Throttle UI updates to every 250ms to prevent app slowdown, or force update at 100%
    if (progress >= 100 || now - state.lastStoreUpdate > 250) {
        const timeDiff = (now - state.lastTime) / 1000;
        
        if (timeDiff > 0 && currentBytes > 0) {
            const bytesDiff = currentBytes - state.lastBytes;
            const bytesPerSec = Math.max(0, bytesDiff / timeDiff);
            
            if (bytesPerSec > 1024 * 1024) {
                speedStr = (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
            } else if (bytesPerSec > 1024) {
                speedStr = (bytesPerSec / 1024).toFixed(1) + ' KB/s';
            } else {
                speedStr = bytesPerSec.toFixed(0) + ' B/s';
            }
        }
        
        state.lastBytes = currentBytes;
        state.lastTime = now;
        state.lastStoreUpdate = now;

        transferProgress.update(tp => {
            if (progress >= 100) {
                if (!tp[id] || !tp[id].done) {
                    setTimeout(() => {
                        transferProgress.update(current => {
                            const next = { ...current };
                            delete next[id];
                            delete progressState[id];
                            return next;
                        });
                    }, 2000);
                }
                tp[id] = { fileName, type, progress: 100, speed: speedStr || (tp[id]?.speed || ''), done: true };
            } else {
                tp[id] = { fileName, type, progress, speed: speedStr || (tp[id]?.speed || '') };
            }
            return tp;
        });
    }
}

let fileBuffer = [];
let receivedBytes = 0;
let incomingFileMeta = null;

export function clearHistoryNetwork() {
    history.set([]);
    hostedFiles.clear();
    const payload = JSON.stringify({ type: 'clear-history' });
    get(peers).forEach(peer => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
            peer.dataChannel.send(payload);
        }
    });
}

export function requestFileNetwork(fileId) {
    if (hostedFiles.has(fileId)) {
        alert("You already have this file in memory on this device! (You uploaded it or already downloaded it)");
        return;
    }

    const payload = JSON.stringify({ type: 'request-file', fileId });
    let sent = false;
    get(peers).forEach(peer => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
            peer.dataChannel.send(payload);
            sent = true;
        }
    });
    
    if (sent) {
        // Optional: toast or alert to confirm click
        console.log("Requested file from network:", fileId);
    } else {
        alert("No peers are currently connected to download from!");
    }
}

async function seedFileToPeer(targetPeerId, fileId, fileBlob) {
    const peer = get(peers).get(targetPeerId);
    if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== 'open') return;
    
    const histItem = get(history).find(h => h.id === fileId);
    const fileName = fileBlob.name || (histItem ? histItem.content : 'file');
    
    const channel = peer.dataChannel;
    channel.send(JSON.stringify({
        type: 'file-meta',
        id: fileId,
        fileName: fileName,
        fileSize: fileBlob.size,
        fileType: fileBlob.type,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSeed: true
    }));
    
    const chunkSize = 64 * 1024;
    let offset = 0;
    
    return new Promise((resolve) => {
        const fileReader = new FileReader();
        
        const sendNextSlice = () => {
            if (channel.readyState !== 'open') {
                resolve();
                return;
            }
            
            // Respect backpressure: wait if SCTP buffer is larger than 8MB
            if (channel.bufferedAmount > 8 * 1024 * 1024) {
                setTimeout(sendNextSlice, 10);
                return;
            }
            
            const progress = Math.round((offset / fileBlob.size) * 100);
            updateProgress(fileId, fileName, 'out', progress, offset);
            
            const slice = fileBlob.slice(offset, offset + chunkSize);
            fileReader.readAsArrayBuffer(slice);
        };
        
        fileReader.onload = (e) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(e.target.result);
                } catch (err) {
                    console.error("Data channel send error (seed):", err);
                }
                offset += e.target.result.byteLength;
                if (offset < fileBlob.size) {
                    sendNextSlice();
                } else {
                    updateProgress(fileId, fileName, 'out', 100, offset);
                    resolve();
                }
            } else {
                resolve();
            }
        };
        
        sendNextSlice();
    });
}

function handleIncomingData(peerId, data) {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'clear-history') {
                history.set([]);
                hostedFiles.clear();
            } else if (parsed.type === 'sync-request') {
                const currentHistory = get(history);
                if (currentHistory.length > 0) {
                    const peer = get(peers).get(peerId);
                    if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
                        peer.dataChannel.send(JSON.stringify({ type: 'sync-response', history: currentHistory }));
                    }
                }
            } else if (parsed.type === 'sync-response') {
                const current = get(history);
                if (current.length === 0) {
                    history.set(parsed.history);
                }
            } else if (parsed.type === 'request-file') {
                const fileToSeed = hostedFiles.get(parsed.fileId);
                if (fileToSeed) {
                    // Start seeding it!
                    seedFileToPeer(peerId, parsed.fileId, fileToSeed);
                } else {
                    // Let them know we don't have it
                    const peer = get(peers).get(peerId);
                    if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
                        peer.dataChannel.send(JSON.stringify({ type: 'file-not-found', fileId: parsed.fileId }));
                    }
                }
            } else if (parsed.type === 'file-not-found') {
                alert("The requested file is no longer available. The original sender must have refreshed their page!");
            } else if (parsed.type === 'file-meta') {
                incomingFileMeta = parsed;
                fileBuffer = [];
                receivedBytes = 0;
                addLog(`Receiving file: ${parsed.fileName} (${parsed.fileSize} bytes)`);
            } else if (parsed.type === 'text') {
                history.update(h => [{ 
                    id: parsed.id || Date.now().toString(), 
                    direction: 'in', 
                    type: 'text', 
                    peer: peerId, 
                    isBroadcast: parsed.broadcast,
                    content: parsed.text, 
                    time: parsed.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }, ...h]);
            }
        } catch (e) {
            console.error('Data parsing error', e);
        }
    } else {
        // Binary chunk
        if (!incomingFileMeta) return;
        
        fileBuffer.push(data);
        receivedBytes += data.byteLength;
        
        const progress = Math.round((receivedBytes / incomingFileMeta.fileSize) * 100);
        updateProgress(incomingFileMeta.id, incomingFileMeta.fileName, 'in', progress, receivedBytes);
        
        if (receivedBytes >= incomingFileMeta.fileSize) {
            const blob = new Blob(fileBuffer, { type: incomingFileMeta.fileType });
            
            hostedFiles.set(incomingFileMeta.id, blob); // Seed for others
            
            const existing = get(history).find(h => h.id === incomingFileMeta.id);
            if (!existing) {
                history.update(h => [{ 
                    id: incomingFileMeta.id || Date.now().toString(), 
                    direction: 'in', 
                    type: 'file', 
                    peer: peerId, 
                    isBroadcast: incomingFileMeta.broadcast,
                    content: incomingFileMeta.fileName, 
                    time: incomingFileMeta.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }, ...h]);
            }
            
            incomingData.set({ 
                type: 'file', 
                data: blob, 
                meta: incomingFileMeta, 
                from: peerId
            });
            incomingFileMeta = null;
        }
    }
}

export function sendText(targetPeerId, text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = Date.now().toString() + Math.random();
    const isBroadcast = targetPeerId === 'general';
    
    const displayTarget = isBroadcast ? 'Everyone' : targetPeerId;
    history.update(h => [{ id, direction: 'out', type: 'text', peer: displayTarget, content: text, time, isBroadcast }, ...h]);

    const payload = JSON.stringify({ type: 'text', text, id, time, broadcast: isBroadcast });

    if (isBroadcast) {
        get(peers).forEach(peer => {
            if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
                peer.dataChannel.send(payload);
            }
        });
    } else {
        const peer = get(peers).get(targetPeerId);
        if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
            peer.dataChannel.send(payload);
        }
    }
}

export async function sendFile(targetPeerId, file) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fileId = Date.now().toString() + Math.random();
    const isBroadcast = targetPeerId === 'general';
    
    hostedFiles.set(fileId, file);
    
    const displayTarget = isBroadcast ? 'Everyone' : targetPeerId;
    history.update(h => [{ id: fileId, direction: 'out', type: 'file', peer: displayTarget, content: file.name, time, isBroadcast }, ...h]);

    const metaPayload = JSON.stringify({
        type: 'file-meta',
        id: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        time,
        broadcast: isBroadcast
    });

    const targets = isBroadcast 
        ? Array.from(get(peers).values()).filter(p => p.dataChannel && p.dataChannel.readyState === 'open')
        : (get(peers).has(targetPeerId) ? [get(peers).get(targetPeerId)] : []);
        
    for (const p of targets) {
        p.dataChannel.send(metaPayload);
    }
    
    if (targets.length === 0) return;

    const chunkSize = 64 * 1024;
    let offset = 0;
    
    return new Promise((resolve) => {
        const fileReader = new FileReader();
        
        const sendNextSlice = () => {
            let maxBuffered = 0;
            for (const p of targets) {
                if (p.dataChannel && p.dataChannel.readyState === 'open') {
                    maxBuffered = Math.max(maxBuffered, p.dataChannel.bufferedAmount);
                }
            }
            
            // Wait if buffer exceeds 8MB to prevent WebRTC crash
            if (maxBuffered > 8 * 1024 * 1024) {
                setTimeout(sendNextSlice, 10);
                return;
            }
            
            const progress = Math.round((offset / file.size) * 100);
            updateProgress(fileId, file.name, 'out', progress, offset);
            
            const slice = file.slice(offset, offset + chunkSize);
            fileReader.readAsArrayBuffer(slice);
        };
        
        fileReader.onload = (e) => {
            for (const p of targets) {
                if (p.dataChannel && p.dataChannel.readyState === 'open') {
                    try {
                        p.dataChannel.send(e.target.result);
                    } catch (err) {
                        console.error("Data channel send error:", err);
                    }
                }
            }
            offset += e.target.result.byteLength;
            
            if (offset < file.size) {
                sendNextSlice();
            } else {
                updateProgress(fileId, file.name, 'out', 100, offset);
                resolve();
            }
        };
        
        sendNextSlice();
    });
}
