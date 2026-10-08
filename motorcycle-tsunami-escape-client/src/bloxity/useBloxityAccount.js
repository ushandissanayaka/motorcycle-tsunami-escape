import { useCallback, useEffect, useState } from 'react';
import { getBuxBalance, getFriends, getGuest, onUserChanged } from './bloxity.js';

/**
 * The logged-in Bloxity user (from the game's one auth subscription, see bloxity.js), their Bux balance and
 * their friends, reloaded on every login and cleared on logout; while logged out, the player's guest identity.
 */
export function useBloxityAccount() {
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(null);
  const [balance, setBalance] = useState(null);
  const [friends, setFriends] = useState(null); // null: not loaded yet

  const refreshBalance = useCallback(async () => setBalance(await getBuxBalance()), []);
  const refreshFriends = useCallback(async () => setFriends(await getFriends()), []);

  useEffect(() => onUserChanged((next) => {
    setUser(next);
    setGuest(next ? null : getGuest());
    if (next) {
      refreshBalance();
      refreshFriends();
    } else {
      setBalance(null);
      setFriends(null);
    }
  }), [refreshBalance, refreshFriends]);

  return { user, guest, balance, friends, refreshBalance, refreshFriends };
}
