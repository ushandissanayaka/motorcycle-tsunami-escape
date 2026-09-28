import React from 'react';
import './MenuPopups.css';

import shopShell from '../assets/popups/shop_shell.png';
import shopClose from '../assets/popups/shop_close.png';
import shopTitleMotorcycles from '../assets/popups/shop_title_motorcycles.png';
import shopTitleWins from '../assets/popups/shop_title_wins.png';
import shopSona from '../assets/popups/shop_sona.png';
import shopFlash from '../assets/popups/shop_flash.png';
import shopDragon from '../assets/popups/shop_dragon.png';
import shopAstralwing from '../assets/popups/shop_astralwing.png';
import shopWins50 from '../assets/popups/shop_wins50.png';
import shopWins500 from '../assets/popups/shop_wins500.png';
import shopWins5000 from '../assets/popups/shop_wins5000.png';
import rebirthShell from '../assets/popups/rebirth_shell.png';
import rebirthClose from '../assets/popups/rebirth_close.png';
import rebirthSpeed1 from '../assets/popups/rebirth_speed1.png';
import rebirthLevel1 from '../assets/popups/rebirth_level1.png';
import rebirthSpeed2 from '../assets/popups/rebirth_speed2.png';
import rebirthLevel2 from '../assets/popups/rebirth_level2.png';
import rebirthBarEmpty from '../assets/popups/rebirth_bar_empty.png';
import rebirthBarFull from '../assets/popups/rebirth_bar_full.png';
import rebirthButton from '../assets/popups/rebirth_button.png';
import rebirthSkip from '../assets/popups/rebirth_skip.png';
import trailsShell from '../assets/popups/trails_shell.png';
import trailsClose from '../assets/popups/trails_close.png';
import trailBloodMoon from '../assets/popups/trail_bloodmoon.png';
import trailRainbow from '../assets/popups/trail_rainbow.png';
import trailFlaming from '../assets/popups/trail_flaming.png';
import trailPurple from '../assets/popups/trail_purple.png';
import trailGreen from '../assets/popups/trail_green.png';
import trailBlue from '../assets/popups/trail_blue.png';
import worldsShell from '../assets/popups/worlds_shell.png';
import worldsClose from '../assets/popups/worlds_close.png';
import world1Art from '../assets/popups/world1.png';
import world2Art from '../assets/popups/world2.png';
import world3Art from '../assets/popups/world3.png';
import world4Art from '../assets/popups/world4.png';
import worldTeleport from '../assets/popups/world_teleport.png';
import { Card, Popup, press, rect } from './popupParts.jsx';
import PetsPopup from './PetsPopup.jsx';
import InventoryPopup from './InventoryPopup.jsx';
import DailyRewardsPopup from './DailyRewardsPopup.jsx';
import WheelSpin from './WheelSpin.jsx';

const SHOP_ITEMS = [
  { art: shopSona, box: [15, 78, 298, 361], name: 'Sona Bike', price: 59 },
  { art: shopFlash, box: [314, 78, 597, 361], name: 'Flash Bike', price: 85 },
  { art: shopDragon, box: [614, 78, 897, 361], name: 'Dragon Bike', price: 225 },
  { art: shopAstralwing, box: [17, 377, 895, 669], name: 'Astralwing Bike (LIMITED!)', price: 999 },
  { art: shopWins50, box: [15, 758, 298, 1040], name: '+50 Wins', price: 49 },
  { art: shopWins500, box: [314, 758, 597, 1040], name: '+500 Wins', price: 299 },
  { art: shopWins5000, box: [614, 758, 897, 1040], name: '+5,000 Wins', price: 599 },
];

const TRAILS = [
  { art: trailBloodMoon, name: 'Blood Moon Trail', price: 499 },
  { art: trailRainbow, name: 'Rainbow Trail', price: 399 },
  { art: trailFlaming, name: 'Flaming Trail', price: 49, m: 1 },
  { art: trailPurple, name: 'Purple Trail', daily: true },
  { art: trailGreen, name: 'Green Trail', price: 29 },
  { art: trailBlue, name: 'Blue Trail', price: 29 },
];

const WORLDS = [
  { art: world1Art, number: 1, level: 0 },
  { art: world2Art, number: 2, level: 75 },
  { art: world3Art, number: 3, level: 120 },
  { art: world4Art, number: 4, level: 150 },
];

const REBIRTH_LEVEL = 50;

export default function MenuPopups({
  popup, level, onClose, onBuy, onMessage, onGrantSpeed, onGrantWins, bikes, wins, finishes, selectedBike, onSelectBike,
}) {
  const close = press(onClose);

  if (popup === 'pets') return <PetsPopup onClose={close} onMessage={onMessage} />;
  if (popup === 'inventory') {
    return <InventoryPopup bikes={bikes} wins={wins} finishes={finishes} selectedBike={selectedBike} onSelect={onSelectBike} onClose={close} />;
  }
  if (popup === 'daily') return <DailyRewardsPopup onClose={close} onMessage={onMessage} onGrantSpeed={onGrantSpeed} onGrantWins={onGrantWins} />;
  if (popup === 'wheel') {
    return <WheelSpin onClose={onClose} onMessage={onMessage} onBuy={onBuy} onGrantSpeed={onGrantSpeed} onGrantWins={onGrantWins} />;
  }

  if (popup === 'shop') {
    return (
      <Popup size={[941, 583]} shell={shopShell} close={shopClose} closeBox={[857, 18, 925, 87]} label="Shop"
        viewport={[15, 103, 927, 578]} contentHeight={1053} onClose={close}>
        <img className="popup-title" src={shopTitleMotorcycles} style={rect([299, 7, 615, 59], 3)} alt="Motorcycles" draggable={false} />
        <img className="popup-title" src={shopTitleWins} style={rect([386, 686, 525, 733], 3)} alt="Wins" draggable={false} />
        {SHOP_ITEMS.map((item) => (
          <Card key={item.name} art={item.art} box={item.box} onClick={press(() => onBuy({ name: item.name, price: item.price, img: item.art }))} />
        ))}
      </Popup>
    );
  }

  if (popup === 'trails') {
    return (
      <Popup size={[666, 652]} shell={trailsShell} close={trailsClose} closeBox={[578, 16, 651, 89]} label="Trails"
        viewport={[11, 104, 655, 647]} contentHeight={1073} onClose={close}>
        {TRAILS.map((trail, index) => (
          <Card
            key={trail.name} art={trail.art} m={trail.m} box={[18, 20 + index * 176, 623, 186 + index * 176]}
            onClick={press(() => (trail.daily
              ? onMessage('Claim the Purple Trail from Daily Rewards.')
              : onBuy({ name: trail.name, price: trail.price, img: trail.art })))}
          />
        ))}
      </Popup>
    );
  }

  if (popup === 'worlds') {
    return (
      <Popup size={[857, 608]} shell={worldsShell} close={worldsClose} closeBox={[772, 17, 844, 88]} label="Worlds"
        viewport={[20, 105, 840, 603]} contentHeight={707} onClose={close}>
        {WORLDS.map((world, index) => {
          const open = level >= world.level;
          const message = world.number === 1 ? 'You are already in World 1.'
            : open ? `World ${world.number} is open. Find the gate!`
              : `World ${world.number} unlocks at level ${world.level}.`;
          return (
            <Card key={world.number} art={world.art} box={[17, 11 + index * 174, 803, 178 + index * 174]} onClick={press(() => onMessage(message))}>
              {open && world.number > 1 && <img className="world-teleport" src={worldTeleport} style={rect([548, 46, 769, 128])} alt="" draggable={false} />}
            </Card>
          );
        })}
      </Popup>
    );
  }

  if (popup === 'rebirth') {
    const fill = Math.min(level / REBIRTH_LEVEL, 1) * 100;
    return (
      <Popup size={[994, 635]} shell={rebirthShell} close={rebirthClose} closeBox={[906, 13, 981, 88]} label="Rebirth" onClose={close}>
        <Card art={rebirthSpeed1} box={[48, 166, 370, 255]} m={6} />
        <Card art={rebirthLevel1} box={[48, 276, 370, 369]} m={6} />
        <Card art={rebirthSpeed2} box={[626, 166, 948, 255]} m={6} />
        <Card art={rebirthLevel2} box={[626, 276, 948, 369]} m={6} />
        <div className="rebirth-bar" style={rect([51, 431, 945, 493])}>
          <img src={rebirthBarEmpty} alt="" draggable={false} />
          <img src={rebirthBarFull} alt="" draggable={false} style={{ clipPath: `inset(0 ${100 - fill}% 0 0)` }} />
          {fill > 0 && fill < 100 && <i className="rebirth-bar-edge" style={{ left: `${fill}%` }} />}
          <span className="rebirth-bar-text">Level {level}/{REBIRTH_LEVEL}</span>
        </div>
        <Card art={rebirthButton} box={[184, 509, 518, 602]} m={5}
          onClick={press(() => onMessage(level >= REBIRTH_LEVEL ? 'Rebirths are coming in a later update.' : `Reach level ${REBIRTH_LEVEL} to rebirth.`))} />
        <Card art={rebirthSkip} box={[529, 516, 811, 594]} m={2} onClick={press(() => onMessage('Skip Rebirth is coming soon.'))} />
      </Popup>
    );
  }

  return null;
}
