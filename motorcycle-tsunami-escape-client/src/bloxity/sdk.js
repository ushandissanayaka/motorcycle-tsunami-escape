// Thin wrapper around window.Legion.SDK. Keeps every other module from
// touching the global directly, and gives you one place to add logging /
// mocking for local dev without the script tag loaded.

const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'speed-motorcycle-tsunami-escape';
// Named outright: left out, the SDK assumes on localhost that the Bloxity portal itself runs locally (as for
// portal developers) and sends logins and API calls there, so logging in while testing this game locally
// would fail. These are the SDK's own defaults everywhere else.
const PORTAL_URL = import.meta.env.VITE_BLOXITY_PORTAL_URL || 'https://bloxity.io';
const API_URL = import.meta.env.VITE_BLOXITY_API_URL || 'https://api.bloxity.io';

let initialized = false;

export function getSDK() {
  return typeof window !== 'undefined' ? window.Legion?.SDK ?? null : null;
}

export function initSDK() {
  const sdk = getSDK();
  if (!sdk) return null; // Local preview remains playable outside the portal.
  if (initialized) return sdk;
  sdk.init?.({ gameSlug: GAME_SLUG, portalUrl: PORTAL_URL, apiUrl: API_URL });
  initialized = true;
  return sdk;
}

export function isEmbedded() {
  return Boolean(getSDK()?.portal?.isEmbeddedInLegion?.());
}
