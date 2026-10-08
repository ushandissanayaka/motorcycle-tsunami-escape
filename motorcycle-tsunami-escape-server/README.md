# Motorcycle Tsunami Escape backend

Colyseus + Express backend for the Starting Place. It broadcasts riders, movement and avatars (`starting_place` room),
and serves the Bloxity endpoints `POST /api/legion-auth` and `POST /api/legion-webhook`.

## Run locally

```bash
npm install
npm run dev
```

The room listens on port 2567 by default. `GET /health` returns `{ ok, service, version }`.

## Bloxity Legion hosting

Game id: `speed-motorcycle-tsunami-escape` (created on https://hosting.bloxity.io).

The server ships as a Docker image (see `Dockerfile`). To test the image locally:

```bash
docker build -t motorcycle-tsunami-escape-server --build-arg APP_VERSION=local .
docker run --rm -p 2567:2567 motorcycle-tsunami-escape-server
```

Deploys run from `.github/workflows/deploy.yml`: a push to `dev` goes to the dev channel, a push to `main` to prod.

Environment variables: `PORT` (default 2567), `CLIENT_ORIGIN` (defaults to localhost plus the Bloxity play
hosts) and `LEGION_WEBHOOK_SECRET`.

Note: profiles are stored in `data/profiles.json` inside the container, so they are lost on every redeploy.
Move them to a real database before production.
