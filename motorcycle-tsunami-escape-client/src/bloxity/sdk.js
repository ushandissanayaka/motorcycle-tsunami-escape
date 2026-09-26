// Thin wrapper around window.Legion.SDK. Keeps every other module from
// touching the global directly, and gives you one place to add logging /
// mocking for local dev without the script tag loaded.

const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'motorcycle-tsunami-escape';

let initialized = false;

export function getSDK() {
  return typeof window !== 'undefined' ? window.Legion?.SDK ?? null : null;
}

export function initSDK() {
  const sdk = getSDK();
  if (!sdk) return null; // Local preview remains playable outside the portal.
  if (initialized) return sdk;
  sdk.init?.({ gameSlug: GAME_SLUG });
  initialized = true;
  return sdk;
}

export function isEmbedded() {
  return Boolean(getSDK()?.portal?.isEmbeddedInLegion?.());
}
