# Motorcycle Tsunami Escape backend

This backend provides guest-only Colyseus presence for the Starting Place. It broadcasts riders and movement. It does not require accounts and does not load profile, authentication, or purchase routes.

## Run

```bash
npm install
npm run dev
```

The room listens on port 2567 by default. `GET /health` returns a small status response.
