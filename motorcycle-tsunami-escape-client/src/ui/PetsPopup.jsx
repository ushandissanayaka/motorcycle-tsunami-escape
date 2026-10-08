import React, { useState } from 'react';
import { frame, press, px } from './popupParts.jsx';

import petsShell from '../assets/popups/pets_shell.png';
import petsClose from '../assets/popups/pets_close.png';
import petsPlus1 from '../assets/popups/pets_plus1.png';
import petsPlus2 from '../assets/popups/pets_plus2.png';
import petsEquip from '../assets/popups/pets_equip.png';
import petsDelete from '../assets/popups/pets_delete.png';
import petsPencil from '../assets/popups/pets_pencil.png';
import petsLock from '../assets/popups/pets_lock.png';

// The Pets reference screenshot was captured 1.31x larger than the HUD reference.
const S = 1.31;
const box = ([x0, y0, x1, y1], m = 0) => ({ left: px((x0 - m) / S), top: px((y0 - m) / S), width: px((x1 - x0 + 2 * m) / S), height: px((y1 - y0 + 2 * m) / S) });

function Piece({ art, area, m = 0, onClick, label, className = '' }) {
  return (
    <button className={`popup-card ${className}`} style={box(area, m)} onClick={press(onClick)} aria-label={label}>
      <img src={art} alt="" draggable={false} />
    </button>
  );
}

export default function PetsPopup({ onClose, onMessage }) {
  const [search, setSearch] = useState('');
  const noPets = () => onMessage("You don't have any pets yet.");
  return (
    <section className="menu-popup" style={frame(1356 / S, 784 / S)} role="dialog" aria-label="Pets">
      <img className="menu-popup-shell" src={petsShell} alt="" draggable={false} />
      <span className="pets-title" style={{ left: px(4 / S), top: px(-6 / S), fontSize: px(98 / S) }}>Pets</span>
      <Piece art={petsPlus1} area={[464, 26, 513, 75]} label="More pet equip slots" onClick={() => onMessage('More pet equip slots are coming soon.')} />
      <Piece art={petsPlus2} area={[750, 26, 800, 75]} label="More pet storage" onClick={() => onMessage('More pet storage is coming soon.')} />
      <input
        className="pets-search" style={{ ...box([900, 27, 1216, 75]), fontSize: px(32 / S) }} type="text" placeholder="Search..."
        value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.stopPropagation()} aria-label="Search pets"
      />
      <Piece art={petsPencil} area={[126, 406, 188, 468]} label="Rename pet" onClick={noPets} />
      <Piece art={petsLock} area={[222, 402, 280, 472]} label="Lock pet" onClick={noPets} />
      <Piece art={petsEquip} area={[72, 486, 340, 559]} m={4} label="Equip pet" onClick={noPets} />
      <Piece art={petsDelete} area={[72, 578, 340, 652]} m={4} label="Delete pet" onClick={noPets} />
      {search && <span className="pets-empty" style={{ left: px(380 / S), top: px(90 / S), width: px(920 / S), fontSize: px(34 / S) }}>No pets found.</span>}
      <button className="menu-popup-close" style={box([1252, 13, 1355, 116])} aria-label="Close" onClick={onClose}>
        <img src={petsClose} alt="" draggable={false} />
      </button>
    </section>
  );
}
