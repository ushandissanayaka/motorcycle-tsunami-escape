# Motorcycle Tsunami Escape — Starting Place

This first playable slice contains the starting hub, free-roam bike controls, speed training pads, a bike display row, and a local wins-based garage. It does not require an account. Guest progress is saved in this browser's local storage.

## Run locally

```bash
npm install
npm run dev
```

Start the backend in a second terminal with `cd ../motorcycle-tsunami-escape-server` and `npm install && npm run dev`. The client connects to `ws://localhost:2567` by default; set `VITE_SERVER_WS_URL` in the client `.env` to change it.

Use **W/A/S/D** to ride, **Space** to hop, and the bike cards to select bikes you have unlocked. The **+1 WIN** control is a temporary local progression control for previewing the garage; the race and win-award loop will be built in a later step.

The optional Bloxity SDK is initialized when its portal script is available. Portal lifecycle signals are sent when supported; local play does not depend on the SDK. The Colyseus connection is also optional, so the game remains playable if the backend is unavailable.

## Current slice

- Three.js Starting Place: road, canyon backdrop, paved training and garage areas, boost pads, bike stands, and a World 2 display gate.
- Guest-only browser profile and garage selection. Bike thresholds and colors live in `src/shared/constants.js`.
- No sign-in, purchase, or server profile flow in this milestone. The Colyseus room only shares live guest rider presence.
