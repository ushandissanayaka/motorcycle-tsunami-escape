import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import colyseus from 'colyseus';
import { StartingPlaceRoom } from './rooms/StartingPlaceRoom.js';

const { Server } = colyseus;

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.get('/health', (_request, response) => response.json({ ok: true, service: 'motorcycle-tsunami-escape' }));

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });
gameServer.define('starting_place', StartingPlaceRoom);

const port = Number(process.env.PORT || 2567);
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Starting Place server listening on http://localhost:${port}`);
});
