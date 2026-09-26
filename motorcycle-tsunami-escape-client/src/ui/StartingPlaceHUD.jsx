import React, { useEffect, useRef, useState } from 'react';
import BikeSection from './BikeSection.jsx';
import './StartingPlaceHUD.css';

const ICONS = {
  bikes: '\u{1F3CD}', shop: '\u{1F6D2}', rebirth: '\u{1F504}',
  trails: '\u{2728}', worlds: '\u{1F30E}', wins: '\u{1F3C6}',
  troll: '\u{1F608}', pets: '\u{1F43E}', rewards: '\u{1F381}', wheel: '\u{1F3A1}',
};

function ActionTile({ icon, label, tone, onClick, detail }) {
  return (
    <button className={`action-tile ${tone}`} onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
    </button>
  );
}

export default function StartingPlaceHUD({
  bikes, wins, finishes, notice, zone, onWavesChange, selectedBike, onSelectBike, onEarnWin,
  speed, onCollectSpeed, level, levelProgress, customSpeed, onCustomSpeed,
}) {
  const [showGarage, setShowGarage] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [wavesDisabled, setWavesDisabled] = useState(false);
  const [doubleSpeed, setDoubleSpeed] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (notice) showMessage(notice.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  const showMessage = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  const invitePlayer = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showMessage('Game link copied. Invite a friend to the hub!');
    } catch {
      showMessage('Share this page link with a friend to meet in the hub.');
    }
  };

  const openGarage = () => setShowGarage((current) => !current);

  return (
    <div className="starting-hud">
      <nav className="top-toolbar" aria-label="Game controls">
        <button className="toolbar-square brand-square" onClick={() => showMessage('Motorcycle Tsunami Escape')}>M</button>
        <button className="toolbar-square menu-square" aria-label="Menu" onClick={() => showMessage('You are in the Starting Place')}><span /><span /><span /></button>
        <button className="toolbar-pill" onClick={() => setMusicOn((value) => !value)}>Music <b>{musicOn ? 'ON' : 'OFF'}</b></button>
        <button className="toolbar-pill invite-pill" onClick={invitePlayer}><span>{'\u{1F4E8}'}</span> Invite Player</button>
      </nav>

      {zone === 'lucky' && (
        <header className="center-game-title">
          <div className="game-title-main">LUCKY BLOCKS</div>
          <div className="game-title-sub">Open Lucky Blocks for Brainrot Pets!</div>
        </header>
      )}

      <section className="event-card">
        <div className="event-art"><span>{'\u{1F3C1}'}</span><b>RIDE<br />TOGETHER</b></div>
        <div className="event-copy"><span className="event-kicker">STARTING PLACE EVENT</span><strong>Ready to ride?</strong><small>Explore the hub and find your next bike.</small></div>
        <button onClick={openGarage}>OPEN GARAGE</button>
      </section>

      <div className="top-stats">
        <div className="stat-chip wins-chip"><span>{ICONS.wins}</span><strong>{wins}</strong><small>WINS</small></div>
        <div className="stat-chip bux-chip"><span>B</span><strong>0</strong><small>BUX</small></div>
      </div>

      <section className="left-action-grid" aria-label="Game menu">
        <ActionTile icon={ICONS.bikes} label="Bikes" tone="tile-yellow" onClick={openGarage} detail="Garage" />
        <ActionTile icon={ICONS.shop} label="Shop" tone="tile-blue" onClick={() => showMessage('Earn wins to unlock the bikes in your garage.')} />
        <ActionTile icon={ICONS.rebirth} label="Rebirth" tone="tile-blue" onClick={() => showMessage('Rebirths are coming in a later update.')} />
        <ActionTile icon={ICONS.trails} label="Trails" tone="tile-purple" onClick={() => showMessage('Trail customization is coming soon.')} />
        <ActionTile icon={ICONS.worlds} label="Worlds" tone="tile-green" onClick={() => showMessage('World 2 unlocks at level 75.')} detail="NEW" />
        <ActionTile icon={ICONS.wins} label="2x Wins" tone="tile-orange" onClick={() => showMessage('Win boosts are coming in a later update.')} detail="COMING SOON" />
      </section>

      {showGarage && (
        <div className="garage-popover">
          <button className="garage-close" aria-label="Close garage" onClick={() => setShowGarage(false)}>X</button>
          <BikeSection bikes={bikes} wins={wins} finishes={finishes} selectedBike={selectedBike} onSelect={onSelectBike} onEarnWin={onEarnWin} />
        </div>
      )}

      <div className="reward-buttons">
        <button className="reward-daily" onClick={() => showMessage('Daily rewards are coming soon.')}><span>{ICONS.rewards}</span><b>Daily<br />Rewards</b></button>
        <button className="reward-wheel" onClick={() => showMessage('Wheelspin is coming soon.')}><span>{ICONS.wheel}</span><b>Wheelspin</b></button>
      </div>

      <aside className="right-game-panel">
        <div className="bux-ribbon">B 0</div>
        <button className={`waves-button ${wavesDisabled ? 'turned-off' : ''}`} onClick={() => { const next = !wavesDisabled; setWavesDisabled(next); onWavesChange?.(next); }}>
          <span>{wavesDisabled ? 'WAVES OFF' : 'DISABLE WAVES'}</span>
        </button>
        <div className="custom-speed-card">
          <label htmlFor="custom-speed">Custom Speed</label>
          <input id="custom-speed" type="range" min="1" max="88" value={customSpeed} onChange={(event) => onCustomSpeed(Number(event.target.value))} />
          <div className="speed-slider-value">{customSpeed}<small>MAX: 88</small></div>
        </div>
        <button className={`double-speed-button ${doubleSpeed ? 'active' : ''}`} onClick={() => setDoubleSpeed((value) => !value)}><span>2x Speed</span><small>{doubleSpeed ? 'ACTIVE' : 'FREE PREVIEW'}</small></button>
        <div className="right-utility-row">
          <ActionTile icon={ICONS.troll} label="Troll" tone="tile-purple" onClick={() => showMessage('Troll tools are coming soon.')} />
          <ActionTile icon={ICONS.pets} label="Pets" tone="tile-yellow" onClick={() => showMessage('Pets are coming soon.')} />
        </div>
      </aside>

      <section className="speed-readout"><strong>{speed.toLocaleString()} Speed</strong><small>RIDE TO BUILD YOUR SPEED</small></section>
      <section className="level-meter">
        <div className="level-fill" style={{ width: `${levelProgress}%` }} />
        <strong>Level {level}</strong><span>{levelProgress}/100</span>
      </section>
      <div className="pickup-row">
        <button onClick={() => onCollectSpeed(100_000)}><span>{'\u{1F45F}'}</span> +100K</button>
        <button onClick={() => onCollectSpeed(1_000_000)}><span>{'\u{1F45F}'}</span> +1M</button>
        <button onClick={() => onCollectSpeed(10_000_000)}><span>{'\u{2B50}'}</span> +10M Speed</button>
      </div>
      <div className="drive-hint"><b>W A S D</b> Ride <b>SPACE</b> Hop <b>SCROLL / PINCH</b> Zoom <b>RIGHT-CLICK DRAG</b> Rotate</div>
      {toast && <div className="game-toast" role="status">{toast}</div>}
    </div>
  );
}
