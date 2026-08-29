import os from 'os';

export function load() {
    const interfaces = os.networkInterfaces();
    let localIp = null;
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Pick the first IPv4 address that isn't localhost (127.0.0.1)
            if (iface.family === 'IPv4' && !iface.internal) {
                localIp = iface.address;
                // If it looks like a typical LAN IP, prefer it
                if (localIp.startsWith('192.168.') || localIp.startsWith('10.') || localIp.startsWith('172.')) {
                    return { localIp };
                }
            }
        }
    }
    
    return { localIp };
}
