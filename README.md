# SwiftShare

SwiftShare is a fast, local-first peer-to-peer sharing app that lets users send text and files between devices on the same Wi‑Fi or hotspot without needing a heavy messaging app or cloud upload.

The project is designed for quick sharing between a phone and laptop, such as copying a URL, OTP, note, or sending a file directly between devices over a local network.

Live demo: https://swift2share.netlify.app/

## Overview

SwiftShare is built around the idea of instant device-to-device communication using WebRTC and a lightweight signaling server. It allows:

- Clipboard text sharing between nearby devices
- File transfer over the same local network
- Broadcast sharing to all connected peers or direct sharing to one device
- Simple browser-based experience with no account or login required
- PWA-style installability for mobile and desktop use

## Why this project exists

Users often end up using messaging apps just to move a short text snippet or a small file from one device to another. SwiftShare removes that friction by making local transfers fast, simple, and direct.

This is especially useful for:

- Developers moving code snippets or URLs from phone to laptop
- Students sharing notes or credentials between devices
- Quick transfer of photos or documents over hotspot/Wi‑Fi
- Local-first communication without cloud dependency

## Tech stack

- Frontend: SvelteKit + Vite
- WebRTC: Real-time peer-to-peer data transfer
- Signaling: Node.js + ws WebSocket server
- Deployment: Netlify for frontend
- Local networking: Same Wi‑Fi / hotspot communication

## Project structure

- `client/` – Svelte frontend app
- `server/` – WebSocket signaling server
- `Product_Requirements_Document.md` – product requirements
- `Technical_Design_Document.md` – technical design notes

## Features

- Instant text sharing
- File transfer with drag-and-drop and file picker
- Device discovery on the local mesh network
- Broadcast and private peer communication
- Dark mode interface
- Local-first architecture with minimal setup

## How it works

1. Devices connect to the same local network.
2. Each device joins a shared signaling room via the Node WebSocket server.
3. WebRTC peer connections are created between nearby devices.
4. Text or files are transferred directly over the established peer connection.
5. No central storage is required for the actual transfer payload.

## Prerequisites

Before running the project locally, make sure you have:

- Node.js 18+ or 20+
- npm
- A browser on each device
- Devices connected to the same Wi‑Fi or mobile hotspot

## Run locally

### 1. Clone the repository

```bash
git clone https://github.com/jagtar5/SwiftShare.git
cd SwiftShare
```

### 2. Install frontend dependencies

```bash
cd client
npm install
```

### 3. Install server dependencies

```bash
cd ../server
npm install
```

### 4. Start the signaling server

```bash
cd server
node index.js
```

The signaling server runs on port 8080 by default.

### 5. Start the client app

Open a second terminal and run:

```bash
cd client
npm run dev -- --host
```

Then open the local URL shown in the terminal, typically:

```bash
http://localhost:5173
```

### 6. Use the app

- Connect both devices to the same Wi‑Fi or hotspot
- Open SwiftShare on both devices
- Select a connected peer or use General broadcast mode
- Paste text or drag a file to share instantly

## Build for production

To generate a production build for the frontend:

```bash
cd client
npm run build
```

To preview the production build locally:

```bash
npm run preview -- --host
```

## Deployment notes

The frontend is configured for Netlify deployment using the build settings in `client/netlify.toml`.

The live project is available here:

https://swift2share.netlify.app/

For full local network communication in production, the signaling server should also be hosted on a service that supports Node.js WebSockets and reachable by the client app.

## License

This project is currently shared for learning and personal use.

## Author

Jagtar Singh

## GitHub

Repository: https://github.com/jagtar5/SwiftShare

## Quick summary

SwiftShare is a lightweight WebRTC-based local sharing app built to move files and clipboard text between devices in seconds. It is useful for real-world everyday device-to-device sharing and is a strong example of peer-to-peer communication using modern web technologies.

