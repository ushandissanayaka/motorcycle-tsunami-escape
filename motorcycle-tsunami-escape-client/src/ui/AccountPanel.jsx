import React, { useState } from 'react';
import { getInviteLink, inviteFriend, logIn, logOut, showAvatarCustomizer } from '../bloxity/bloxity.js';
import BuxIcon from './BuxIcon.jsx';
import './AccountPanel.css';

const DEFAULT_PFP = 'https://static.bloxity.io/img/pfps/0.png?width=128&quality=85';

/** "Online", "In <game>", "Away" or "Offline" for a friend's presence. */
function presenceText(presence) {
  const status = presence?.status ?? 'offline';
  if (status === 'in-game' || status === 'in_game') {
    const game = presence.gameName || presence.currentGame;
    return { status: 'in-game', text: game ? `In ${game}` : 'In a game' };
  }
  if (status === 'online') return { status, text: 'Online' };
  if (status === 'away') return { status, text: 'Away' };
  return { status: 'offline', text: 'Offline' };
}

/**
 * The player's Bloxity account, top right as in the reference: a dark pill with their picture, their name and
 * under it "Guest" (logged out: pressing it logs in) or their Bux. Logged in, it opens a panel with their
 * friends (invite them into this room), an invite link, the avatar customizer and log out.
 * `account` comes from useBloxityAccount.
 */
export default function AccountPanel({ account, onMessage }) {
  const { user, guest, balance, friends, refreshBalance, refreshFriends } = account;
  const [open, setOpen] = useState(false);

  // Blur after a click so SPACE (hop) never re-triggers the button that was just pressed.
  const press = (action) => (event) => {
    event.currentTarget.blur();
    action();
  };

  const name = user ? user.displayName || user.username : guest?.username || 'Guest';
  const picture = (user ?? guest)?.pfp || DEFAULT_PFP;
  const toggle = press(() => {
    if (!user) {
      logIn();
      return;
    }
    if (!open) {
      refreshBalance();
      refreshFriends();
    }
    setOpen(!open);
  });
  const invite = (friend) => press(async () => {
    const sent = await inviteFriend(friend._id);
    onMessage(sent ? `Invite sent to ${friend.displayName || friend.username}!` : 'The invite could not be sent.');
  });
  const copyInvite = press(async () => {
    try {
      await navigator.clipboard.writeText(getInviteLink());
      onMessage('Invite link copied!');
    } catch {
      onMessage('Could not copy the invite link.');
    }
  });

  return (
    <div className="account-panel">
      <button
        className="account-chip" onClick={toggle} aria-expanded={user ? open : undefined}
        aria-label={user ? `${name}'s account` : `Playing as ${name}, a guest. Log in`}
        title={user ? undefined : 'Log in with Bloxity'}
      >
        <img src={picture} alt="" draggable={false} />
        <span className="account-text">
          <span className="account-name">{name}</span>
          <span className="account-sub">
            {!user ? 'Guest' : balance !== null ? <><BuxIcon /> {balance.toLocaleString()}</> : `@${user.username}`}
          </span>
        </span>
      </button>

      {user && open && (
        <section className="account-menu">
          <header>
            <strong>{name}</strong>
            <small>@{user.username}</small>
          </header>
          <h3>Friends</h3>
          <div className="account-friends">
            {friends === null && <p className="account-empty">Loading...</p>}
            {friends?.length === 0 && <p className="account-empty">No friends yet. Add some on bloxity.io!</p>}
            {friends?.map((friend) => {
              const { status, text } = presenceText(friend.presence);
              return (
                <div key={friend._id} className="account-friend">
                  <img src={friend.pfp || DEFAULT_PFP} alt="" draggable={false} />
                  <div>
                    <strong>{friend.displayName || friend.username}</strong>
                    <small className={`presence presence-${status}`}>{text}</small>
                  </div>
                  <button onClick={invite(friend)}>Invite</button>
                </div>
              );
            })}
          </div>
          <div className="account-actions">
            <button onClick={copyInvite}>Copy invite link</button>
            <button onClick={press(() => showAvatarCustomizer())}>Avatar</button>
            <button className="account-logout" onClick={press(() => { setOpen(false); logOut(); })}>Log out</button>
          </div>
        </section>
      )}
    </div>
  );
}
