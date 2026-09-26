import { findOrCreateProfile, saveProfile } from '../game/profiles.js';
import { BUX_SKUS } from '../shared/gameData.js';

// Simple in-memory dedupe set. Swap for a DB unique-constraint on
// transactionId in production (this resets on server restart).
const processedTransactions = new Set();

// POST /api/legion-webhook
// Bloxity calls this AFTER deducting Bux. You grant the item and return
// 2xx within 10s, or the purchase is auto-refunded.
export async function legionWebhookHandler(req, res) {
  const secret = req.headers['x-legion-webhook-secret'];
  if (process.env.LEGION_WEBHOOK_SECRET && secret !== process.env.LEGION_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { transactionId, userId, username, sku, metadata } = req.body || {};

  if (!transactionId || !userId || !sku) {
    // 4xx = fail fast, no retry, Bloxity refunds immediately.
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (processedTransactions.has(transactionId)) {
    // Already granted once (Bloxity retries on network errors) — ack again.
    return res.status(200).json({ ok: true, alreadyProcessed: true });
  }

  const profile = findOrCreateProfile(userId, username);
  const patch = grantForSku(sku, profile, metadata);

  if (!patch) {
    return res.status(400).json({ error: `Unknown sku: ${sku}` });
  }

  saveProfile(userId, patch);
  processedTransactions.add(transactionId);

  return res.status(200).json({ ok: true, transactionId });
}

function grantForSku(sku, profile, metadata) {
  switch (sku) {
    case BUX_SKUS.DISABLE_WAVES:
      return { wavesDisabledUntil: Date.now() + 24 * 60 * 60 * 1000 }; // 24h toggle, tune as needed
    case BUX_SKUS.BOOST_2X_SPEED:
      return { speed: profile.speed * 2 };
    case BUX_SKUS.BOOST_2X_WINS:
      return { winsMultiplierActive: true };
    case BUX_SKUS.VIP_PASS:
      return { vip: true };
    case BUX_SKUS.BIKE_ASTRALWING:
      return { ownedBikes: [...new Set([...profile.ownedBikes, 'bike_astralwing'])] };
    case BUX_SKUS.BIKE_AETHERUNE:
      return { ownedBikes: [...new Set([...profile.ownedBikes, 'bike_aetherune'])] };
    default:
      return null;
  }
}
