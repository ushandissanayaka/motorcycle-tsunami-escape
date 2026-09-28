import React, { useEffect, useRef, useState } from 'react';
import BikeSection from './BikeSection.jsx';
import './StartingPlaceHUD.css';

import trophyArt from '../assets/hud/trophy.png';
import shopArt from '../assets/hud/shop.png';
import rebirthArt from '../assets/hud/rebirth.png';
import trailsArt from '../assets/hud/trails.png';
import worldsArt from '../assets/hud/worlds.png';
import winsArt from '../assets/hud/wins.png';
import price75Art from '../assets/hud/price75.png';
import dailyArt from '../assets/hud/daily.png';
import wheelArt from '../assets/hud/wheel.png';
import wavesArt from '../assets/hud/waves.png';
import customTitleArt from '../assets/hud/custom_title.png';
import customBarArt from '../assets/hud/custom_bar.png';
import maxArt from '../assets/hud/max.png';
import speed2xArt from '../assets/hud/speed2x.png';
import price3Art from '../assets/hud/price3.png';
import petsArt from '../assets/hud/pets.png';
import inventoryArt from '../assets/hud/inventory.png';
import trollArt from '../assets/hud/troll.png';
import levelBarArt from '../assets/hud/level_bar.png';
import levelBarEmptyArt from '../assets/hud/level_bar_empty.png';
import pack100kArt from '../assets/hud/pack100k.png';
import pack1mArt from '../assets/hud/pack1m.png';
import pack10mArt from '../assets/hud/pack10m.png';

export const CUSTOM_SPEED_MAX = 116;

/*
 * The HUD art was cut out of the reference screenshot (1919x1004). Every piece is placed at its
 * original screenshot rectangle [x0, y0, x1, y1] and scaled with --u (one screenshot pixel).
 */
const px = (n) => `calc(${n} * var(--u))`;
const boxStyle = ([x0, y0, x1, y1]) => {
  const style = { width: px(x1 - x0), height: px(y1 - y0) };
  if (x0 > 1200) style.right = px(1919 - x1);                 // right column hugs the right edge
  else if (x0 > 500) style.left = `calc(50% + ${px(x0 - 959.5)})`; // bottom bar stays centred
  else style.left = px(x0);
  if (y0 >= 800) style.bottom = px(1004 - y1);                // bottom row hugs the bottom edge
  else style.top = px(y0);
  return style;
};

const BOX = {
  shop: [18, 361, 162, 503], rebirth: [165, 361, 309, 503], trails: [18, 506, 162, 648],
  worlds: [165, 496, 328, 648], wins: [18, 651, 311, 749], price75: [82, 748, 248, 782],
  daily: [1732, 4, 1832, 78], wheel: [1838, 4, 1916, 78], waves: [1425, 20, 1675, 275],
  customTitle: [1662, 222, 1897, 264], customBar: [1636, 258, 1908, 340], max: [1768, 338, 1898, 372],
  speed2x: [1636, 378, 1906, 472], price3: [1698, 470, 1846, 504],
  pets: [1636, 500, 1767, 632], inventory: [1771, 500, 1902, 632], troll: [1771, 634, 1902, 766],
  trophy: [23, 270, 260, 351],
  levelBar: [517, 825, 1403, 893],
  pack100k: [578, 900, 800, 982], pack1m: [803, 900, 1023, 982], pack10m: [1027, 893, 1342, 982],
};

const formatSpeed = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function Art({ src, box, label, onClick, className = '' }) {
  return (
    <button className={`hud-btn art-btn ${className}`} style={boxStyle(box)} aria-label={label} onClick={onClick}>
      <img src={src} alt="" draggable={false} />
    </button>
  );
}

function StaticArt({ src, box }) {
  return <img className="hud-static" style={boxStyle(box)} src={src} alt="" draggable={false} />;
}

export default function StartingPlaceHUD({
  bikes, wins, finishes, notice, onWavesChange, selectedBike, onSelectBike,
  speed, level, levelProgress, customSpeed, onCustomSpeed,
}) {
  const [showGarage, setShowGarage] = useState(false);
  const [wavesDisabled, setWavesDisabled] = useState(false);
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedDraft, setSpeedDraft] = useState('');
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

  // Blur after a click so SPACE (hop) never re-triggers the button that was just pressed.
  const press = (action) => (event) => {
    event.currentTarget.blur();
    action();
  };
  const soon = (text) => press(() => showMessage(text));

  const toggleGarage = press(() => setShowGarage((current) => !current));
  const toggleWaves = press(() => {
    const next = !wavesDisabled;
    setWavesDisabled(next);
    onWavesChange?.(next);
    showMessage(next ? 'Waves disabled.' : 'Waves enabled.');
  });

  const equipped = bikes.find((bike) => bike.id === selectedBike);
  const barFill = speed === 0 ? 0 : levelProgress;

  const startEditingSpeed = () => {
    if (editingSpeed) return;
    setSpeedDraft(formatSpeed(customSpeed));
    setEditingSpeed(true);
  };
  const commitSpeed = () => {
    const value = parseFloat(speedDraft);
    if (Number.isFinite(value)) onCustomSpeed(Math.min(CUSTOM_SPEED_MAX, Math.max(1, value)));
    setEditingSpeed(false);
  };
  const onSpeedKey = (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') setEditingSpeed(false);
  };

  return (
    <div className="starting-hud">
      {/* Top-left: trophy with the live wins count */}
      <button className="hud-btn art-btn wins-btn" style={boxStyle(BOX.trophy)} aria-label={`Wins: ${wins}`} onClick={soon(`You have ${wins.toLocaleString()} ${wins === 1 ? 'win' : 'wins'}.`)}>
        <img className="wins-trophy" src={trophyArt} alt="" draggable={false} />
        <span className="wins-count outlined">{wins.toLocaleString()}</span>
      </button>

      {/* Left menu */}
      <Art src={shopArt} box={BOX.shop} label="Shop" onClick={toggleGarage} />
      <Art src={rebirthArt} box={BOX.rebirth} label="Rebirth" onClick={soon('Rebirths are coming in a later update.')} />
      <Art src={trailsArt} box={BOX.trails} label="Trails" onClick={soon('Trail customization is coming soon.')} />
      <Art src={worldsArt} box={BOX.worlds} label="Worlds" onClick={soon(level >= 75 ? 'World 2 is open. Find the gate!' : 'World 2 unlocks at level 75.')} />
      <Art src={winsArt} box={BOX.wins} label="2x Wins" onClick={soon('Win boosts are coming in a later update.')} />
      <StaticArt src={price75Art} box={BOX.price75} />

      {showGarage && (
        <div className="garage-popover">
          <button className="garage-close" aria-label="Close garage" onClick={press(() => setShowGarage(false))}>X</button>
          <BikeSection bikes={bikes} wins={wins} finishes={finishes} selectedBike={selectedBike} onSelect={onSelectBike} />
        </div>
      )}

      {/* Top-right */}
      <Art src={dailyArt} box={BOX.daily} label="Daily Rewards" onClick={soon('Daily rewards are coming soon.')} />
      <Art src={wheelArt} box={BOX.wheel} label="Wheelspin" onClick={soon('Wheelspin is coming soon.')} />
      <Art src={wavesArt} box={BOX.waves} label={wavesDisabled ? 'Enable waves' : 'Disable waves'} onClick={toggleWaves} className={wavesDisabled ? 'is-off' : ''} />

      {/* Custom speed */}
      <StaticArt src={customTitleArt} box={BOX.customTitle} />
      <div className="hud-btn art-btn speed-bar" role="button" tabIndex={0} aria-label="Custom speed" style={boxStyle(BOX.customBar)} onClick={startEditingSpeed} onKeyDown={(event) => { if (event.key === 'Enter') startEditingSpeed(); }}>
        <img src={customBarArt} alt="" draggable={false} />
        {editingSpeed ? (
          <input
            className="speed-input outlined" type="number" min="1" max={CUSTOM_SPEED_MAX} step="1" autoFocus
            value={speedDraft} onChange={(event) => setSpeedDraft(event.target.value)}
            onBlur={commitSpeed} onKeyDown={onSpeedKey} onFocus={(event) => event.target.select()}
          />
        ) : <span className="speed-value outlined">{formatSpeed(customSpeed)}</span>}
      </div>
      <StaticArt src={maxArt} box={BOX.max} />

      <Art src={speed2xArt} box={BOX.speed2x} label="2x Speed" onClick={soon('2x Speed is a premium boost - coming soon.')} />
      <StaticArt src={price3Art} box={BOX.price3} />
      <Art src={petsArt} box={BOX.pets} label="Pets" onClick={soon('Pets are coming soon.')} />
      <Art src={inventoryArt} box={BOX.inventory} label="Inventory" onClick={soon(`Equipped: ${equipped?.name ?? 'none'}. Wins: ${wins.toLocaleString()}.`)} />
      <Art src={trollArt} box={BOX.troll} label="Troll" onClick={soon('Troll tools are coming soon.')} />

      {/* Bottom: speed, level, speed packs */}
      <div className="speed-readout outlined">{speed.toLocaleString()} Speed</div>
      <div className="level-bar" style={boxStyle(BOX.levelBar)}>
        <img className="level-empty" src={levelBarEmptyArt} alt="" draggable={false} />
        <img className="level-full" src={levelBarArt} alt="" draggable={false} style={{ clipPath: `inset(0 ${100 - barFill}% 0 0)` }} />
        <span className="level-name outlined">Level {level}</span>
        <span className="level-count outlined">{levelProgress.toLocaleString()}/100</span>
      </div>
      <Art src={pack100kArt} box={BOX.pack100k} label="+100K speed" onClick={soon('The +100K speed pack is coming soon.')} />
      <Art src={pack1mArt} box={BOX.pack1m} label="+1M speed" onClick={soon('The +1M speed pack is coming soon.')} />
      <Art src={pack10mArt} box={BOX.pack10m} label="+10M speed" onClick={soon('The +10M speed pack is coming soon.')} />

      {toast && <div className="game-toast" role="status">{toast}</div>}
    </div>
  );
}
