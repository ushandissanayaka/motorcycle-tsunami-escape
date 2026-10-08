import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import colyseus from 'colyseus';
import { StartingPlaceRoom } from './rooms/StartingPlaceRoom.js';
import { legionAuthHandler } from './auth/legionAuth.js';
import { legionWebhookHandler } from './webhooks/legionWebhook.js';

const { Server } = colyseus;

// The game's id on hosting.bloxity.io; its client is served from <GAME_ID>.play.bloxity.io (prod) and
// <GAME_ID>.dev.play.bloxity.io (dev).
const GAME_ID = 'speed-motorcycle-tsunami-escape';
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  `https://${GAME_ID}.play.bloxity.io`,
  `https://${GAME_ID}.dev.play.bloxity.io`,
].join(',');

const app = express();
// CLIENT_ORIGIN may list several origins, comma-separated (the game's own host, and the preview/dev hosts).
const allowedOrigins = (process.env.CLIENT_ORIGIN || DEFAULT_ORIGINS).split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_request, response) => response.json({
  ok: true,
  service: GAME_ID,
  version: process.env.APP_VERSION || 'dev',
}));
// Bloxity: the client's Legion.SDK.auth.authenticateWithServer() posts here when a real user logs in...
app.post('/api/legion-auth', legionAuthHandler);
// ...and Bloxity's servers post every completed Bux purchase here (server to server). It must answer 2xx or
// the Bux are refunded. Register this URL (https://<server host>/api/legion-webhook) in the Bloxity dev portal.
app.post('/api/legion-webhook', legionWebhookHandler);

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });
gameServer.define('starting_place', StartingPlaceRoom);

const port = Number(process.env.PORT || 2567);
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Starting Place server listening on http://localhost:${port}`);
});
