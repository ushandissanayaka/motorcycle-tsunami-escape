import React, { useEffect, useRef, useState } from 'react';
import { clock, press, px, readStore, writeStore } from './popupParts.jsx';

import wheelBase from '../assets/popups/wheel_base.png';
import wheelDisc from '../assets/popups/wheel_disc.png';
import wheelHub from '../assets/popups/wheel_hub.png';
import wheelPointer from '../assets/popups/wheel_pointer.png';
import wheelSpin from '../assets/popups/wheel_spin.png';
import wheelBuy1 from '../assets/popups/wheel_buy1.png';
import wheelBuy3 from '../assets/popups/wheel_buy3.png';
import wheelBuy5 from '../assets/popups/wheel_buy5.png';
import wheelBuy10 from '../assets/popups/wheel_buy10.png';
import wheelIcon from '../assets/hud/wheel.png';

const STORE_KEY = 'mte-wheelspin';
const FREE_SPIN_EVERY = 15 * 3600 * 1000;
const FIRST_FREE_SPIN = (14 * 3600 + 49 * 60 + 26) * 1000;
const SPIN_MS = 5000;

// Clockwise from the pointer; each segment is 60 degrees. Weights are the wheel's printed odds.
const PRIZES = [
  { label: 'Flame Strike', weight: 10 },
  { label: '100K Speed', weight: 5, speed: 100000 },
  { label: '10K Speed', weight: 15, speed: 10000 },
  { label: 'Orange Trail', weight: 12 },
  { label: '1K Speed', weight: 40, speed: 1000 },
  { label: '250 Wins', weight: 15, wins: 250 },
];

const BUY = [
  { art: wheelBuy1, box: [353, 206, 621, 313], spins: 1, price: 29 },
  { art: wheelBuy3, box: [372, 314, 639, 426], spins: 3, price: 49 },
  { art: wheelBuy5, box: [372, 427, 639, 538], spins: 5, price: 99 },
  { art: wheelBuy10, box: [353, 535, 645, 660], spins: 10, price: 190 },
];

// x is measured from the screen centre, y from the top (the wheel reference is 1:1 with the HUD).
const place = ([x0, y0, x1, y1]) => ({ left: `calc(50% + ${px(x0)})`, top: px(y0), width: px(x1 - x0), height: px(y1 - y0) });

function pickPrize() {
  let roll = Math.random() * PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
  return PRIZES.findIndex((prize) => (roll -= prize.weight) < 0);
}

function refreshFreeSpins(state, now) {
  if (now < state.nextFree) return state;
  const earned = 1 + Math.floor((now - state.nextFree) / FREE_SPIN_EVERY);
  return { spins: state.spins + earned, nextFree: state.nextFree + earned * FREE_SPIN_EVERY };
}

export default function WheelSpin({ onClose, onMessage, onBuy, onGrantSpeed, onGrantWins }) {
  const [state, setState] = useState(() => readStore(STORE_KEY, () => ({ spins: 3, nextFree: Date.now() + FIRST_FREE_SPIN })));
  const [now, setNow] = useState(Date.now);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spinningRef = useRef(false);

  useEffect(() => writeStore(STORE_KEY, state), [state]);
  useEffect(() => {
    const tick = () => {
      const time = Date.now();
      setNow(time);
      setState((current) => refreshFreeSpins(current, time));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const spin = () => {
    if (spinningRef.current) return;
    if (state.spins <= 0) {
      onMessage(`No spins left! Buy spins or wait ${clock(state.nextFree - now)} for a free one.`);
      return;
    }
    const index = pickPrize();
    const jitter = (Math.random() - 0.5) * 44;
    const target = (((-index * 60 + jitter) % 360) + 360) % 360;
    setAngle((current) => current - (current % 360) + 360 * 6 + target);
    setState((current) => ({ ...current, spins: current.spins - 1 }));
    spinningRef.current = true;
    setSpinning(true);
    setTimeout(() => {
      const prize = PRIZES[index];
      if (prize.speed) onGrantSpeed(prize.speed);
      if (prize.wins) onGrantWins(prize.wins);
      onMessage(`You won ${prize.label}!`);
      spinningRef.current = false;
      setSpinning(false);
    }, SPIN_MS + 150);
  };

  return (
    <div className="wheel-overlay menu-popup" role="dialog" aria-label="Wheelspin">
      <div className="wheel-backdrop" onMouseDown={onClose} />
      <img className="wheel-part" src={wheelBase} style={place([-337, 52, 337, 754])} alt="" draggable={false} />
      <img className="wheel-part wheel-disc" src={wheelDisc} alt="" draggable={false}
        style={{ ...place([-281, 136, 281, 698]), transform: `rotate(${angle}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : '0ms' }} />
      <img className="wheel-part" src={wheelHub} style={place([-47, 371, 47, 465])} alt="" draggable={false} />
      <img className="wheel-part" src={wheelPointer} style={place([-45, 56, 45, 174])} alt="" draggable={false} />
      {BUY.map((item) => (
        <button key={item.spins} className="popup-card wheel-buy" style={place(item.box)} aria-label={`Buy ${item.spins} spins`}
          onClick={press(() => onBuy({ name: `${item.spins} Wheel ${item.spins === 1 ? 'Spin' : 'Spins'}`, price: item.price, img: wheelIcon }))}>
          <img src={item.art} alt="" draggable={false} />
        </button>
      ))}
      <button className="popup-card wheel-spin-button" onClick={press(spin)} aria-label="Spin the wheel">
        <img src={wheelSpin} alt="" draggable={false} />
        <span>Spin ({state.spins})</span>
      </button>
      <span className="wheel-free-spin">+1 Free Spin in: {clock(state.nextFree - now)}</span>
    </div>
  );
}
