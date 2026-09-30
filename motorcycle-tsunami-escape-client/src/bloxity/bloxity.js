import { getSDK, initSDK } from './sdk.js';

/**
 * The game's one way into the Bloxity SDK (window.Legion.SDK): auth, Bux, friends, settings, rooms, player
 * events and avatar. Nothing else in the game touches the SDK directly.
 *
 * Every function is safe without the SDK (a local preview without its script tag, or if it failed to load):
 * it does nothing, or resolves to an empty answer.
 *
 * Auth has a single SDK subscription (onUserChanged) for the whole game, shared out to every `onUserChanged`
 * listener here, and the user is never kept anywhere else: read it with getUser() or from that callback.
 */

const sdk = () => getSDK();
const noop = () => {};

// ---- Setup ----------------------------------------------------------------------------------------------

const userListeners = new Set();
let userSubscribed = false;

/** Initialises the SDK (once) and opens the game's one auth subscription. Call first, on startup. */
export function startBloxity() {
  try {
    initSDK();
  } catch (error) {
    console.info('Bloxity SDK could not start:', error);
  }
  const auth = sdk()?.auth;
  if (userSubscribed || !auth?.onUserChanged) return;
  userSubscribed = true;
  // Fires at once with the current state, then on every login / logout.
  auth.onUserChanged((user) => {
    for (const listener of userListeners) listener(user ?? null);
  });
}

// ---- Auth -----------------------------------------------------------------------------------------------

/** The logged-in Bloxity user ({ _id, username, displayName?, pfp?, ... }), or null. */
export const getUser = () => sdk()?.auth?.getUser?.() ?? null;
export const isLoggedIn = () => Boolean(sdk()?.auth?.isLoggedIn?.());
/** While logged out, the guest identity Bloxity gives the player ({ username, pfp }), or null. */
export const getGuest = () => sdk()?.auth?.getGuest?.() ?? null;

/** Calls `listener(user | null)` now and on every login / logout; returns the unsubscribe. */
export function onUserChanged(listener) {
  userListeners.add(listener);
  listener(getUser());
  return () => userListeners.delete(listener);
}

/** Opens Bloxity's login (an in-game modal when embedded, a popup window standalone); resolves to the user or null. */
export async function logIn() {
  try {
    return (await sdk()?.auth?.showAuthPopup?.()) ?? null;
  } catch {
    return null;
  }
}

export const logOut = () => sdk()?.auth?.logout?.();

/** Proves the logged-in user to this game's server (POST { token, user } to `url`); resolves to its answer or null. */
export async function authenticateWithServer(url) {
  try {
    return (await sdk()?.auth?.authenticateWithServer?.(url)) ?? null;
  } catch {
    return null;
  }
}

// ---- Bux ------------------------------------------------------------------------------------------------

/** Buys `sku` (the price comes from the server catalog); resolves to { success, transactionId?, error? }. */
export async function purchase(sku, metadata) {
  const bux = sdk()?.bux;
  if (!bux?.requestPurchase) return { success: false, error: 'Bloxity is not available here' };
  try {
    return (await bux.requestPurchase(sku, metadata)) ?? { success: false };
  } catch (error) {
    return { success: false, error: error?.message || 'Purchase failed' };
  }
}

/** The user's Bux balance, or null when it can't be read (logged out, no SDK). */
export async function getBuxBalance() {
  try {
    const balance = await sdk()?.bux?.getBalance?.();
    return Number.isFinite(balance) ? balance : null;
  } catch {
    return null;
  }
}

// ---- Friends --------------------------------------------------------------------------------------------

/** The user's friends with their presence, or [] when logged out. */
export async function getFriends() {
  if (!isLoggedIn()) return [];
  try {
    return (await sdk()?.social?.getFriends?.()) ?? [];
  } catch {
    return [];
  }
}

/** Invites a friend into the current room (set with updateRoom when the room was joined). */
export async function inviteFriend(userId) {
  try {
    return Boolean(await sdk()?.social?.inviteFriend?.(userId));
  } catch {
    return false;
  }
}

/** A shareable link straight into the current room. */
export const getInviteLink = () => sdk()?.social?.getInviteFriendsLink?.() ?? window.location.href;

// ---- Rooms and lifecycle --------------------------------------------------------------------------------

/** Tells Bloxity which room the player is in, so friends can join it ('' when not in one). */
export const updateRoom = (roomId, partyId) => sdk()?.game?.updateRoom?.(roomId ?? '', partyId);
/** From the netcode: someone joined the player's room / was already there (Bloxity toasts friends). */
export const playerJoined = (username) => sdk()?.game?.playerJoined?.(username);
export const playerInRoom = (username) => sdk()?.game?.playerInRoom?.(username);

// ---- Settings -------------------------------------------------------------------------------------------

/**
 * Calls `listener(value)` (always a string) now and whenever the player changes `key` in the portal menu.
 * Registering a key is also what shows its control in that menu, so only register the ones the game uses.
 */
export const listenSetting = (key, listener) => sdk()?.settings?.listen?.(key, listener) ?? noop;
/** Replays every setting to its listeners once, to apply them all on load. */
export const applyAllSettings = () => sdk()?.settings?.triggerAll?.();

// ---- Player events and portal ---------------------------------------------------------------------------

/** `listener(event, data)` for 'respawn_request', 'chat_message_sent' and 'pointer_lock_changed'; returns the unsubscribe. */
export const onPlayerEvent = (listener) => sdk()?.player?.onEvent?.(listener) ?? noop;
export const isEmbedded = () => Boolean(sdk()?.portal?.isEmbeddedInLegion?.());
/** Opens the portal's pause menu. The game doesn't lock the pointer, so the menu mustn't re-lock it on Resume. */
export const showPortalMenu = () => sdk()?.portal?.showMenu?.(false);
export function setFullscreen(on) {
  try {
    if (on) sdk()?.portal?.requestFullscreen?.();
    else sdk()?.portal?.exitFullscreen?.();
  } catch {
    // Standalone browsers only allow fullscreen from a click; the portal handles it when embedded.
  }
}

// ---- Avatar ---------------------------------------------------------------------------------------------

export const showAvatarCustomizer = () => sdk()?.avatar?.showCustomizer?.();
/** { height, headScale, ... } (all 1 by default), or null without the SDK. */
export const getProportions = () => sdk()?.avatar?.getProportions?.() ?? null;
export const onProportionsChanged = (listener) => sdk()?.avatar?.onProportionsChanged?.(listener) ?? noop;
