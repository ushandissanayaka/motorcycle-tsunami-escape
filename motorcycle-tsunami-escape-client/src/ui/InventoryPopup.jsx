import React from 'react';
import { isBikeUnlocked } from '../shared/constants.js';
import { Popup, press, px, rect } from './popupParts.jsx';

import inventoryShell from '../assets/popups/inventory_shell.png';
import inventoryClose from '../assets/popups/inventory_close.png';
import inventoryCard from '../assets/popups/inventory_card.png';
import inventoryBike from '../assets/popups/inventory_bike.png';
import inventoryShoe from '../assets/popups/inventory_shoe.png';
import inventoryEquip from '../assets/popups/inventory_equip.png';

const CARD_W = 620;
const CARD_H = 165;
const CARD_GAP = 12;
const TOP = 15;

// The reference bike art has gold accents (~50deg hue); rotate them to each bike's own colour.
function accentShift(color) {
  const r = (color >> 16) & 255; const g = (color >> 8) & 255; const b = color & 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return hue * 60 - 50;
}

export default function InventoryPopup({ bikes, wins, finishes, selectedBike, onSelect, onClose }) {
  const owned = bikes.filter((bike) => isBikeUnlocked(bike, { wins, finishes }));
  const contentHeight = Math.max(543, TOP * 2 + owned.length * (CARD_H + CARD_GAP) - CARD_GAP);
  return (
    <Popup size={[666, 653]} shell={inventoryShell} close={inventoryClose} closeBox={[578, 16, 651, 89]} label="Inventory"
      viewport={[11, 104, 655, 646]} contentHeight={contentHeight} onClose={onClose}>
      {owned.map((bike, index) => {
        const top = TOP + index * (CARD_H + CARD_GAP);
        const equipped = bike.id === selectedBike;
        return (
          <div key={bike.id} className="popup-card inventory-card" style={rect([12, top, 12 + CARD_W, top + CARD_H], 4)}>
            <img src={inventoryCard} alt="" draggable={false} />
            <div className="inventory-card-body">
              <img className="inventory-bike" src={inventoryBike} style={{ ...rect([22, 14, 260, 150]), filter: `hue-rotate(${accentShift(bike.color)}deg)` }} alt="" draggable={false} />
              <span className="inventory-name" style={{ right: px(14), top: px(36) }}>{bike.name}</span>
              <img className="inventory-shoe" src={inventoryShoe} style={rect([266, 92, 320, 144])} alt="" draggable={false} />
              <span className="inventory-speed" style={{ left: px(329), top: px(122) }}>{bike.speed}/s</span>
              <button className={`inventory-equip ${equipped ? 'is-equipped' : ''}`} style={rect([441, 88, 603, 150])}
                onClick={press(() => onSelect(bike))} aria-label={equipped ? `${bike.name} equipped` : `Equip ${bike.name}`}>
                <img src={inventoryEquip} alt="" draggable={false} />
                <span>{equipped ? 'Equipped' : 'Equip'}</span>
              </button>
            </div>
          </div>
        );
      })}
    </Popup>
  );
}
