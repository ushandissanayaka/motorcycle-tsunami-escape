import { findOrCreateProfile } from '../game/profiles.js';

// POST /api/legion-auth
// Body: { token: '<bloxity JWT>', user: { _id, username, displayName?, pfp?, avatar? } }
// This is only called when a REAL user logs in — never for guests.
// The Legion SDK's authenticateWithServer() sends this automatically.
export async function legionAuthHandler(req, res) {
  const { token, user } = req.body || {};

  if (!token || !user || !user._id) {
    return res.status(400).json({ error: 'Missing token or user' });
  }

  // TODO (production): verify the JWT signature against Bloxity's public
  // key / JWKS endpoint before trusting `user`. For local dev this trusts
  // the payload as-is since it only reaches this endpoint via the SDK.

  const profile = findOrCreateProfile(user._id, user.displayName || user.username);

  // Shape returned here is what Legion.SDK.auth.authenticateWithServer()
  // resolves with on the client.
  return res.status(200).json({
    ok: true,
    profile,
  });
}
