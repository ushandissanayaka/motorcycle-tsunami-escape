# Motorcycle Tsunami Escape — Starting Place

This first playable slice contains the starting hub, free-roam bike controls, speed training pads, a bike display row, and a local wins-based garage. It does not require an account. Guest progress is saved in this browser's local storage.

## Run locally

```bash
npm install
npm run dev
```

Start the backend in a second terminal with `cd ../motorcycle-tsunami-escape-server` and `npm install && npm run dev`. The client connects to port 2567 on the same host by default. Vite listens on all network interfaces, so other devices on the same network can open the game using this computer's LAN address.

## Deploy multiplayer on Render

Deploy `motorcycle-tsunami-escape-server` as a Render **Web Service**:

- Root Directory: `motorcycle-tsunami-escape-server`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Render supplies `PORT`; the server listens on it and accepts WebSocket connections through the same public service URL. Don't add `:2567` to that public URL. In the frontend host's build environment, set `VITE_SERVER_WS_URL` to `wss://motorcycle-tsunami-escape.onrender.com` (replace the hostname if your Render service URL differs), then redeploy/rebuild the frontend. The setting must be present at build time because Vite embeds it in the client bundle. For a custom frontend domain, set `CLIENT_ORIGIN` on the backend to that frontend's origin, such as `https://my-game.example.com`.

You can verify the backend is awake by opening `https://motorcycle-tsunami-escape.onrender.com/health`; it should return `{"ok":true,"service":"motorcycle-tsunami-escape"}`. Then open the game in two browser windows. The presence indicator should show connected players and each rider should appear in the other window. Render's free service can sleep while idle, so the first connection after inactivity can take a while.

Use **W/A/S/D** to ride, **Space** to hop, and the bike cards to select bikes you have unlocked. Every wave-track pit has a narrow, long red mat on the left and yellow mat on the right, each with one large hovering trophy and a win label. Ride over one to collect its wins, see a celebration, and return to the hub. The first pit awards +2 on red and +3 on yellow; each later pit adds two wins to both colors. Collected rewards and wins are saved in this browser.

The optional Bloxity SDK is initialized when its portal script is available. Portal lifecycle signals are sent when supported; local play does not depend on the SDK. The Colyseus connection is also optional, so the game remains playable if the backend is unavailable.

## Current slice

- Three.js Starting Place: road, canyon backdrop, paved training and garage areas, boost pads, bike stands, and a World 2 display gate.
- Guest-only browser profile and garage selection. Bike thresholds and colors live in `src/shared/constants.js`.
- No sign-in, purchase, or server profile flow in this milestone. The Colyseus room only shares live guest rider presence.
