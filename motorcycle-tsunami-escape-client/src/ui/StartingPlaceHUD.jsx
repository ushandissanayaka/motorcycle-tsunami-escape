import React, { useEffect, useRef, useState } from 'react';
import MenuPopups from './MenuPopups.jsx';
import { levelTarget } from '../shared/constants.js';
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
import aetheruneBikeArt from '../assets/popups/inventory_bike.png';
import pack100kArt from '../assets/hud/pack100k.png';
import pack1mArt from '../assets/hud/pack1m.png';
import pack10mArt from '../assets/hud/pack10m.png';
import teleportBackArt from '../assets/hud/teleport_back.png';

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

// The loading ring behind the purchase dialog: a comet-like arc, thickest at its round head and tapering to a
// hairline along its tail, which also fades out (a conic mask in the CSS). One filled path, built once.
const SPINNER_PATH = (() => {
  const RADIUS = 45;
  const SWEEP = 300; // degrees from the tail to the head
  const STEPS = 60;
  const HEAD = 7;
  const TAIL = 0.5;
  const point = (degrees, radius) => {
    const angle = (degrees * Math.PI) / 180;
    return `${(50 + radius * Math.cos(angle)).toFixed(2)} ${(50 + radius * Math.sin(angle)).toFixed(2)}`;
  };
  const outer = [];
  const inner = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const half = (TAIL + (HEAD - TAIL) * t ** 1.6) / 2;
    outer.push(point(t * SWEEP, RADIUS + half));
    inner.push(point(t * SWEEP, RADIUS - half));
  }
  return `M${outer.join(' L')} A${HEAD / 2} ${HEAD / 2} 0 0 1 ${inner[STEPS]} L${inner.reverse().join(' L')} Z`;
})();

/** The Teleport Back item's icon: a red-knobbed joystick on a blue base. */
function TeleportIcon() {
  return (
    <svg className="purchase-teleport-icon" viewBox="0 0 68 68" aria-hidden="true">
      <path d="M12 46 34 36l22 10-22 11z" fill="#3f7fe0" />
      <path d="M12 46v6l22 11V57zM56 46v6L34 63V57z" fill="#2a58a8" />
      <ellipse cx="34" cy="46" rx="6" ry="3" fill="#1d3d78" />
      <path d="M31.5 46 29 22h5l2.5 24z" fill="#c9ccd6" />
      <circle cx="30" cy="17" r="10" fill="#ef3b4f" />
      <circle cx="26.5" cy="13.5" r="3.4" fill="#ff9aa6" />
    </svg>
  );
}

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
  speed, level, levelProgress, customSpeed, onCustomSpeed, onGrantSpeed, onGrantWins, bikePurchaseOpen = false, aetherunePurchaseOpen = false, premiumBoardPurchase = null, onClosePurchase,
  teleportBackOffer = false, winsPurchaseOpen = false, rewardBanner = null,
}) {
  const [menuPopup, setMenuPopup] = useState('daily'); // greet the player with Daily Rewards on load
  const [shopPurchase, setShopPurchase] = useState(null);
  const [wavesDisabled, setWavesDisabled] = useState(false);
  const [showWavePurchase, setShowWavePurchase] = useState(false);
  const [showTeleportPurchase, setShowTeleportPurchase] = useState(false);
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedDraft, setSpeedDraft] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Big gold "You received N Wins!" across the top for a moment (its CSS animation fades it out).
  useEffect(() => {
    if (!rewardBanner) return undefined;
    setBanner(rewardBanner);
    const timer = setTimeout(() => setBanner(null), 2800);
    return () => clearTimeout(timer);
  }, [rewardBanner]);

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

  const toggleMenu = (name) => press(() => setMenuPopup((current) => (current === name ? null : name)));
  const closePurchase = () => {
    setShopPurchase(null);
    setShowWavePurchase(false);
    setShowTeleportPurchase(false);
    onClosePurchase?.();
  };
  const toggleWaves = press(() => {
    if (wavesDisabled) {
      setWavesDisabled(false);
      onWavesChange?.(false);
      showMessage('Waves enabled.');
      return;
    }
    setShowWavePurchase(true);
  });

  const bigOffer = bikePurchaseOpen || aetherunePurchaseOpen || (shopPurchase?.price ?? 0) > 500;
  const currentLevelTarget = levelTarget(level);
  const barFill = speed === 0 ? 0 : (levelProgress / currentLevelTarget) * 100;

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
      <Art src={shopArt} box={BOX.shop} label="Shop" onClick={toggleMenu('shop')} />
      <Art src={rebirthArt} box={BOX.rebirth} label="Rebirth" onClick={toggleMenu('rebirth')} />
      <Art src={trailsArt} box={BOX.trails} label="Trails" onClick={toggleMenu('trails')} />
      <Art src={worldsArt} box={BOX.worlds} label="Worlds" onClick={toggleMenu('worlds')} />
      <Art src={winsArt} box={BOX.wins} label="2x Wins" onClick={soon('Win boosts are coming in a later update.')} />
      <StaticArt src={price75Art} box={BOX.price75} />

      <MenuPopups
        popup={menuPopup} level={level} onClose={() => setMenuPopup(null)} onBuy={setShopPurchase} onMessage={showMessage}
        onGrantSpeed={onGrantSpeed} onGrantWins={onGrantWins}
        bikes={bikes} wins={wins} finishes={finishes} selectedBike={selectedBike} onSelectBike={onSelectBike}
      />

      {/* Top-right */}
      <Art src={dailyArt} box={BOX.daily} label="Daily Rewards" onClick={toggleMenu('daily')} />
      <Art src={wheelArt} box={BOX.wheel} label="Wheelspin" onClick={toggleMenu('wheel')} />
      <Art src={wavesArt} box={BOX.waves} label={wavesDisabled ? 'Enable waves' : 'Disable waves'} onClick={toggleWaves} className={wavesDisabled ? 'is-off' : ''} />

      {/* Offered while a wave's wreckage settles and for a while after the respawn */}
      {teleportBackOffer && (
        <button className="hud-btn teleport-back-btn" aria-label="Teleport Back for 9 Robux" onClick={press(() => setShowTeleportPurchase(true))}>
          <img src={teleportBackArt} alt="" draggable={false} />
        </button>
      )}

      {(showTeleportPurchase || winsPurchaseOpen || showWavePurchase || bikePurchaseOpen || aetherunePurchaseOpen || premiumBoardPurchase || shopPurchase) && (
        <div className="purchase-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePurchase(); }}>
          <svg className="purchase-spinner" viewBox="0 0 100 100" role="img" aria-label="Loading">
            <path d={SPINNER_PATH} />
          </svg>
          <section className="purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="wave-purchase-title">
            <header className="purchase-header">
              <h2 id="wave-purchase-title">Buy Robux and item</h2>
              <span className="robux-balance" aria-label="0 Robux"><b>⬡</b> 0</span>
              <button className="purchase-close" aria-label="Close" onClick={closePurchase}>×</button>
            </header>
            <div className="purchase-item">
              {showTeleportPurchase ? <TeleportIcon />
                : winsPurchaseOpen ? <span className="purchase-bike-icon" aria-hidden="true">🏆</span>
                : shopPurchase ? <img src={shopPurchase.img} alt="" />
                : aetherunePurchaseOpen ? <img src={aetheruneBikeArt} alt="" />
                : bikePurchaseOpen ? <span className="purchase-bike-icon" aria-hidden="true">🏍️</span>
                : premiumBoardPurchase ? (
                  <svg className="purchase-treadmill-icon" viewBox="0 0 80 68" aria-hidden="true">
                    <path d="M11 39 53 52 69 45 27 32z" fill="#171b27" stroke="#d6d9e2" strokeWidth="2.5" />
                    <path d="m18 41 40 12M24 36l40 12M16 42l-4 14m45-5 5 11M25 32l-2-13m-7 14 13-2m-6-12h18v11H23z" fill="none" stroke={premiumBoardPurchase === '25x' ? '#e5c4ff' : premiumBoardPurchase === '3x' ? '#ffe898' : '#c8d2e5'} strokeWidth="2.5" strokeLinejoin="round" />
                    <path d="M27 21h10v6H27z" fill={premiumBoardPurchase === '25x' ? '#bf62ff' : premiumBoardPurchase === '3x' ? '#ffc21a' : '#438dff'} />
                  </svg>
                ) : <img src={wavesArt} alt="" />}
              <div><strong>{showTeleportPurchase ? 'Teleport Back' : winsPurchaseOpen ? '2x Wins' : shopPurchase ? shopPurchase.name : aetherunePurchaseOpen ? 'Aetherune Bike' : bikePurchaseOpen ? 'Astralwing Bike (LIMITED!)' : premiumBoardPurchase ? `x${premiumBoardPurchase.replace('x', '')} Speed Treadmill` : 'Disable Waves'}</strong><span><b>⬡</b> {showTeleportPurchase ? '9' : winsPurchaseOpen ? '75' : shopPurchase ? shopPurchase.price : aetherunePurchaseOpen ? '699' : bikePurchaseOpen ? '999' : premiumBoardPurchase === '3x' ? '29' : premiumBoardPurchase === '9x' ? '85' : premiumBoardPurchase === '25x' ? '225' : premiumBoardPurchase === '100x' ? '449' : '19'}</span></div>
            </div>
            <div className="robux-offer"><span><b>⬡</b> {bigOffer ? '1,000' : '500'} <del><b>⬡</b> {bigOffer ? '800' : '400'}</del></span><strong>{bigOffer ? '$9.99' : '$4.99'}</strong></div>
            <button className="purchase-buy" onClick={() => showMessage('Purchases are not available yet.')}>Buy</button>
            <p className="purchase-terms">Your payment method will be charged. Roblox <u>Terms of Use</u> apply.</p>
          </section>
        </div>
      )}

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
      <Art src={petsArt} box={BOX.pets} label="Pets" onClick={toggleMenu('pets')} />
      <Art src={inventoryArt} box={BOX.inventory} label="Inventory" onClick={toggleMenu('inventory')} />
      <Art src={trollArt} box={BOX.troll} label="Troll" onClick={soon('Troll tools are coming soon.')} />

      {/* Bottom: speed, level, speed packs */}
      <div className="speed-readout outlined">{speed.toLocaleString()} Speed</div>
      <div className="level-bar" style={boxStyle(BOX.levelBar)}>
        <img className="level-empty" src={levelBarEmptyArt} alt="" draggable={false} />
        <img className="level-full" src={levelBarArt} alt="" draggable={false} style={{ clipPath: `inset(0 ${100 - barFill}% 0 0)` }} />
        <span className="level-name outlined">Level {level}</span>
        <span className="level-count outlined">{levelProgress.toLocaleString()}/{currentLevelTarget.toLocaleString()}</span>
      </div>
      <Art src={pack100kArt} box={BOX.pack100k} label="+100K speed" onClick={soon('The +100K speed pack is coming soon.')} />
      <Art src={pack1mArt} box={BOX.pack1m} label="+1M speed" onClick={soon('The +1M speed pack is coming soon.')} />
      <Art src={pack10mArt} box={BOX.pack10m} label="+10M speed" onClick={soon('The +10M speed pack is coming soon.')} />

      {toast && <div className="game-toast" role="status">{toast}</div>}
      {banner && <div key={banner.id} className="reward-banner" role="status" data-text={banner.text}>{banner.text}</div>}
    </div>
  );
}
