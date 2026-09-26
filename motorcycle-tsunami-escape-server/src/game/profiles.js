import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { speedForLevel } from '../shared/gameData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/profiles.json');

function readAll() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function defaultProfile(legionUserId, username) {
  return {
    legionUserId,
    username,
    speed: speedForLevel(1),
    level: 1,
    levelXP: 0,
    wins: 0,
    currency: 0,
    ownedBikes: ['bike_scooter'],
    equippedBike: 'bike_scooter',
    ownedPets: [],
    ownedTrails: [],
    rebirths: 0,
    vip: false,
    createdAt: Date.now(),
  };
}

// NOTE: this is only ever called for REAL logged-in users.
// Guests never touch the server — their save lives entirely in the
// browser's localStorage on the client (see bloxity/auth.js).
export function findOrCreateProfile(legionUserId, username) {
  const db = readAll();
  if (!db[legionUserId]) {
    db[legionUserId] = defaultProfile(legionUserId, username);
    writeAll(db);
  }
  return db[legionUserId];
}

export function saveProfile(legionUserId, patch) {
  const db = readAll();
  if (!db[legionUserId]) return null;
  db[legionUserId] = { ...db[legionUserId], ...patch };
  writeAll(db);
  return db[legionUserId];
}

export function getLeaderboard(limit = 10) {
  const db = readAll();
  return Object.values(db)
    .sort((a, b) => b.speed - a.speed)
    .slice(0, limit)
    .map((p) => ({ username: p.username, speed: p.speed, level: p.level }));
}

// Swap this file's fs-based storage for a real DB (Postgres/Mongo) before
// production — this flat-file version is only meant to get you running fast.
