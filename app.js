/**
 * 101 Okey Geliştirilmiş - Game Controller
 * Manages the sandbox state, double-shelf rack, scoring, auto-sorting, and controls.
 */

// ── Scale-to-Fit: Always fill the screen proportionally ──
const GAME_W = 1280;
const GAME_H = 800;

function applyScale() {
  const game = document.querySelector('.game');
  if (!game) return;
  const scaleX = window.innerWidth  / GAME_W;
  const scaleY = window.innerHeight / GAME_H;
  const scale  = Math.min(scaleX, scaleY);
  const offX   = (window.innerWidth  - GAME_W * scale) / 2;
  const offY   = (window.innerHeight - GAME_H * scale) / 2;
  game.style.transform = `scale(${scale})`;
  game.style.position  = 'fixed';
  game.style.left      = offX + 'px';
  game.style.top       = offY + 'px';
  // Store scale globally so touch events can correct coordinates
  window._gameScale = scale;
  window._gameOffX  = offX;
  window._gameOffY  = offY;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load',   applyScale);
  window.addEventListener('resize', applyScale);
}

const colors = ["black", "red", "blueText", "yellow"];
let deck = [];
let discardPiles = [[], [], [], []];
// Compatibility wrapper for tests and other code querying 'discardPile'
Object.defineProperty(globalThis, 'discardPile', {
  get: () => discardPiles[3],
  set: (val) => { discardPiles[3] = val; },
  configurable: true
});
let selectedIndex = null;
let selectedGroupIndices = []; // Indices of currently selected contiguous group of tiles
let currentTurn = 0;           // 0: SEN, 1: AHMET, 2: MEHMET, 3: AYŞE
let hasDrawn = false;          // Tracks if the active player has drawn a tile
let okeyTileInfo = null;       // The shown indicator tile
let okeyWildcardValue = null;  // The actual wildcard number and color
let uniqueId = 0;

let player = {
  opened: false,
  openedThisTurn: false,  // true only if player opened their hand THIS turn (before discarding)
  openingType: null,      // 'series' or 'pairs' - how the player opened their hand
  score: 0,
  pairs: 0
};

let botHands = [[], [], []];   // Hands for the 3 bots (AHMET, MEHMET, AYŞE)

let openedGroups = [];         // List of all opened groups on the table
let playerOpeningScore = 0;
let playerOpeningPairs = 0;

let tookDiscardThisTurn = false;
let discardedTileTaken = null;

// ── Scoring & Round state ──
let roundNumber = 1;                        // Current round
let totalScores = [0, 0, 0, 0];            // Cumulative scores: [Player, AHMET, MEHMET, AYŞE]
let botOpened  = [false, false, false];    // Whether each bot has opened (index 0=AHMET,1=MEHMET,2=AYŞE)
let botOpeningType = [null, null, null];   // 'series' or 'pairs' for each bot
let botOpenedThisTurn = [false, false, false]; // whether each bot opened their hand during this turn
let playerFinishedFromHand = false;        // True if player finished without drawing (elden bitiş)
let roundPenalties = [0, 0, 0, 0];

// Socket.IO multiplayer state variables
let socket = null;
let myRoomCode = null;
let mySeatIndex = 0; // default to 0 for single player sandbox compatibility
let playersInfo = [
  { seatIndex: 0, name: 'SEN', isBot: false },
  { seatIndex: 1, name: 'AHMET', isBot: true },
  { seatIndex: 2, name: 'MEHMET', isBot: true },
  { seatIndex: 3, name: 'AYŞE', isBot: true }
];

function isSeatBot(seatIndex) {
  const p = playersInfo.find(p => p.seatIndex === seatIndex);
  return p ? p.isBot : true;
}

// 40 slots representing the double rack: 20 top shelf, 20 bottom shelf
let rackSlots = Array(40).fill(null);

/**
 * Creates and shuffles a deck of 106 tiles.
 */
function createDeck() {
  deck = [];
  uniqueId = 0;

  // 2 sets of colored tiles 1 to 13
  for (let s = 0; s < 2; s++) {
    for (let color of colors) {
      for (let num = 1; num <= 13; num++) {
        deck.push({
          id: uniqueId++,
          num: num,
          color: color,
          fake: false,
          isOkey: false
        });
      }
    }
  }

  // 2 Joker (Sahte Okey) tiles
  deck.push({ id: uniqueId++, num: "OKEY", color: "joker", fake: true, isOkey: false });
  deck.push({ id: uniqueId++, num: "OKEY", color: "joker", fake: true, isOkey: false });

  // Shuffle
  deck.sort(() => Math.random() - 0.5);

  // Select indicator tile (must be a number tile)
  let indicatorIndex = deck.findIndex(t => !t.fake);
  let indicator = deck[indicatorIndex];
  
  // The shown indicator tile
  okeyTileInfo = { ...indicator };

  // Okey wildcard value is indicator + 1
  let okeyNum = indicator.num === 13 ? 1 : indicator.num + 1;
  let okeyColor = indicator.color;

  okeyWildcardValue = {
    num: okeyNum,
    color: okeyColor
  };

  // Mark Okey wildcard tiles in the deck
  deck.forEach(t => {
    if (!t.fake && t.num === okeyNum && t.color === okeyColor) {
      t.isOkey = true;
    }
  });

  // Remove the indicator tile from the deck so it is face up on the board
  deck.splice(indicatorIndex, 1);
}

/**
 * Deal tiles and initialize hand
 */
function dealTiles() {
  createDeck();
  discardPiles = [[], [], [], []];
  selectedIndex = null;
  selectedGroupIndices = [];
  currentTurn = 0;
  hasDrawn = false;
  player.opened = false;
  player.openedThisTurn = false;
  player.openingType = null;
  player.score = 0;
  player.pairs = 0;
  openedGroups = [];
  playerOpeningScore = 0;
  playerOpeningPairs = 0;
  tookDiscardThisTurn = false;
  discardedTileTaken = null;
  botOpened = [false, false, false];
  botOpeningType = [null, null, null];
  botOpenedThisTurn = [false, false, false];
  playerFinishedFromHand = false;
  roundPenalties = [0, 0, 0, 0];

  // Clear slots
  rackSlots = Array(40).fill(null);

  // If playing multiplayer as non-host: skip deck shuffling/dealing locally, Host will sync it.
  if (socket && myRoomCode && mySeatIndex !== 0) {
    return;
  }

  // Deal 21 tiles to the player (first 21 slots)
  let dealt = deck.splice(0, 21);
  for (let i = 0; i < dealt.length; i++) {
    rackSlots[i] = dealt[i];
  }

  // Deal 21 tiles to each of the 3 bots
  botHands = [
    deck.splice(0, 21),
    deck.splice(0, 21),
    deck.splice(0, 21)
  ];

  // Set initial scores
  document.getElementById("p1-score-badge").textContent = "0";
  document.getElementById("p2-score-badge").textContent = "0";
  document.getElementById("p3-score-badge").textContent = "0";

  if (socket && myRoomCode && mySeatIndex === 0) {
    uploadGameState();
  }

  updateTurnHighlight();
  updateAll("Taşlar dağıtıldı. Taşlarınızı taşımak veya grup seçmek için çift tıklayın.");
}

/**
 * Helper to identify Okey wildcard
 */
function isWildcard(tile) {
  if (!tile) return false;
  return !!tile.isOkey && !tile.fake;
}

/**
 * Resolves the effective number and color of a tile.
 * Fake Okey (Sahte Okey) takes the exact value of the Okey wildcard (indicator + 1).
 */
function getEffectiveTile(tile) {
  if (!tile) return null;
  if (tile.fake && okeyWildcardValue) {
    return {
      ...tile,
      num: okeyWildcardValue.num,
      color: okeyWildcardValue.color
    };
  }
  return tile;
}

/**
 * Toggles the facedown state of a wildcard or fake okey tile on the rack.
 */
function toggleTileFacedown(index) {
  let tile = rackSlots[index];
  if (tile && isWildcard(tile)) {
    tile.facedown = !tile.facedown;
    updateAll("Okey taşı çevrildi.");
    return true;
  }
  return false;
}

/**
 * Renders the Okey Indicator tile in the top right box
 */
function renderOkey() {
  const okeyBox = document.getElementById("okeyTile");
  if (!okeyTileInfo) {
    okeyBox.className = "tile empty-tile";
    okeyBox.innerHTML = "";
    return;
  }
  okeyBox.className = "tile " + okeyTileInfo.color;
  okeyBox.innerHTML = okeyTileInfo.num;
}

/**
 * Renders the discarded tiles for all players in their corner containers
 */
function renderDiscard() {
  for (let v = 0; v < 4; v++) {
    const zoneTilesDiv = document.getElementById(`discard-tiles-p${v}`);
    if (!zoneTilesDiv) continue;
    zoneTilesDiv.innerHTML = "";
    
    // Only display the top (last) tile of each discard pile
    let i = (v + mySeatIndex) % 4;
    let lastTile = discardPiles[i][discardPiles[i].length - 1];
    if (lastTile) {
      const tileDiv = document.createElement("div");
      if (isWildcard(lastTile)) {
        tileDiv.className = "table-tile " + lastTile.color + " wildcard-tile";
        tileDiv.innerHTML = lastTile.num + '<span class="star">★</span>';
      } else if (lastTile.fake) {
        let eff = getEffectiveTile(lastTile);
        tileDiv.className = "table-tile " + (eff ? eff.color : "joker") + " joker-tile fake-okey-tile";
        tileDiv.innerHTML = 'OKEY<span class="fake-indicator" style="font-size: 6px; position: absolute; top: 1px; right: 2px; color: rgba(0,0,0,0.4); font-weight: 800;">S</span>';
      } else {
        tileDiv.className = "table-tile " + lastTile.color;
        tileDiv.innerHTML = lastTile.num;
      }

      // ── ALL players' last tile: clickable + draggable (takeDiscard validates turn) ──
      tileDiv.style.cursor = 'grab';
      tileDiv.setAttribute('data-discard-pile', String(i));
      tileDiv.onclick = (e) => {
        e.stopPropagation();
        takeDiscard();
      };

      // HTML5 drag (desktop)
      tileDiv.setAttribute('draggable', 'true');
      tileDiv.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'DISCARD');
        e.dataTransfer.effectAllowed = 'move';
      });

      // Touch drag (mobile/tablet) — mark as discard source
      tileDiv.setAttribute('data-touch-discard', '1');

      zoneTilesDiv.appendChild(tileDiv);
    }
  }
  
  // Also update the legacy central discard tile
  const discardBox = document.getElementById("discardTile");
  if (discardBox) {
    if (typeof discardBox.removeAttribute === 'function') discardBox.removeAttribute('data-drag-patched');  // allow re-patching
    let last = discardPiles[(mySeatIndex + 3) % 4][discardPiles[(mySeatIndex + 3) % 4].length - 1];
    if (!last) {
      discardBox.className = "tile empty-tile";
      discardBox.innerHTML = "";
    } else {
      if (isWildcard(last)) {
        discardBox.className = "tile " + last.color + " wildcard-tile";
        discardBox.innerHTML = last.num + '<span class="star">★</span>';
      } else if (last.fake) {
        let eff = getEffectiveTile(last);
        discardBox.className = "tile " + (eff ? eff.color : "joker") + " joker-tile fake-okey-tile";
        discardBox.innerHTML = 'OKEY<span class="fake-indicator" style="font-size: 8px; position: absolute; top: 2px; right: 4px; color: rgba(0,0,0,0.4); font-weight: 800;">S</span>';
      } else {
        discardBox.className = "tile " + last.color;
        discardBox.innerHTML = last.num;
      }
    }
    // Re-patch drag after every re-render
    if (typeof patchDiscardDrag === 'function') patchDiscardDrag();
  }
}


/**
 * Recalculates hand melds, scores, and updates status labels
 */
function recalculateScore() {
  let score = 0;
  let pairs = 0;

  // To find groups, we scan rackSlots and split by null gaps
  let currentGroup = [];
  let groups = [];

  for (let i = 0; i < rackSlots.length; i++) {
    if (rackSlots[i] !== null) {
      currentGroup.push({ ...rackSlots[i], slotIndex: i });
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // Check each group
  groups.forEach(group => {
    if (group.length >= 3) {
      // Check if group is a valid consecutive run
      let runResult = validateConsecutiveRun(group);
      if (runResult.valid) {
        score += runResult.points;
        return;
      }

      // Check if group is a valid same-number set
      let setResult = validateSameNumberSet(group);
      if (setResult.valid) {
        score += setResult.points;
        return;
      }
    } else if (group.length === 2) {
      // Check for pairs (same color and same number)
      let t1 = getEffectiveTile(group[0]);
      let t2 = getEffectiveTile(group[1]);
      
      // Wildcards can represent any tile to form a pair
      if (isWildcard(t1) || isWildcard(t2)) {
        pairs++;
      } else if (t1.num === t2.num && t1.color === t2.color) {
        pairs++;
      }
    }
  });

  player.score = score;
  player.pairs = pairs;

  // Update badge UI
  const badge = document.getElementById("p0-score-badge");
  if (player.opened) {
    badge.textContent = `Açık (${playerOpeningScore} P / ${playerOpeningPairs} Çift)`;
  } else {
    badge.textContent = `${player.score} P (${player.pairs} Çift)`;
  }
}

/**
 * Validates consecutive same-color runs (e.g. Red 5-6-7 or 12-13-1)
 */
function validateConsecutiveRun(group) {
  let mappedGroup = group.map(getEffectiveTile);
  if (mappedGroup.length < 3) return { valid: false, points: 0 };

  // Find non-wildcard tiles to determine color
  let normalTiles = mappedGroup.filter(t => !isWildcard(t));
  if (normalTiles.length === 0) {
    // All wildcards - score them
    let pts = mappedGroup.length * (okeyWildcardValue ? okeyWildcardValue.num : 10);
    return { valid: true, points: pts };
  }

  // All normal tiles must be of same color
  let color = normalTiles[0].color;
  let colorMismatch = normalTiles.some(t => t.color !== color);
  if (colorMismatch) return { valid: false, points: 0 };

  let L = mappedGroup.length;

  // 1. Try Ascending
  let firstNormalIdx = mappedGroup.findIndex(t => !isWildcard(t));
  let firstNormalTile = mappedGroup[firstNormalIdx];
  
  let v0_asc = firstNormalTile.num - firstNormalIdx;
  let ascValid = true;
  if (v0_asc < 1 || (v0_asc + L - 1) > 13) {
    ascValid = false;
  } else {
    for (let i = 0; i < L; i++) {
      let t = mappedGroup[i];
      if (!isWildcard(t)) {
        if (t.num !== v0_asc + i) {
          ascValid = false;
          break;
        }
      }
    }
  }

  if (ascValid) {
    let pointsSum = 0;
    for (let i = 0; i < L; i++) {
      pointsSum += v0_asc + i;
    }
    return { valid: true, points: pointsSum };
  }

  // 2. Try Descending
  let v0_desc = firstNormalTile.num + firstNormalIdx;
  let descValid = true;
  if (v0_desc > 13 || (v0_desc - L + 1) < 1) {
    descValid = false;
  } else {
    for (let i = 0; i < L; i++) {
      let t = mappedGroup[i];
      if (!isWildcard(t)) {
        if (t.num !== v0_desc - i) {
          descValid = false;
          break;
        }
      }
    }
  }

  if (descValid) {
    let pointsSum = 0;
    for (let i = 0; i < L; i++) {
      pointsSum += v0_desc - i;
    }
    return { valid: true, points: pointsSum };
  }

  return { valid: false, points: 0 };
}

/**
 * Validates same-number different-color sets (e.g. 7-7-7 of different colors)
 */
function validateSameNumberSet(group) {
  let mappedGroup = group.map(getEffectiveTile);
  if (mappedGroup.length > 4) return { valid: false, points: 0 };

  let normalTiles = mappedGroup.filter(t => !isWildcard(t));
  if (normalTiles.length === 0) {
    let pts = mappedGroup.length * (okeyWildcardValue ? okeyWildcardValue.num : 10);
    return { valid: true, points: pts };
  }

  // All normal tiles must have the same number
  let number = normalTiles[0].num;
  let numberMismatch = normalTiles.some(t => t.num !== number);
  if (numberMismatch) return { valid: false, points: 0 };

  // Normal tiles must have different colors
  let seenColors = new Set();
  for (let t of normalTiles) {
    if (seenColors.has(t.color)) return { valid: false, points: 0 };
    seenColors.add(t.color);
  }

  // Points is number * length of group
  let pointsSum = number * mappedGroup.length;
  return { valid: true, points: pointsSum };
}

/**
 * Renders the slots and tiles inside the bottom Rack
 */
function renderHand() {
  const rack = document.getElementById("rack");
  rack.innerHTML = "";

  rackSlots.forEach((tile, index) => {
    const slotDiv = document.createElement("div");

    // ── Shared drop handler for ALL slots (empty or filled) ──
    slotDiv.ondragover = (e) => {
      e.preventDefault();
      slotDiv.classList.add("drag-hover-slot");
    };
    slotDiv.ondragleave = () => {
      slotDiv.classList.remove("drag-hover-slot");
    };
    slotDiv.ondrop = (e) => {
      e.preventDefault();
      slotDiv.classList.remove("drag-hover-slot");
      const srcIdxStr = e.dataTransfer.getData("text/plain");
      if (srcIdxStr === "" || srcIdxStr === undefined) return;
      const srcIdx = parseInt(srcIdxStr, 10);
      if (isNaN(srcIdx) || srcIdx === index) return;

      // Swap (works for both empty→tile and tile→tile)
      let temp = rackSlots[index];
      rackSlots[index] = rackSlots[srcIdx];
      rackSlots[srcIdx] = temp;
      selectedIndex = null;
      selectedGroupIndices = [];
      updateAll("Taş taşındı.");
    };

    if (tile === null) {
      slotDiv.className = "empty-tile";
      slotDiv.onclick = () => {
        if (selectedGroupIndices.length > 0) {
          moveGroupTo(index);
        } else if (selectedIndex !== null) {
          // Move selected tile to this empty slot
          rackSlots[index] = rackSlots[selectedIndex];
          rackSlots[selectedIndex] = null;
          selectedIndex = null;
          updateAll("Taş taşındı.");
        }
      };
    } else {
      if (isWildcard(tile)) {
        slotDiv.className = "tile " + tile.color + " wildcard-tile";
        slotDiv.innerHTML = tile.num + '<span class="star">★</span>';
      } else if (tile.fake) {
        let eff = getEffectiveTile(tile);
        slotDiv.className = "tile " + (eff ? eff.color : "joker") + " joker-tile fake-okey-tile";
        slotDiv.innerHTML = 'OKEY<span class="fake-indicator" style="font-size: 8px; position: absolute; top: 2px; right: 4px; color: rgba(0,0,0,0.4); font-weight: 800;">S</span>';
      } else {
        slotDiv.className = "tile " + tile.color;
        slotDiv.innerHTML = tile.num;
      }

      if (tile.facedown) {
        slotDiv.classList.add("facedown-tile");
      }

      if (index === selectedIndex || selectedGroupIndices.includes(index)) {
        slotDiv.classList.add("selected");
      }

      // HTML5 Drag and Drop — source
      slotDiv.setAttribute("draggable", "true");
      slotDiv.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
        // Small delay so the ghost image renders before style changes
        setTimeout(() => slotDiv.classList.add("dragging"), 0);
      };
      slotDiv.ondragend = () => {
        slotDiv.classList.remove("dragging");
      };

      slotDiv.onclick = (e) => {
        e.stopPropagation();
        if (selectedGroupIndices.length > 0) {
          selectedGroupIndices = [];
          selectedIndex = index;
          renderHand();
        } else if (selectedIndex === null) {
          selectedIndex = index;
          renderHand();
        } else if (selectedIndex === index) {
          selectedIndex = null;
          renderHand();
        } else {
          // Swap the two slots
          let temp = rackSlots[index];
          rackSlots[index] = rackSlots[selectedIndex];
          rackSlots[selectedIndex] = temp;
          selectedIndex = null;
          updateAll("Taşlar yer değiştirdi.");
        }
      };

      slotDiv.ondblclick = (e) => {
        e.stopPropagation();

        if (isWildcard(tile)) {
          toggleTileFacedown(index);
        } else {
          selectGroup(index);
        }
      };
    }

    slotDiv.setAttribute('data-slot-index', String(index));
    rack.appendChild(slotDiv);
  });
  updateSelectionTooltip();
}

/**
 * Updates the selection info tooltip above the rack, calculating count, sum, average and validity.
 */
function updateSelectionTooltip() {
  const tooltip = document.getElementById("selection-tooltip");
  if (!tooltip) return;

  let activeIndices = [];
  if (selectedGroupIndices.length > 0) {
    activeIndices = selectedGroupIndices;
  } else if (selectedIndex !== null) {
    activeIndices = [selectedIndex];
  }

  if (activeIndices.length === 0) {
    tooltip.style.display = "none";
    return;
  }

  // Get selected tiles
  let tiles = activeIndices.map(idx => rackSlots[idx]).filter(t => t !== null);
  if (tiles.length === 0) {
    tooltip.style.display = "none";
    return;
  }

  // Calculate sum and count
  let sum = 0;
  let count = tiles.length;
  
  tiles.forEach(t => {
    let eff = getEffectiveTile(t);
    if (isWildcard(eff)) {
      sum += (okeyWildcardValue ? okeyWildcardValue.num : 10);
    } else {
      sum += eff.num;
    }
  });

  let avg = (sum / count).toFixed(1);

  // Determine status
  let statusText = "Düzensiz";
  let statusColor = "#ff5252";

  if (count >= 3) {
    let mockGroup = tiles.map((t, idx) => ({ ...t, slotIndex: idx }));
    if (validateConsecutiveRun(mockGroup).valid) {
      statusText = "Seri (Ardışık)";
      statusColor = "#4caf50";
    } else if (validateSameNumberSet(mockGroup).valid) {
      statusText = "Seri (Grup)";
      statusColor = "#4caf50";
    }
  } else if (count === 2) {
    let t1 = getEffectiveTile(tiles[0]);
    let t2 = getEffectiveTile(tiles[1]);
    if (isWildcard(t1) || isWildcard(t2) || (t1.num === t2.num && t1.color === t2.color)) {
      statusText = "Çift";
      statusColor = "#4caf50";
    }
  } else if (count === 1) {
    statusText = "Tek Taş";
    statusColor = "#3c8ed4";
  }

  // Show "YERE İNDİR" button based on opening type
  let laydownBtn = "";
  if (player.opened && currentTurn === mySeatIndex && hasDrawn) {
    if (player.openingType === 'pairs' && count === 2) {
      // Pair opening: check if 2 tiles form a valid pair
      let e1 = getEffectiveTile(tiles[0]);
      let e2 = getEffectiveTile(tiles[1]);
      let isValidPair = (isWildcard(tiles[0]) || isWildcard(tiles[1]) || (e1.num === e2.num && e1.color === e2.color));
      if (isValidPair) {
        laydownBtn = `<div style="margin-left:10px; padding-left:10px; border-left:1px solid rgba(255,255,255,0.15);">
          <button onclick="layDownGroup()" style="background:linear-gradient(180deg,#6c429c,#4a2b70); border:1.5px solid #8e62c2; color:white; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px;">↓ ÇİFT İNDİR</button>
        </div>`;
      }
    } else if (player.openingType === 'series' && count >= 3) {
      // Series opening: check if 3+ tiles form a valid run or set
      let mockGroup = tiles.map((t, idx) => ({ ...t, slotIndex: idx }));
      let isValidGroup = validateConsecutiveRun(mockGroup).valid || validateSameNumberSet(mockGroup).valid;
      if (isValidGroup) {
        laydownBtn = `<div style="margin-left:10px; padding-left:10px; border-left:1px solid rgba(255,255,255,0.15);">
          <button onclick="layDownGroup()" style="background:linear-gradient(180deg,#31703b,#1c4523); border:1.5px solid #52a15e; color:white; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px;">↓ YERE İNDİR</button>
        </div>`;
      }
    }
  }

  // ── "Geri Bırak" button: show when selected tile is the yandan alınan taş ──
  let geriBirakBtn = "";
  if (tookDiscardThisTurn && discardedTileTaken && activeIndices.length === 1) {
    const selTile = rackSlots[activeIndices[0]];
    if (selTile && discardedTileTaken && selTile.id === discardedTileTaken.id) {
      geriBirakBtn = `<div style="margin-left:10px; padding-left:10px; border-left:1px solid rgba(255,255,255,0.15);">
        <button onclick="recall()" style="background:linear-gradient(180deg,#c16715,#824107); border:1.5px solid #e38a34; color:white; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px;">↩ GERİ BIRAK</button>
      </div>`;
    }
  }

  tooltip.innerHTML = `
    <div class="sel-stat">
      <span class="sel-lbl">Toplam:</span>
      <span class="sel-val">${sum}</span>
    </div>
    <div class="sel-stat" style="border-left: 1px solid rgba(255,255,255,0.15); padding-left: 10px;">
      <span class="sel-lbl">Ortalama:</span>
      <span class="sel-val">${avg}</span>
    </div>
    <div class="sel-stat" style="border-left: 1px solid rgba(255,255,255,0.15); padding-left: 10px;">
      <span class="sel-lbl">Adet:</span>
      <span class="sel-val">${count}</span>
    </div>
    <div class="sel-stat" style="border-left: 1px solid rgba(255,255,255,0.15); padding-left: 10px;">
      <span class="sel-lbl">Durum:</span>
      <span class="sel-val" style="color: ${statusColor};">${statusText}</span>
    </div>
    ${laydownBtn}${geriBirakBtn}
  `;
  tooltip.style.display = "flex";

  // ── Highlight GERİ AL button when a taken discard tile can be returned ──
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    const recallBtn = document.querySelector('.btn-action.dark[onclick="recall()"]');
    if (recallBtn) {
      if (tookDiscardThisTurn && discardedTileTaken) {
        recallBtn.style.background = 'linear-gradient(180deg, #c16715 0%, #824107 100%)';
        recallBtn.style.border = '1.5px solid #e38a34';
        recallBtn.style.boxShadow = '0 0 10px rgba(225, 138, 52, 0.7)';
      } else {
        recallBtn.style.background = '';
        recallBtn.style.border = '';
        recallBtn.style.boxShadow = '';
      }
    }
  }
}

/**
 * Highlights all contiguous non-null tiles around the double-clicked tile.
 */
function selectGroup(index) {
  if (rackSlots[index] === null) return;

  // Find start of contiguous block
  let start = index;
  while (start > 0 && rackSlots[start - 1] !== null) {
    start--;
  }

  // Find end of contiguous block
  let end = index;
  while (end < 39 && rackSlots[end + 1] !== null) {
    end++;
  }

  // Set the selected group indices
  selectedGroupIndices = [];
  for (let i = start; i <= end; i++) {
    selectedGroupIndices.push(i);
  }

  // Reset single selection
  selectedIndex = null;
  renderHand();
}

/**
 * Moves the selected group of tiles to the target index, shifting other tiles.
 */
function moveGroupTo(targetStartIdx) {
  if (selectedGroupIndices.length === 0) return;

  // Extract the tiles in the group from the rack
  let groupTiles = selectedGroupIndices.map(idx => rackSlots[idx]);

  // Remove them from their original positions
  selectedGroupIndices.forEach(idx => {
    rackSlots[idx] = null;
  });

  let L = groupTiles.length;

  // Cap targetStartIdx so the entire group fits on the rack (max slot index 39)
  if (targetStartIdx + L > 40) {
    targetStartIdx = 40 - L;
  }

  for (let i = 0; i < L; i++) {
    let targetIdx = targetStartIdx + i;

    if (rackSlots[targetIdx] !== null) {
      // Find nearest empty slot to shift existing tile
      let nearestEmpty = -1;
      let minDistance = 999;
      for (let j = 0; j < 40; j++) {
        if (rackSlots[j] === null) {
          let dist = Math.abs(j - targetIdx);
          if (dist < minDistance) {
            minDistance = dist;
            nearestEmpty = j;
          }
        }
      }

      if (nearestEmpty !== -1) {
        rackSlots[nearestEmpty] = rackSlots[targetIdx];
        rackSlots[targetIdx] = null;
      }
    }

    rackSlots[targetIdx] = groupTiles[i];
  }

  selectedGroupIndices = [];
  updateAll("Grup taşındı.");
}

/**
 * Updates the visual turn highlight class for players list.
 */
function updateTurnHighlight() {
  let activeVisualSeat = (currentTurn - mySeatIndex + 4) % 4;
  for (let v = 0; v < 4; v++) {
    const el = document.getElementById(`p${v}-row`);
    if (el) {
      if (v === activeVisualSeat) {
        el.classList.add("active-player");
      } else {
        el.classList.remove("active-player");
      }
    }
  }
}

/**
 * Draw a tile from the Deck stack
 */
function drawTile(targetSlot) {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Diğer oyuncuların oynamasını bekleyin.");
    return;
  }
  if (hasDrawn) {
    showMessage("Zaten taş çektiniz! Istakanızdan bir taş atmalısınız.");
    return;
  }
  if (deck.length === 0) {
    showMessage("Yerde çekilecek taş kalmadı!");
    return;
  }

  // Use targetSlot if provided and empty, otherwise first empty slot
  let emptyIdx;
  if (targetSlot !== undefined && targetSlot !== null && rackSlots[targetSlot] === null) {
    emptyIdx = targetSlot;
  } else {
    emptyIdx = rackSlots.indexOf(null);
  }
  if (emptyIdx === -1) {
    showMessage("Istakanızda boş yer yok! Taş atmalısınız.");
    return;
  }

  let tile = deck.pop();
  rackSlots[emptyIdx] = tile;
  hasDrawn = true;
  let tileName = isWildcard(tile) ? 'Okey' : (tile.fake ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.num);
  updateAll(`Yerden taş çektiniz: ${tileName}. Şimdi bir taş atın.`);
  uploadGameState();
}

/**
 * Discard the selected tile from hand
 */
function discardTile() {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Diğer oyuncuların oynamasını bekleyin.");
    return;
  }
  if (!hasDrawn) {
    showMessage("Önce yerden veya yandan taş çekmelisiniz!");
    return;
  }

  // ── Yandan alınan taş hâlâ ıstakada mı? ──
  if (tookDiscardThisTurn && discardedTileTaken) {
    const takenStillInRack = rackSlots.some(t => t && t.id === discardedTileTaken.id);
    if (takenStillInRack) {
      if (!player.opened) {
        showMessage("⛔ Yandan aldığınız taşı kullanmak zorundasınız! Yere bir seri indirin ya da işlek yapın. Kullanamıyorsanız 'GERİ AL' ile taşı geri verin.");
      } else {
        showMessage("⛔ Yandan aldığınız taşı kullanmadan taş atamazsınız! O taşı bir seriye işleyin veya yere indirin. Kullanamıyorsanız 'GERİ AL' ile taşı geri verin.");
      }
      return;
    }
  }

  if (selectedIndex === null) {
    showMessage("Atmak için önce ıstakanızdan bir taş seçin.");
    return;
  }


  let tile = rackSlots[selectedIndex];
  if (!tile) {
    selectedIndex = null;
    renderHand();
    return;
  }

  discardPiles[0].push(tile);
  rackSlots[selectedIndex] = null;
  selectedIndex = null;
  selectedGroupIndices = [];

  hasDrawn = false;
  tookDiscardThisTurn = false;
  discardedTileTaken = null;
  player.openedThisTurn = false;  // sıra geçti, artık el açmayı geri alamaz

  let tileName = isWildcard(tile) ? 'Okey' : (tile.fake ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.num);
  let penalties = [];

  // ── Okey atma cezası: +100 puan ──
  if (isWildcard(tile)) {
    roundPenalties[mySeatIndex] += 100;
    penalties.push('Okey attınız (+100)');
  }

  // ── İşlek cezası: atılan taş masaya işlenebiliyorsa +100 puan ──
  if (!isWildcard(tile) && openedGroups.length > 0 && tileCanLayOff(tile)) {
    roundPenalties[mySeatIndex] += 100;
    penalties.push('İşlek kaçırdınız (+100)');
  }

  if (penalties.length > 0) {
    updateAll(`⚠️ ${penalties.join(' | ')} Toplam: ${totalScores[mySeatIndex] + roundPenalties[mySeatIndex]}`);
  } else {
    updateAll(`Yere taş attınız: ${tileName}`);
  }

  // Check if player's rack is now empty → auto-finish
  let remaining = rackSlots.filter(t => t !== null).length;
  if (remaining === 0 && player.opened) {
    let finishType = playerFinishedFromHand ? 'elden' : (isWildcard(tile) ? 'okey' : 'normal');
    setTimeout(() => endRound(mySeatIndex, finishType), 300);
    return;
  }

  // Pass turn to the next player
  passTurn();
}

/**
 * Take the top discarded tile into hand
 */
function takeDiscard(targetSlot) {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Diğer oyuncuların oynamasını bekleyin.");
    return;
  }
  if (hasDrawn) {
    showMessage("Zaten taş çektiniz! Istakanızdan bir taş atmalısınız.");
    return;
  }
  if (discardPiles[(mySeatIndex + 3) % 4].length === 0) {
    showMessage("Ortada atılmış taş bulunmuyor!");
    return;
  }

  // Use targetSlot if provided and empty, otherwise first empty slot
  let emptyIdx;
  if (targetSlot !== undefined && targetSlot !== null && rackSlots[targetSlot] === null) {
    emptyIdx = targetSlot;
  } else {
    emptyIdx = rackSlots.indexOf(null);
  }
  if (emptyIdx === -1) {
    showMessage("Istakanızda boş yer yok!");
    return;
  }

  let tile = discardPiles[(mySeatIndex + 3) % 4].pop();
  rackSlots[emptyIdx] = tile;
  hasDrawn = true;
  tookDiscardThisTurn = true;
  discardedTileTaken = tile;
  let tileName = isWildcard(tile) ? 'Okey' : (tile.fake ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.num);
  updateAll(`Yandan atılan taşı aldınız: ${tileName}. Şimdi elinizi açmalı ve bir taş atmalısınız.`);
  uploadGameState();
}

/**
 * Recalls / Undoes the last action
 */
function recall() {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil!");
    return;
  }

  // Case 1: Player opened their hand THIS TURN and wants to undo opening
  if (player.opened && player.openedThisTurn) {
    let userGroups = openedGroups.filter(g => g.player === mySeatIndex);
    if (userGroups.length > 0) {
      userGroups.forEach(group => {
        // Only return tiles that were part of the ORIGINAL opening (not laid-off tiles)
        group.tiles.forEach(tile => {
          if (!tile.laidOff) {
            let emptyIdx = rackSlots.indexOf(null);
            if (emptyIdx !== -1) {
              rackSlots[emptyIdx] = tile;
            }
          }
        });
        // Keep laidOff tiles on the table, remove non-laidOff ones
        group.tiles = group.tiles.filter(t => t.laidOff);
      });

      // Remove player groups that are now empty (all tiles returned or no laidOff tiles)
      openedGroups = openedGroups.filter(g => !(g.player === mySeatIndex && g.tiles.length === 0));
      // If all player groups are gone, mark player as not opened
      if (!openedGroups.some(g => g.player === mySeatIndex)) {
        player.opened = false;
      }
      player.openedThisTurn = false;
      playerOpeningScore = 0;
      playerOpeningPairs = 0;
      updateAll("Açtığınız seriler ıstakanıza geri toplandı.");
      uploadGameState();
      return;
    }
  } else if (player.opened && !player.openedThisTurn) {
    showMessage("Taş attıktan sonra açtığınız seriler geri alınamaz!");
    return;
  }

  // Case 2: Player took discard tile and wants to return it to draw from deck
  if (tookDiscardThisTurn && discardedTileTaken) {
    let idx = rackSlots.findIndex(t => t && t.id === discardedTileTaken.id);
    if (idx !== -1) {
      let tile = rackSlots[idx];
      rackSlots[idx] = null;
      discardPiles[(mySeatIndex + 3) % 4].push(tile);
      tookDiscardThisTurn = false;
      discardedTileTaken = null;
      hasDrawn = false;
      updateAll("Yandan aldığınız taş geri verildi.");
      uploadGameState();
      return;
    }
  }

  showMessage("Geri alınacak bir hamle bulunamadı.");
}

/**
 * Checks score to open hand (Series or Double)
 */
function isDiscardTileUsedInMelds(type, discardTile) {
  if (!discardTile) return false;
  
  let currentGroup = [];
  let groups = [];
  for (let i = 0; i < rackSlots.length; i++) {
    if (rackSlots[i] !== null) {
      currentGroup.push({ ...rackSlots[i], slotIndex: i });
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  let used = false;
  groups.forEach(group => {
    let isValidMeld = false;
    if (type === 'series' && group.length >= 3) {
      if (validateConsecutiveRun(group).valid || validateSameNumberSet(group).valid) {
        isValidMeld = true;
      }
    } else if (type === 'pairs' && group.length === 2) {
      let t1 = getEffectiveTile(group[0]);
      let t2 = getEffectiveTile(group[1]);
      if (isWildcard(t1) || isWildcard(t2) || (t1.num === t2.num && t1.color === t2.color)) {
        isValidMeld = true;
      }
    }

    if (isValidMeld) {
      if (group.some(t => t.id === discardTile.id)) {
        used = true;
      }
    }
  });
  return used;
}

/**
 * Lay down the currently selected group from the rack to the table as a new meld.
 * Only works when the player has already opened their hand.
 */
function layDownGroup() {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil!");
    return;
  }
  if (!hasDrawn) {
    showMessage("Once yerden veya yandan taş çekmelisiniz!");
    return;
  }
  if (!player.opened) {
    showMessage("Şimdi elinizi açabilirsiniz (101 puan veya 5 çift gerekli).");
    return;
  }

  // Get the selected group indices
  let activeIndices = selectedGroupIndices.length > 0 ? selectedGroupIndices : (selectedIndex !== null ? [selectedIndex] : []);

  // ---- Pair opening: only 2-tile pairs allowed ----
  if (player.openingType === 'pairs') {
    if (activeIndices.length !== 2) {
      showMessage("Çift ile açtığınız için sadece çift (2 taş, aynı renk-sayı) indirebilirsiniz!");
      return;
    }
    let tiles = activeIndices.map(idx => rackSlots[idx]).filter(t => t !== null);
    if (tiles.length !== 2) {
      showMessage("Seçili grupta 2 taş olmalı!");
      return;
    }
    let e1 = getEffectiveTile(tiles[0]);
    let e2 = getEffectiveTile(tiles[1]);
    let isValidPair = (isWildcard(tiles[0]) || isWildcard(tiles[1]) || (e1.num === e2.num && e1.color === e2.color));
    if (!isValidPair) {
      showMessage("Bu iki taş geçerli bir çift değil! (Aynı renk ve aynı sayı olmalı)");
      return;
    }
    activeIndices.forEach(idx => { rackSlots[idx] = null; });
    openedGroups.push({ player: mySeatIndex, type: 'pair', tiles: tiles });
    selectedIndex = null;
    selectedGroupIndices = [];
    updateAll(`Çift masaya indirildi! (${e1.num})`);
    uploadGameState();
    
    // Auto-finish if rack is now empty
    if (rackSlots.filter(t => t !== null).length === 0) {
      setTimeout(() => endRound(mySeatIndex, 'normal'), 400);
    }
    return;
  }

  // ---- Series opening: runs/sets of 3+ OR pair of 2 if bots opened pairs ----
  if (activeIndices.length === 2) {
    if (!botOpeningType.includes('pairs')) {
      showMessage("Rakiplerden hiçbiri çift açmadığı için çift indiremezsiniz!");
      return;
    }
    let tiles = activeIndices.map(idx => rackSlots[idx]).filter(t => t !== null);
    if (tiles.length !== 2) {
      showMessage("Seçili grupta 2 taş olmalı!");
      return;
    }
    let e1 = getEffectiveTile(tiles[0]);
    let e2 = getEffectiveTile(tiles[1]);
    let isValidPair = (isWildcard(tiles[0]) || isWildcard(tiles[1]) || (e1.num === e2.num && e1.color === e2.color));
    if (!isValidPair) {
      showMessage("Bu iki taş geçerli bir çift değil! (Aynı renk ve aynı sayı olmalı)");
      return;
    }
    activeIndices.forEach(idx => { rackSlots[idx] = null; });
    openedGroups.push({ player: mySeatIndex, type: 'pair', tiles: tiles });
    selectedIndex = null;
    selectedGroupIndices = [];
    updateAll(`Çift masaya indirildi! (${e1.num})`);
    uploadGameState();

    // Auto-finish if rack is now empty
    if (rackSlots.filter(t => t !== null).length === 0) {
      setTimeout(() => endRound(mySeatIndex, 'normal'), 400);
    }
    return;
  }

  if (activeIndices.length < 3) {
    showMessage("Masaya indirmek için en az 3 taşlık bir grup seçmelisiniz! (Çift tiklayarak seçin)");
    return;
  }

  let tiles = activeIndices.map(idx => rackSlots[idx]).filter(t => t !== null);
  if (tiles.length < 3) {
    showMessage("Seçili grupta yeterli taş yok!");
    return;
  }

  // Validate the group
  let mockGroup = tiles.map((t, idx) => ({ ...t, slotIndex: idx }));
  let runResult = validateConsecutiveRun(mockGroup);
  let setResult = validateSameNumberSet(mockGroup);

  if (!runResult.valid && !setResult.valid) {
    showMessage("Seçili grup geçerli bir seri veya set değil!");
    return;
  }

  let meldType = runResult.valid ? 'run' : 'group';

  // Remove tiles from rack
  activeIndices.forEach(idx => { rackSlots[idx] = null; });

  // Add to opened groups on table
  openedGroups.push({
    player: mySeatIndex,
    type: meldType,
    tiles: tiles
  });

  selectedIndex = null;
  selectedGroupIndices = [];

  updateAll(`Grup masaya indirildi! (${tiles.map(t => { let e = getEffectiveTile(t); return e.num; }).join('-')})`);

  // Auto-finish if rack is now empty
  if (rackSlots.filter(t => t !== null).length === 0) {
    setTimeout(() => endRound(0, 'normal'), 400);
  }
}

function openHand() {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Elinizi açamazsınız.");
    return;
  }
  // If already opened, delegate to layDownGroup for placing new groups
  if (player.opened) {
    layDownGroup();
    return;
  }
  recalculateScore();
  
  if (player.score >= 101) {
    if (tookDiscardThisTurn && discardedTileTaken) {
      if (!isDiscardTileUsedInMelds('series', discardedTileTaken)) {
        showMessage("Yandan aldığınız taşı açtığınız serilerde kullanmak zorundasınız!");
        return;
      }
    }
    playerOpeningScore = player.score;
    playerOpeningPairs = player.pairs;
    let extracted = extractMeldsFromRack('series');
    if (extracted) {
      player.opened = true;
      player.openedThisTurn = true;
      player.openingType = 'series';
      tookDiscardThisTurn = false;
      discardedTileTaken = null;
      updateAll(`Tebrikler! Elinizi seri perler ile açtınız (Toplam puan: ${playerOpeningScore})`);
      uploadGameState();
      // Auto-finish if rack is now empty after opening
      if (rackSlots.filter(t => t !== null).length === 0) {
        setTimeout(() => endRound(mySeatIndex, playerFinishedFromHand ? 'elden' : 'normal'), 600);
      }
    } else {
      showMessage("Hata: Geçerli seriler ıskalarda bulunamadı.");
    }
  } else if (player.pairs >= 5) {
    if (tookDiscardThisTurn && discardedTileTaken) {
      if (!isDiscardTileUsedInMelds('pairs', discardedTileTaken)) {
        showMessage("Yandan aldığınız taşı açtığınız çiftlerde kullanmak zorundasınız!");
        return;
      }
    }
    playerOpeningScore = player.score;
    playerOpeningPairs = player.pairs;
    let extracted = extractMeldsFromRack('pairs');
    if (extracted) {
      player.opened = true;
      player.openedThisTurn = true;
      player.openingType = 'pairs';
      tookDiscardThisTurn = false;
      discardedTileTaken = null;
      updateAll(`Tebrikler! Elinizi çift perler ile açtınız (${playerOpeningPairs} çift)`);
      uploadGameState();
      // Auto-finish if rack is now empty after opening
      if (rackSlots.filter(t => t !== null).length === 0) {
        setTimeout(() => endRound(mySeatIndex, playerFinishedFromHand ? 'elden' : 'normal'), 600);
      }
    } else {
      showMessage("Hata: Geçerli çiftler ıskalarda bulunamadı.");
    }
  } else {
    showMessage(`Eliniz açılamaz. Perlerin toplamı: ${player.score} (en az 101 lazım) veya Çift sayısı: ${player.pairs} (en az 5 çift lazım).`);
  }
}

/**
 * Extracts valid melds from the rack when player opens their hand.
 */
function extractMeldsFromRack(type) {
  let currentGroup = [];
  let groups = [];

  for (let i = 0; i < rackSlots.length; i++) {
    if (rackSlots[i] !== null) {
      currentGroup.push({ ...rackSlots[i], slotIndex: i });
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  let extractedAny = false;

  groups.forEach(group => {
    let isValidMeld = false;
    if (type === 'series' && group.length >= 3) {
      if (validateConsecutiveRun(group).valid || validateSameNumberSet(group).valid) {
        isValidMeld = true;
      }
    } else if (type === 'pairs' && group.length === 2) {
      let t1 = getEffectiveTile(group[0]);
      let t2 = getEffectiveTile(group[1]);
      if (isWildcard(t1) || isWildcard(t2) || (t1.num === t2.num && t1.color === t2.color)) {
        isValidMeld = true;
      }
    }

    if (isValidMeld) {
      openedGroups.push({
        player: mySeatIndex, // SEN
        tiles: group.map(t => ({ ...t }))
      });
      group.forEach(t => {
        rackSlots[t.slotIndex] = null;
      });
      extractedAny = true;
    }
  });

  return extractedAny;
}

/**
 * Renders all opened groups on the table felt.
 */
function renderOpenedGroups() {
  for (let i = 0; i < 4; i++) {
    const zone = document.getElementById("opened-zone-p" + i);
    if (zone) zone.innerHTML = "";
  }

  openedGroups.forEach((group, groupIdx) => {
    let v = (group.player - mySeatIndex + 4) % 4;
    const zone = document.getElementById("opened-zone-p" + v);
    if (!zone) return;

    const groupDiv = document.createElement("div");
    groupDiv.className = "opened-group";
    groupDiv.setAttribute('data-group-index', String(groupIdx));

    // Setup drag & drop handlers for this group
    groupDiv.ondragover = (e) => {
      e.preventDefault();
      groupDiv.classList.add("drag-hover");
    };
    groupDiv.ondragleave = () => {
      groupDiv.classList.remove("drag-hover");
    };
    groupDiv.ondrop = (e) => {
      e.preventDefault();
      groupDiv.classList.remove("drag-hover");
      const draggedIdxStr = e.dataTransfer.getData("text/plain");
      if (draggedIdxStr === "") return;
      const draggedIdx = parseInt(draggedIdxStr, 10);
      layOffTile(draggedIdx, groupIdx);
    };

    // Click-to-layoff: if player has a tile selected in rack, clicking this group lays it off
    groupDiv.onclick = (e) => {
      e.stopPropagation();
      if (player.opened && currentTurn === mySeatIndex && hasDrawn && selectedIndex !== null) {
        layOffTile(selectedIndex, groupIdx);
      }
    };

    // Highlight groups as layoff targets when player has a tile selected and hand is opened
    if (player.opened && currentTurn === mySeatIndex && hasDrawn && selectedIndex !== null) {
      groupDiv.classList.add("layoff-target");
    }

    group.tiles.forEach(tile => {
      const tileDiv = document.createElement("div");
      if (isWildcard(tile)) {
        tileDiv.className = "table-tile " + tile.color + " wildcard-tile";
        tileDiv.innerHTML = tile.num + '<span class="star">★</span>';
      } else if (tile.fake) {
        let eff = getEffectiveTile(tile);
        tileDiv.className = "table-tile " + (eff ? eff.color : "joker") + " joker-tile fake-okey-tile";
        tileDiv.innerHTML = 'OKEY<span class="fake-indicator" style="font-size: 6px; position: absolute; top: 1px; right: 2px; color: rgba(0,0,0,0.4); font-weight: 800;">S</span>';
      } else {
        tileDiv.className = "table-tile " + tile.color;
        tileDiv.innerHTML = tile.num;
      }

      if (tile.facedown) {
        tileDiv.classList.add("facedown-tile");
      }

      // Allow double-clicking Okey tiles on the table to flip them
      if (isWildcard(tile)) {
        tileDiv.ondblclick = (e) => {
          e.stopPropagation();
          tile.facedown = !tile.facedown;
          updateAll("Yerdeki Okey taşı çevrildi.");
        };
      }

      groupDiv.appendChild(tileDiv);
    });

    zone.appendChild(groupDiv);
  });
}

/**
 * Generates all candidate melds for a bot's hand.
 */
function getBotCandidateMelds(hand) {
  let normals = hand.filter(t => !isWildcard(t));
  let wildcards = hand.filter(t => isWildcard(t));
  
  let candidates = [];
  let seenCandidateKeys = new Map();
  
  // Helper to add candidate
  function addCandidate(group, score) {
    let key = group.map(t => t.id).sort((a, b) => a - b).join('_');
    if (!seenCandidateKeys.has(key)) {
      let cand = { tiles: group, score: score };
      candidates.push(cand);
      seenCandidateKeys.set(key, cand);
    } else {
      let existing = seenCandidateKeys.get(key);
      if (score > existing.score) {
        existing.tiles = group;
        existing.score = score;
      }
    }
  }

  function getSubsets(arr, minSize) {
    let result = [];
    let f = (prefix, chars) => {
      for (let i = 0; i < chars.length; i++) {
        let next = [...prefix, chars[i]];
        if (next.length >= minSize) {
          result.push(next);
        }
        f(next, chars.slice(i + 1));
      }
    };
    f([], arr);
    return result;
  }

  // 1. Same-number sets (groups of 3 or 4)
  for (let n = 1; n <= 13; n++) {
    let matches = normals.filter(t => {
      let eff = getEffectiveTile(t);
      return eff && eff.num === n;
    });
    
    let colorGroups = {};
    matches.forEach(t => {
      let eff = getEffectiveTile(t);
      if (!colorGroups[eff.color]) colorGroups[eff.color] = [];
      colorGroups[eff.color].push(t);
    });
    
    let uniqueColors = Object.keys(colorGroups);
    if (uniqueColors.length >= 2) {
      let cartesian = (arrays) => {
        return arrays.reduce((acc, curr) => {
          return acc.flatMap(c => curr.map(item => [...c, item]));
        }, [[]]);
      };
      
      let arraysToCombine = uniqueColors.map(col => colorGroups[col]);
      let colorCombos = cartesian(arraysToCombine);
      
      colorCombos.forEach(combo => {
        let subsets = getSubsets(combo, 2);
        subsets.forEach(sub => {
          if (sub.length >= 3) {
            let res = validateSameNumberSet(sub);
            if (res.valid) {
              addCandidate(sub, res.points);
            }
          }
          
          wildcards.forEach(w => {
            let withW = [...sub, w];
            if (withW.length >= 3 && withW.length <= 4) {
              let res = validateSameNumberSet(withW);
              if (res.valid) {
                addCandidate(withW, res.points);
              }
            }
          });
          
          if (sub.length === 2 && wildcards.length >= 2) {
            let with2W = [...sub, wildcards[0], wildcards[1]];
            let res = validateSameNumberSet(with2W);
            if (res.valid) {
              addCandidate(with2W, res.points);
            }
          }
        });
      });
    }
  }

  // 2. Same-color runs
  colors.forEach(col => {
    let sameCol = normals.filter(t => {
      let eff = getEffectiveTile(t);
      return eff && eff.color === col;
    });
    
    // Ascending runs
    for (let startNum = 1; startNum <= 13; startNum++) {
      for (let len = 3; len <= 13; len++) {
        if (startNum + len - 1 > 13) continue;
        
        let neededNums = [];
        for (let i = 0; i < len; i++) {
          neededNums.push(startNum + i);
        }
        
        let matchesByNum = neededNums.map(n => sameCol.filter(t => {
          let eff = getEffectiveTile(t);
          return eff && eff.num === n;
        }));
        
        let formRun = (numIdx, currentRunTiles, wildcardsUsed) => {
          if (numIdx === len) {
            let res = validateConsecutiveRun(currentRunTiles);
            if (res.valid) {
              addCandidate(currentRunTiles, res.points);
            }
            return;
          }
          
          let possibleTiles = matchesByNum[numIdx];
          if (possibleTiles.length > 0) {
            possibleTiles.forEach(tile => {
              formRun(numIdx + 1, [...currentRunTiles, tile], wildcardsUsed);
            });
          }
          
          if (wildcardsUsed < wildcards.length) {
            let w = wildcards[wildcardsUsed];
            formRun(numIdx + 1, [...currentRunTiles, w], wildcardsUsed + 1);
          }
        };
        
        formRun(0, [], 0);
      }
    }
    
    // Descending runs
    for (let startNum = 13; startNum >= 1; startNum--) {
      for (let len = 3; len <= 13; len++) {
        if (startNum - len + 1 < 1) continue;
        
        let neededNums = [];
        for (let i = 0; i < len; i++) {
          neededNums.push(startNum - i);
        }
        
        let matchesByNum = neededNums.map(n => sameCol.filter(t => {
          let eff = getEffectiveTile(t);
          return eff && eff.num === n;
        }));
        
        let formRun = (numIdx, currentRunTiles, wildcardsUsed) => {
          if (numIdx === len) {
            let res = validateConsecutiveRun(currentRunTiles);
            if (res.valid) {
              addCandidate(currentRunTiles, res.points);
            }
            return;
          }
          
          let possibleTiles = matchesByNum[numIdx];
          if (possibleTiles.length > 0) {
            possibleTiles.forEach(tile => {
              formRun(numIdx + 1, [...currentRunTiles, tile], wildcardsUsed);
            });
          }
          
          if (wildcardsUsed < wildcards.length) {
            let w = wildcards[wildcardsUsed];
            formRun(numIdx + 1, [...currentRunTiles, w], wildcardsUsed + 1);
          }
        };
        
        formRun(0, [], 0);
      }
    }
  });
  
  return candidates;
}

/**
 * Finds the maximum-scoring non-overlapping combination of melds for a bot's hand.
 */
function findBestMeldsForBot(hand) {
  let candidates = getBotCandidateMelds(hand);
  
  let bestCombination = [];
  let maxScore = 0;
  
  function search(index, currentMelds, currentScore, usedTileIds) {
    if (currentScore > maxScore) {
      maxScore = currentScore;
      bestCombination = [...currentMelds];
    }
    
    for (let i = index; i < candidates.length; i++) {
      let meld = candidates[i];
      let overlap = false;
      for (let t of meld.tiles) {
        if (usedTileIds.has(t.id)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        meld.tiles.forEach(t => usedTileIds.add(t.id));
        currentMelds.push(meld);
        
        search(i + 1, currentMelds, currentScore + meld.score, usedTileIds);
        
        currentMelds.pop();
        meld.tiles.forEach(t => usedTileIds.delete(t.id));
      }
    }
  }
  
  search(0, [], 0, new Set());
  return { melds: bestCombination, score: maxScore };
}

/**
 * Finds the maximum number of pairs for a bot's hand, utilizing wildcards.
 */
function findBestPairsForBot(hand) {
  let wildcards = hand.filter(t => isWildcard(t));
  let normals = hand.filter(t => !isWildcard(t));
  
  let groups = {};
  normals.forEach(t => {
    let eff = getEffectiveTile(t);
    let key = `${eff.color}_${eff.num}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  
  let pairs = [];
  let leftovers = [];
  
  Object.keys(groups).forEach(key => {
    let list = groups[key];
    while (list.length >= 2) {
      let t1 = list.pop();
      let t2 = list.pop();
      pairs.push([t1, t2]);
    }
    if (list.length > 0) {
      leftovers.push(list[0]);
    }
  });
  
  let wildIdx = 0;
  while (wildIdx < wildcards.length && leftovers.length > 0) {
    let w = wildcards[wildIdx++];
    let t = leftovers.pop();
    pairs.push([t, w]);
  }
  
  return pairs;
}

/**
 * Simulates a bot opening their hand dynamically based on their actual tiles.
 */
function botTryOpen(botIndex) {
  const botNames = ["SEN", "AHMET", "MEHMET", "AYŞE"];
  let name = botNames[botIndex];
  let hand = botHands[botIndex - 1];
  
  if (Math.random() < 0.25) {
    // Try series/sets first
    let seriesResult = findBestMeldsForBot(hand);
    if (seriesResult.score >= 101) {
      seriesResult.melds.forEach(meld => {
        openedGroups.push({
          player: botIndex,
          type: meld.type,
          tiles: meld.tiles.map(t => ({ ...t }))
        });
        meld.tiles.forEach(t => {
          let idx = hand.findIndex(h => h.id === t.id);
          if (idx !== -1) {
            hand.splice(idx, 1);
          }
        });
      });
      
      document.getElementById(`p${botIndex}-score-badge`).textContent = `Açık (${seriesResult.score} P)`;
      showMessage(`${name} elini açtı! Yere serilerini indirdi.`);
      botOpened[botIndex - 1] = true;
      botOpeningType[botIndex - 1] = 'series';
      botOpenedThisTurn[botIndex - 1] = true;
      return true;
    }
    
    // Try pairs
    let pairs = findBestPairsForBot(hand);
    if (pairs.length >= 5) {
      pairs.forEach(pair => {
        openedGroups.push({
          player: botIndex,
          type: 'pair',
          tiles: pair.map(t => ({ ...t }))
        });
        pair.forEach(t => {
          let idx = hand.findIndex(h => h.id === t.id);
          if (idx !== -1) {
            hand.splice(idx, 1);
          }
        });
      });
      
      document.getElementById(`p${botIndex}-score-badge`).textContent = `Açık (${pairs.length} Çift)`;
      showMessage(`${name} elini açtı! Yere çiftlerini indirdi.`);
      botOpened[botIndex - 1] = true;
      botOpeningType[botIndex - 1] = 'pairs';
      botOpenedThisTurn[botIndex - 1] = true;
      return true;
    }
  }
  
  return false;
}

/**
 * Finishes the current round
 */
/**
 * Calculate tile face value for scoring
 */
function tileValue(tile) {
  if (!tile) return 0;
  if (isWildcard(tile)) return 101; // Joker/Okey in hand = 101 penalty
  let eff = getEffectiveTile(tile);
  return typeof eff.num === 'number' ? eff.num : 101;
}

/**
 * Ends the current round, calculates scores, shows modal.
 * winnerId: 0=Player, 1=AHMET, 2=MEHMET, 3=AYŞE  (or -1 if deck ran out)
 * finishType: 'normal' | 'elden' | 'okey'
 */
function endRound(winnerId, finishType) {
  // Only Host computes scores and uploads the round end state
  if (mySeatIndex !== 0) {
    // If we are a guest and we finished, upload our final state and let Host run endRound
    if (winnerId === mySeatIndex) {
      uploadGameState();
    }
    return;
  }

  const names = playersInfo.map(p => p.name);

  // ── Gather remaining hand tiles ──
  let hands = [
    rackSlots.filter(t => t !== null),
    [...botHands[0]],
    [...botHands[1]],
    [...botHands[2]]
  ];

  // ── Determine opened status for each player ──
  let opened = [
    player.opened,
    botOpened[0],
    botOpened[1],
    botOpened[2]
  ];
  let openingTypes = [
    player.openingType,
    botOpeningType[0],
    botOpeningType[1],
    botOpeningType[2]
  ];

  // Determine if it was an elden finish (from hand)
  let isElden = false;
  if (winnerId !== -1) {
    if (winnerId === 0) {
      isElden = player.openedThisTurn || finishType === 'elden';
    } else {
      isElden = botOpenedThisTurn[winnerId - 1] || finishType === 'elden';
    }
    if (isElden && finishType !== 'okey') {
      finishType = 'elden';
    }
  }

  // Check if no other player has opened
  let noOneElseOpened = false;
  if (winnerId !== -1) {
    noOneElseOpened = opened.filter((op, idx) => idx !== winnerId && op === true).length === 0;
  }

  // ── Double multiplier (elden bitiş or okey ile bitiş) ──
  let doubleAll = (finishType === 'elden' || finishType === 'okey');

  // ── Calculate round scores ──
  let roundScores = [0, 0, 0, 0];

  if (winnerId !== -1 && isElden && noOneElseOpened) {
    // Special hand finish when no one has opened: winner gets -200, others get +400
    for (let i = 0; i < 4; i++) {
      if (i === winnerId) {
        roundScores[i] = -200;
      } else {
        roundScores[i] = 400;
      }
    }
  } else {
    // Standard 101 Okey scoring
    for (let i = 0; i < 4; i++) {
      if (winnerId !== -1 && i === winnerId) {
        // Winner gets reward
        if (finishType === 'elden' || finishType === 'okey') {
          roundScores[i] = -202;
        } else {
          roundScores[i] = -101;
        }
      } else if (winnerId === -1) {
        // Deck ran out: everyone who didn't open gets 202
        if (!opened[i]) {
          roundScores[i] = 202;
        } else {
          let val = hands[i].reduce((s, t) => s + tileValue(t), 0);
          if (openingTypes[i] === 'pairs') val *= 2;
          if (doubleAll) val *= 2;
          roundScores[i] = val;
        }
      } else {
        // Loser scoring
        if (!opened[i]) {
          // Never opened: 202 base penalty
          let penalty = 202;
          if (doubleAll) penalty *= 2;
          roundScores[i] = penalty;
        } else {
          // Opened: sum of remaining tile values
          let val = hands[i].reduce((s, t) => s + tileValue(t), 0);
          if (openingTypes[i] === 'pairs') val *= 2;
          if (doubleAll) val *= 2;
          roundScores[i] = val;
        }
      }
    }
  }

  // Add roundPenalties to roundScores and update totalScores
  for (let i = 0; i < 4; i++) {
    roundScores[i] += roundPenalties[i];
    totalScores[i] += roundScores[i];
  }

  // ── Host uploads round end state ──
  uploadRoundEndState(winnerId, finishType, roundScores, hands, opened);

  // ── Show modal locally ──
  showRoundModal(winnerId, finishType, roundScores, hands, opened);
}

/**
 * Shows the end-of-round score modal
 */
function showRoundModal(winnerId, finishType, roundScores, hands, opened) {
  const names = playersInfo.map(p => p.name);
  const avatars = playersInfo.map(p => p.isBot ? '🤖' : '🧑');

  let finishLabel = '';
  if (finishType === 'elden') finishLabel = ' <span style="color:#ffd700">(Elden Bitiş!)</span>';
  else if (finishType === 'okey') finishLabel = ' <span style="color:#ffd700">(Okey ile Bitiş!)</span>';

  let winnerName = winnerId === -1 ? 'Kimse (Deste Bitti)' : names[winnerId];

  let rows = '';
  for (let i = 0; i < 4; i++) {
    let isWinner = (winnerId !== -1 && i === winnerId);
    let openedLabel = opened[i]
      ? `<span style="color:#4cff91;font-size:11px">✓ Açık</span>`
      : `<span style="color:#ff5252;font-size:11px">✗ Kapalı</span>`;
    let handVal = hands[i].reduce((s, t) => s + tileValue(t), 0);
    let roundColor = roundScores[i] < 0 ? '#4cff91' : (roundScores[i] >= 202 ? '#ff5252' : '#ffe082');
    let rowBg = isWinner ? 'rgba(76,255,145,0.08)' : 'transparent';
    rows += `
      <tr style="background:${rowBg}">
        <td style="padding:10px 14px;font-size:15px">${isWinner ? '👑 ' : ''}${avatars[i]} ${names[i]}</td>
        <td style="padding:10px 14px;text-align:center">${openedLabel}</td>
        <td style="padding:10px 14px;text-align:center;font-size:12px;color:#aaa">${hands[i].length > 0 ? handVal + ' pt' : '0 pt'}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:900;color:${roundColor};font-size:17px">${roundScores[i] > 0 ? '+' : ''}${roundScores[i]}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:800;color:#fff;font-size:15px">${totalScores[i] > 0 ? '+' : ''}${totalScores[i]}</td>
      </tr>`;
  }

  let modalHtml = `
  <div id="round-modal-overlay" style="
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.78);
    z-index:9999;
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn 0.3s ease;
  ">
    <div style="
      background:linear-gradient(160deg,#1a2535 0%,#0d1520 100%);
      border:1.5px solid rgba(255,255,255,0.12);
      border-radius:18px;
      padding:32px 36px;
      min-width:520px;
      box-shadow:0 24px 60px rgba(0,0,0,0.8);
      font-family:'Outfit',sans-serif;
      color:#fff;
    ">
      <div style="text-align:center;margin-bottom:22px">
        <div style="font-size:13px;color:#aaa;letter-spacing:2px;text-transform:uppercase">El ${roundNumber} Sonu</div>
        <div style="font-size:26px;font-weight:900;margin-top:4px">${winnerName} Kazandı!${finishLabel}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
            <th style="padding:8px 14px;text-align:left;color:#aaa;font-size:12px;font-weight:600">OYUNCU</th>
            <th style="padding:8px 14px;text-align:center;color:#aaa;font-size:12px;font-weight:600">DURUM</th>
            <th style="padding:8px 14px;text-align:center;color:#aaa;font-size:12px;font-weight:600">KALAN</th>
            <th style="padding:8px 14px;text-align:right;color:#aaa;font-size:12px;font-weight:600">BU EL</th>
            <th style="padding:8px 14px;text-align:right;color:#aaa;font-size:12px;font-weight:600">TOPLAM</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center">
        <button onclick="nextRound()" style="
          background:linear-gradient(180deg,#31703b,#1c4523);
          border:1.5px solid #52a15e;
          color:white;font-weight:800;font-size:14px;
          padding:12px 28px;border-radius:10px;cursor:pointer;
          box-shadow:0 4px 0 rgba(0,0,0,0.4);
        ">Yeni El Oyna →</button>
        <button onclick="endGame()" style="
          background:linear-gradient(180deg,#b22222,#701111);
          border:1.5px solid #d34e4e;
          color:white;font-weight:800;font-size:14px;
          padding:12px 28px;border-radius:10px;cursor:pointer;
          box-shadow:0 4px 0 rgba(0,0,0,0.4);
        ">Oyunu Bitir</button>
      </div>
    </div>
  </div>`;

  // Inject modal into page
  if (!document.body) return;  // guard for test environments
  let existing = document.getElementById('round-modal-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Starts the next round (keeps total scores)
 */
function nextRound() {
  let existing = document.getElementById('round-modal-overlay');
  if (existing) existing.remove();
  
  if (mySeatIndex === 0) {
    roundNumber++;
    dealTiles();
  }
}

/**
 * Shows final game winner and resets
 */
function endGame() {
  let existing = document.getElementById('round-modal-overlay');
  if (existing) existing.remove();

  const names = playersInfo.map(p => p.name);
  let minScore = Math.min(...totalScores);
  let winnerIdx = totalScores.indexOf(minScore);

  let finalRows = names.map((n, i) => {
    let isWin = i === winnerIdx;
    return `<tr style="background:${isWin ? 'rgba(76,255,145,0.1)' : 'transparent'}">
      <td style="padding:10px 16px;font-size:16px">${isWin ? '🏆 ' : ''}${n}</td>
      <td style="padding:10px 16px;text-align:right;font-weight:900;font-size:20px;color:${isWin ? '#4cff91' : '#ffe082'}">${totalScores[i] > 0 ? '+' : ''}${totalScores[i]}</td>
    </tr>`;
  }).join('');

  let html = `
  <div id="round-modal-overlay" style="
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.85);z-index:9999;
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="
      background:linear-gradient(160deg,#1a2535,#0d1520);
      border:1.5px solid rgba(255,255,255,0.12);
      border-radius:18px;padding:36px 44px;
      min-width:380px;text-align:center;
      font-family:'Outfit',sans-serif;color:#fff;
      box-shadow:0 24px 60px rgba(0,0,0,0.8);
    ">
      <div style="font-size:32px;margin-bottom:6px">🏆</div>
      <div style="font-size:26px;font-weight:900;margin-bottom:4px">${names[winnerIdx]} Kazandı!</div>
      <div style="font-size:13px;color:#aaa;margin-bottom:24px">${roundNumber} El Oynandı</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <th style="padding:8px;text-align:left;color:#aaa;font-size:12px">OYUNCU</th>
          <th style="padding:8px;text-align:right;color:#aaa;font-size:12px">TOPLAM PUAN</th>
        </tr></thead>
        <tbody>${finalRows}</tbody>
      </table>
      <button onclick="resetGame()" style="
        background:linear-gradient(180deg,#6c429c,#4a2b70);
        border:1.5px solid #8e62c2;
        color:white;font-weight:800;font-size:14px;
        padding:12px 28px;border-radius:10px;cursor:pointer;
      ">Yeni Oyun Başlat</button>
    </div>
  </div>`;

  let existing2 = document.getElementById('round-modal-overlay');
  if (existing2) existing2.remove();
  if (!document.body) return;  // guard for test environments
  document.body.insertAdjacentHTML('beforeend', html);
}

/**
 * Resets entire game (scores back to 0)
 */
function resetGame() {
  let existing = document.getElementById('round-modal-overlay');
  if (existing) existing.remove();
  
  if (mySeatIndex === 0) {
    roundNumber = 1;
    totalScores = [0, 0, 0, 0];
    dealTiles();
  }
}

function finishGame() {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Oyunu bitiremezsiniz.");
    return;
  }
  let tilesCount = rackSlots.filter(t => t !== null).length;
  if (!player.opened) {
    showMessage("Oyunu bitirmek için önce elinizi açmalısınız!");
    return;
  }
  if (tilesCount > 1) {
    showMessage(`Oyunu bitirmek için elde en fazla 1 taş kalabilir. Şu anki taş sayısı: ${tilesCount}`);
    return;
  }

  // Determine finish type
  let lastTile = rackSlots.find(t => t !== null);
  let finishType = 'normal';
  if (playerFinishedFromHand) finishType = 'elden';
  else if (lastTile && isWildcard(lastTile)) finishType = 'okey';

  // Remove last tile (it's discarded as finishing move)
  if (lastTile) {
    let idx = rackSlots.indexOf(lastTile);
    discardPiles[0].push(lastTile);
    rackSlots[idx] = null;
  }

  endRound(0, finishType);
}

/**
 * Pass the turn to the next player
 */
function passTurn() {
  tookDiscardThisTurn = false;
  discardedTileTaken = null;
  if (currentTurn > 0) {
    botOpenedThisTurn[currentTurn - 1] = false;
  }
  
  let prevTurn = currentTurn;

  currentTurn = (currentTurn + 1) % 4;
  updateTurnHighlight();

  // If the turn transition was driven by us (the player whose turn just ended), sync it!
  // Host also syncs when bot turns end
  if (prevTurn === mySeatIndex || (isSeatBot(prevTurn) && mySeatIndex === 0)) {
    uploadGameState();
  }

  if (currentTurn === mySeatIndex) {
    showMessage("Sıra sizde! Yerden taş çekin veya yandan atılan taşı alın.");
  } else if (isSeatBot(currentTurn)) {
    // Only Host runs bot turns
    if (mySeatIndex === 0) {
      setTimeout(runBotTurn, 800);
    } else {
      showMessage(`${playersInfo[currentTurn] ? playersInfo[currentTurn].name : 'Bot'} oynuyor...`);
    }
  } else {
    showMessage(`${playersInfo[currentTurn] ? playersInfo[currentTurn].name : 'Oyuncu'} oynuyor...`);
  }
}

/**
 * Simulates a bot's turn (drawing and discarding a tile)
 */
function runBotTurn() {
  const botNames = playersInfo.map(p => p.name);
  let name = botNames[currentTurn];

  if (deck.length === 0) {
    showMessage("Yerde çekilecek taş kalmadı! El bitti.");
    setTimeout(() => endRound(-1, 'normal'), 600);
    return;
  }

  // Draw tile
  let tile = deck.pop();
  botHands[currentTurn - 1].push(tile);
  showMessage(`${name} yerden taş çekiyor...`);
  document.getElementById("deck-tile-count").textContent = getCalculatedDeckCount();

  // Discard tile after delay
  setTimeout(() => {
    // Check if bot wants to open hand
    let botOpenedThisTurn = false;
    let badgeText = document.getElementById(`p${currentTurn}-score-badge`).textContent;
    if (!badgeText.startsWith("Açık")) {
      botOpenedThisTurn = botTryOpen(currentTurn);
      if (botOpenedThisTurn) {
        renderOpenedGroups();
      }
    }

    // Bot discards a random tile — never Okey if possible
    let hand = botHands[currentTurn - 1];
    // Prefer non-Okey tiles
    let nonOkeyIndices = hand.map((t, i) => i).filter(i => !isWildcard(hand[i]));
    let discardIndex;
    if (nonOkeyIndices.length > 0) {
      discardIndex = nonOkeyIndices[Math.floor(Math.random() * nonOkeyIndices.length)];
    } else {
      discardIndex = Math.floor(Math.random() * hand.length); // forced to discard Okey
    }
    let discardTile = hand.length > 0 ? hand.splice(discardIndex, 1)[0] : tile;

    discardPiles[currentTurn].push(discardTile);
    renderDiscard();

    let discardTileName = isWildcard(discardTile) ? 'Okey' : (discardTile.fake ? 'Sahte Okey' : discardTile.color.toUpperCase() + ' ' + discardTile.num);
    let discardMsg = `${name} yere taş attı: ${discardTileName}`;
    if (botOpenedThisTurn) {
      discardMsg = `${name} elini açtı ve yere taş attı: ${discardTileName}`;
    }
    showMessage(discardMsg);

    // Check if bot's hand is now empty → auto-finish
    if (botHands[currentTurn - 1].length === 0 && botOpened[currentTurn - 1]) {
      const botWinnerId = currentTurn;
      setTimeout(() => endRound(botWinnerId, 'normal'), 600);
      return;
    }

    // Pass turn after another delay
    setTimeout(() => {
      passTurn();
    }, 800);

  }, 800);
}

/**
 * Auto-Sorts tiles into Runs (Series)
 */
function sortSeries() {
  // Extract all non-null tiles
  let tiles = rackSlots.filter(t => t !== null);
  let originalTiles = new Map(tiles.map(t => [t.id, t]));
  
  // Separate wildcards & normal tiles
  let wildcards = tiles.filter(t => isWildcard(t));
  let normals = tiles.filter(t => !isWildcard(t)).map(getEffectiveTile);

  let groups = [];
  let usedIds = new Set();

  // 1. Find Same-Number different-color sets
  for (let n = 1; n <= 13; n++) {
    let matches = normals.filter(t => t.num === n && !usedIds.has(t.id));
    // Unique colors
    let uniqueMatches = [];
    let seenColors = new Set();
    matches.forEach(t => {
      if (!seenColors.has(t.color)) {
        seenColors.add(t.color);
        uniqueMatches.push(t);
      }
    });

    if (uniqueMatches.length >= 3) {
      groups.push(uniqueMatches);
      uniqueMatches.forEach(t => usedIds.add(t.id));
    }
  }

  // 2. Find Consecutive runs of same color
  colors.forEach(col => {
    let sameCol = normals.filter(t => t.color === col && !usedIds.has(t.id));
    sameCol.sort((a, b) => a.num - b.num);

    let currentRun = [];
    for (let i = 0; i < sameCol.length; i++) {
      if (currentRun.length === 0) {
        currentRun.push(sameCol[i]);
      } else {
        let last = currentRun[currentRun.length - 1];
        if (sameCol[i].num === last.num + 1) {
          currentRun.push(sameCol[i]);
        } else if (sameCol[i].num !== last.num) {
          if (currentRun.length >= 3) {
            groups.push(currentRun);
            currentRun.forEach(t => usedIds.add(t.id));
          }
          currentRun = [sameCol[i]];
        }
      }
    }
    if (currentRun.length >= 3) {
      groups.push(currentRun);
      currentRun.forEach(t => usedIds.add(t.id));
    }
  });

  // Collect leftovers
  let leftovers = normals.filter(t => !usedIds.has(t.id));

  // Build sorted array with gaps
  let sortedSlots = [];
  groups.forEach(g => {
    // Add group tiles
    g.forEach(t => sortedSlots.push(originalTiles.get(t.id)));
    // Add gap
    if (sortedSlots.length < 40) sortedSlots.push(null);
  });

  // Add wildcards at the end of first row or near groups
  if (wildcards.length > 0) {
    wildcards.forEach(w => sortedSlots.push(originalTiles.get(w.id)));
    sortedSlots.push(null);
  }

  // Add leftovers
  leftovers.forEach(t => sortedSlots.push(originalTiles.get(t.id)));

  // Fill the rest with null
  while (sortedSlots.length < 40) {
    sortedSlots.push(null);
  }

  rackSlots = sortedSlots.slice(0, 40);
  selectedIndex = null;
  updateAll("Seri dizilimi yapıldı.");
}

/**
 * Auto-Sorts tiles into Pairs
 */
function sortPairs() {
  let tiles = rackSlots.filter(t => t !== null);
  let originalTiles = new Map(tiles.map(t => [t.id, t]));
  
  let wildcards = tiles.filter(t => isWildcard(t));
  let normals = tiles.filter(t => !isWildcard(t)).map(getEffectiveTile);

  let pairsList = [];
  let usedIds = new Set();

  // Find identical pairs
  for (let i = 0; i < normals.length; i++) {
    if (usedIds.has(normals[i].id)) continue;
    for (let j = i + 1; j < normals.length; j++) {
      if (usedIds.has(normals[j].id)) continue;
      if (normals[i].num === normals[j].num && normals[i].color === normals[j].color) {
        pairsList.push([normals[i], normals[j]]);
        usedIds.add(normals[i].id);
        usedIds.add(normals[j].id);
        break;
      }
    }
  }

  let leftovers = normals.filter(t => !usedIds.has(t.id));

  // Build slots with empty spaces
  let sortedSlots = [];
  pairsList.forEach(p => {
    sortedSlots.push(originalTiles.get(p[0].id));
    sortedSlots.push(originalTiles.get(p[1].id));
    sortedSlots.push(null);
  });

  // Use wildcards to pair up leftovers
  let wildIdx = 0;
  while (wildIdx < wildcards.length && leftovers.length > 0) {
    let t = leftovers.shift();
    let w = wildcards[wildIdx++];
    sortedSlots.push(originalTiles.get(t.id));
    sortedSlots.push(originalTiles.get(w.id));
    sortedSlots.push(null);
  }

  // Remaining wildcards
  while (wildIdx < wildcards.length) {
    sortedSlots.push(originalTiles.get(wildcards[wildIdx++].id));
  }

  // Leftovers
  leftovers.forEach(t => sortedSlots.push(originalTiles.get(t.id)));

  // Fill rest
  while (sortedSlots.length < 40) {
    sortedSlots.push(null);
  }

  rackSlots = sortedSlots.slice(0, 40);
  selectedIndex = null;
  updateAll("Çift dizilimi yapıldı.");
}

/**
 * Calculates possible score and updates message with tips
 */
function showTip() {
  recalculateScore();
  let msg = "";
  if (player.score >= 101) {
    msg = `Elinizdeki perlerin değeri ${player.score} puan. Seri dizerek elinizi AÇABİLİRSİNİZ!`;
  } else if (player.pairs >= 5) {
    msg = `Elinizde ${player.pairs} çift var. Çift dizerek elinizi AÇABİLİRSİNİZ!`;
  } else {
    let diff = 101 - player.score;
    msg = `Şu anki perlerin puanı ${player.score}. Seri açabilmek için ${diff} puan daha gerekiyor. Çift açmak için ${5 - player.pairs} çift daha lazım.`;
  }
  showMessage(msg);
}

/**
 * Utility to display standard message to the player
 */
function showMessage(text) {
  document.getElementById("message").textContent = text;
}

/**
 * Dynamically calculates the remaining deck size based on tiles in hands, on board, and indicator.
 * Conforms to the total count of 106 tiles.
 */
function getCalculatedDeckCount() {
  let playerHandCount = rackSlots.filter(t => t !== null).length;
  let botHandsCount = botHands.reduce((sum, h) => sum + h.length, 0);
  let discardsCount = discardPiles.reduce((sum, p) => sum + p.length, 0);
  let openedCount = openedGroups.reduce((sum, g) => sum + g.tiles.length, 0);
  let indicatorCount = okeyTileInfo ? 1 : 0;
  
  let calculated = 106 - playerHandCount - botHandsCount - discardsCount - openedCount - indicatorCount;
  
  // Fall back to actual deck.length if mismatch is detected (e.g., in unit tests)
  if (calculated !== deck.length) {
    return deck.length;
  }
  return calculated;
}

/**
 * Processes (lays off) a tile from the player's rack onto an opened table group.
 */
/**
 * Returns true if the given tile can be legally laid off on any existing opened group.
 * Does NOT modify any state — pure check only.
 */
function tileCanLayOff(tile) {
  if (!tile || !openedGroups || openedGroups.length === 0) return false;
  for (let g = 0; g < openedGroups.length; g++) {
    const group = openedGroups[g];
    // Check if player is allowed to lay off on this group based on opening type:
    if (player.openingType === 'pairs') {
      if (group.type !== 'pair') continue; // pairs players cannot lay off on series
    } else if (player.openingType === 'series') {
      if (group.type === 'pair') {
        if (!botOpeningType.includes('pairs')) continue; // series players cannot lay off on pairs unless a bot has opened pairs
      }
    }
    const tiles = group.tiles;
    // Try prepend
    const prepend = [{ ...tile, slotIndex: 0 }, ...tiles.map((t, i) => ({ ...t, slotIndex: i + 1 }))];
    if (validateConsecutiveRun(prepend).valid || validateSameNumberSet(prepend).valid) return true;
    // Try append
    const append = [...tiles.map((t, i) => ({ ...t, slotIndex: i })), { ...tile, slotIndex: tiles.length }];
    if (validateConsecutiveRun(append).valid || validateSameNumberSet(append).valid) return true;
  }
  return false;
}

function layOffTile(draggedIdx, groupIdx) {
  if (currentTurn !== mySeatIndex) {
    showMessage("Sıra sizde değil! Taş işleyemezsiniz.");
    return;
  }
  if (!hasDrawn) {
    showMessage("Önce yerden veya yandan taş çekmelisiniz!");
    return;
  }
  if (!player.opened) {
    showMessage("İşlek işlemek için önce kendi elinizi açmış olmalısınız!");
    return;
  }

  let tile = rackSlots[draggedIdx];
  if (!tile) return;

  let group = openedGroups[groupIdx];
  if (!group) return;

  // Enforce series vs pairs layoff rules
  if (player.openingType === 'pairs') {
    if (group.type !== 'pair') {
      showMessage("Çift açtığınız için seri gruplara taş işleyemezsiniz!");
      return;
    }
  } else if (player.openingType === 'series') {
    if (group.type === 'pair') {
      if (!botOpeningType.includes('pairs')) {
        showMessage("Rakiplerden hiçbiri çift açmadığı için çiftlere taş işleyemezsiniz!");
        return;
      }
    }
  }

  let tiles = group.tiles;

  // 1. Try prepending
  let prependTiles = [{ ...tile, slotIndex: 0 }, ...tiles.map((t, idx) => ({ ...t, slotIndex: idx + 1 }))];
  let prependValid = false;
  if (validateConsecutiveRun(prependTiles).valid || validateSameNumberSet(prependTiles).valid) {
    prependValid = true;
  }

  // 2. Try appending
  let appendTiles = [...tiles.map((t, idx) => ({ ...t, slotIndex: idx })), { ...tile, slotIndex: tiles.length }];
  let appendValid = false;
  if (validateConsecutiveRun(appendTiles).valid || validateSameNumberSet(appendTiles).valid) {
    appendValid = true;
  }

  if (prependValid) {
    group.tiles.unshift({ ...tile, laidOff: true });
  } else if (appendValid) {
    group.tiles.push({ ...tile, laidOff: true });
  } else {
    showMessage("Bu taş bu seriye işlenemez!");
    return;
  }

  // Remove tile from rack
  rackSlots[draggedIdx] = null;
  if (selectedIndex === draggedIdx) {
    selectedIndex = null;
  }

  updateAll(`Taş seriye işlendi: ${tile.fake ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.num}`);
  uploadGameState();
}

/**
 * Updates all visual aspects of the board
 */
function updateAll(statusText) {
  recalculateScore();
  renderHand();
  renderOkey();
  renderDiscard();
  renderOpenedGroups();
  
  if (statusText) {
    showMessage(statusText);
  }

  // Update deck size using dynamic calculation
  document.getElementById("deck-tile-count").textContent = getCalculatedDeckCount();

  // Update round number display
  let roundValEl = document.getElementById("round-val");
  if (roundValEl) {
    roundValEl.textContent = `${roundNumber} / 10`;
  }

  // Update scoreboard dropdown scores
  for (let i = 0; i < 4; i++) {
    let scoreEl = document.getElementById(`score-p${i}`);
    if (scoreEl) {
      scoreEl.textContent = `${totalScores[i] > 0 ? '+' : ''}${totalScores[i]}`;
    }
  }
}

function toggleScoreDropdown(event) {
  if (event) event.stopPropagation();
  let menu = document.getElementById('score-dropdown-menu');
  if (menu) {
    if (menu.style.display === 'block') {
      menu.style.display = 'none';
    } else {
      menu.style.display = 'block';
    }
  }
}

// Close dropdown if clicked outside
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('click', () => {
    let menu = document.getElementById('score-dropdown-menu');
    if (menu) menu.style.display = 'none';
  });
}

// Global functions exposed to inline HTML event listeners
window.dealTiles = dealTiles;
window.sortSeries = sortSeries;
window.sortPairs = sortPairs;
window.openHand = openHand;
window.recall = recall;
window.drawTile = drawTile;
window.discardTile = discardTile;
window.takeDiscard = takeDiscard;
window.showTip = showTip;
window.finishGame = finishGame;
window.layOffTile = layOffTile;
window.layDownGroup = layDownGroup;
window.toggleTileFacedown = toggleTileFacedown;
window.nextRound = nextRound;
window.endGame = endGame;
window.resetGame = resetGame;
window.toggleScoreDropdown = toggleScoreDropdown;
window.socketCreateRoom = socketCreateRoom;
window.socketJoinRoom = socketJoinRoom;
window.socketStartGame = socketStartGame;
window.playOffline = playOffline;


// Initial game trigger on DOM Ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initSocket();
    if (!socket) {
      dealTiles();
    }
    initTouchDrag();
    initSpecialDrags();
  });
} else {
  initSocket();
  if (!socket) {
    dealTiles();
  }
  if (typeof initTouchDrag === 'function') initTouchDrag();
  if (typeof initSpecialDrags === 'function') initSpecialDrags();
}

// ──────────────────────────────────────────────
//  SPECIAL DRAG INTERACTIONS (Mouse/Desktop only)
//  Touch equivalent is handled in initTouchDrag
// ──────────────────────────────────────────────
function initSpecialDrags() {
  if (typeof document === 'undefined') return;
  if (typeof document.querySelector !== 'function') return;

  function safeAddEvent(el, evt, fn) {
    if (el && typeof el.addEventListener === 'function') el.addEventListener(evt, fn);
  }

  // ── 1. Deck draggable ──
  const deckEl = document.getElementById('deck-stack');
  safeAddEvent(deckEl, 'dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'DECK');
    e.dataTransfer.effectAllowed = 'copy';
  });

  // ── 2. Center discard tile draggable ──
  //    (also re-patched after renderDiscard via patchDiscardDrag)
  patchDiscardDrag();

  // ── 3. Rack-wood = drop target for DECK / DISCARD ──
  const rackWood = document.querySelector('.rack-wood');
  safeAddEvent(rackWood, 'dragover', (e) => {
    e.preventDefault();
    if (rackWood) rackWood.classList.add('drag-hover-slot');
  });
  safeAddEvent(rackWood, 'dragleave', () => {
    if (rackWood) rackWood.classList.remove('drag-hover-slot');
  });
  safeAddEvent(rackWood, 'drop', (e) => {
    e.preventDefault();
    if (rackWood) rackWood.classList.remove('drag-hover-slot');
    const val = e.dataTransfer.getData('text/plain');
    // Detect which slot was dropped on
    let targetSlot = null;
    const dropTarget = e.target.closest('[data-slot-index]');
    if (dropTarget) {
      const si = parseInt(dropTarget.getAttribute('data-slot-index'), 10);
      if (rackSlots[si] === null) targetSlot = si;
    }
    if (val === 'DECK')    drawTile(targetSlot);
    if (val === 'DISCARD') takeDiscard(targetSlot);
  });

  // ── 4. Player discard zone = drop target (rack tile → AT) ──
  const dzp0 = document.getElementById('discard-zone-p0');
  safeAddEvent(dzp0, 'dragover', (e) => {
    if (currentTurn === 0 && hasDrawn) {
      e.preventDefault();
      dzp0.classList.add('discard-drop-hover');
    }
  });
  safeAddEvent(dzp0, 'dragleave', () => dzp0 && dzp0.classList.remove('discard-drop-hover'));
  safeAddEvent(dzp0, 'drop', (e) => {
    e.preventDefault();
    if (dzp0) dzp0.classList.remove('discard-drop-hover');
    const idx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(idx) && rackSlots[idx] !== null) {
      selectedIndex = idx;
      discardTile();
    }
  });
}

/**
 * Patches the #discardTile element to be draggable (called after every renderDiscard).
 * This ensures the center discard tile is always draggable even after re-render.
 */
function patchDiscardDrag() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('discardTile');
  if (!el || typeof el.addEventListener !== 'function') return;
  if (el.getAttribute('data-drag-patched')) return;   // already patched
  el.setAttribute('draggable', 'true');
  el.setAttribute('data-drag-patched', '1');
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'DISCARD');
    e.dataTransfer.effectAllowed = 'move';
  });
}


// ──────────────────────────────────────────────
//  TOUCH DRAG-AND-DROP (Mobile / Tablet Support)
//  Handles ALL drag sources with touch events:
//  • Rack tile → another rack slot (swap/move)
//  • Rack tile → opened group (layoff)
//  • Rack tile → player discard zone (discard/AT)
//  • Deck → anywhere on rack (draw tile / TAŞ ÇEK)
//  • Center discard tile → anywhere on rack (take discard)
// ──────────────────────────────────────────────
function initTouchDrag() {
  if (typeof document === 'undefined') return;

  // 'rack'    : dragging a rack tile (touchSrcIndex = slot index)
  // 'deck'    : dragging the center deck stack
  // 'discard' : dragging the center discard tile
  let touchSrcType  = null;
  let touchSrcIndex = null;
  let ghost = null;
  let longPressTimer = null;

  function createGhost(el, cx, cy) {
    ghost = el.cloneNode(true);
    ghost.style.cssText = `
      position:fixed; pointer-events:none; opacity:0.88;
      z-index:99999; transform:scale(1.2); transition:none;
      left:${cx - el.offsetWidth/2}px; top:${cy - el.offsetHeight/2}px;
      border-radius:6px; box-shadow:0 8px 24px rgba(0,0,0,0.7);
    `;
    document.body.appendChild(ghost);
  }

  function moveGhost(cx, cy) {
    if (!ghost) return;
    ghost.style.left = (cx - ghost.offsetWidth  / 2) + 'px';
    ghost.style.top  = (cy - ghost.offsetHeight / 2) + 'px';
  }

  function removeGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
  }

  function getAttr(el, attr) {
    while (el && el !== document.body) {
      const v = el.getAttribute(attr);
      if (v !== null) return v;
      el = el.parentElement;
    }
    return null;
  }

  function isInsideRack(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('rack-wood')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function isInsideDiscardZoneP0(el) {
    while (el && el !== document.body) {
      if (el.id === 'discard-zone-p0') return true;
      el = el.parentElement;
    }
    return false;
  }

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const target = e.target;

    // ── Deck (center draw pile) ──
    if (target.closest('#deck-stack')) {
      touchSrcType  = 'deck';
      touchSrcIndex = null;
      const el = target.closest('#deck-stack');
      createGhost(el, touch.clientX, touch.clientY);
      return;
    }

    // ── Center discard tile OR any opponent discard tile ──
    const discardEl = target.closest('#discardTile') || target.closest('[data-touch-discard]');
    if (discardEl) {
      touchSrcType  = 'discard';
      touchSrcIndex = null;
      createGhost(discardEl, touch.clientX, touch.clientY);
      return;
    }

    // ── Rack tile ──
    const slotEl = target.closest('[data-slot-index]');
    if (slotEl) {
      const idx = parseInt(slotEl.getAttribute('data-slot-index'), 10);
      if (rackSlots[idx] !== null) {
        touchSrcType  = 'rack';
        touchSrcIndex = idx;
        createGhost(slotEl, touch.clientX, touch.clientY);
        slotEl.classList.add('dragging');
      }
    }
  }, { passive: true });


  document.addEventListener('touchmove', (e) => {
    if (!touchSrcType) return;
    e.preventDefault();
    moveGhost(e.touches[0].clientX, e.touches[0].clientY);

    // Visual feedback: highlight drop zones
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    // Discard zone highlight (only for rack tiles)
    const dzp0 = document.getElementById('discard-zone-p0');
    if (dzp0) {
      if (touchSrcType === 'rack' && el && isInsideDiscardZoneP0(el)) {
        dzp0.classList.add('discard-drop-hover');
      } else {
        dzp0.classList.remove('discard-drop-hover');
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!touchSrcType) return;

    const touch   = e.changedTouches[0];
    const srcType = touchSrcType;
    const srcIdx  = touchSrcIndex;

    removeGhost();

    // Clean up dragging class
    if (srcIdx !== null) {
      const srcEl = document.querySelector(`[data-slot-index="${srcIdx}"]`);
      if (srcEl) srcEl.classList.remove('dragging');
    }

    // Clean up hover classes
    const dzp0 = document.getElementById('discard-zone-p0');
    if (dzp0) dzp0.classList.remove('discard-drop-hover');
    const rw = document.querySelector('.rack-wood');
    if (rw) rw.classList.remove('drag-hover-slot');

    touchSrcType  = null;
    touchSrcIndex = null;

    // Find element under finger
    const dropEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!dropEl) return;

    // ── DECK: drop anywhere on rack → drawTile(targetSlot) ──
    if (srcType === 'deck') {
      if (isInsideRack(dropEl)) {
        const slotStr = getAttr(dropEl, 'data-slot-index');
        const targetSlot = slotStr !== null && rackSlots[parseInt(slotStr,10)] === null
          ? parseInt(slotStr, 10) : null;
        drawTile(targetSlot);
      }
      return;
    }

    // ── CENTER DISCARD: drop anywhere on rack → takeDiscard(targetSlot) ──
    if (srcType === 'discard') {
      if (isInsideRack(dropEl)) {
        const slotStr = getAttr(dropEl, 'data-slot-index');
        const targetSlot = slotStr !== null && rackSlots[parseInt(slotStr,10)] === null
          ? parseInt(slotStr, 10) : null;
        takeDiscard(targetSlot);
      }
      return;
    }

    // ── RACK TILE ──
    if (srcType === 'rack') {
      // Drop on player's discard zone → discard (AT)
      if (isInsideDiscardZoneP0(dropEl)) {
        selectedIndex = srcIdx;
        discardTile();
        return;
      }

      // Drop on an opened group → layoff
      const groupIdxStr = getAttr(dropEl, 'data-group-index');
      if (groupIdxStr !== null) {
        layOffTile(srcIdx, parseInt(groupIdxStr, 10));
        return;
      }

      // Drop on another rack slot → swap/move
      const destIdxStr = getAttr(dropEl, 'data-slot-index');
      if (destIdxStr !== null) {
        const destIdx = parseInt(destIdxStr, 10);
        if (destIdx !== srcIdx) {
          let temp = rackSlots[destIdx];
          rackSlots[destIdx] = rackSlots[srcIdx];
          rackSlots[srcIdx]  = temp;
          selectedIndex = null;
          selectedGroupIndices = [];
          updateAll('Taş taşındı.');
        }
        return;
      }
    }
  }, { passive: true });
}

// ──────────────────────────────────────────────
//  SOCKET.IO MULTIPLAYER ACTIONS & LISTENERS
// ──────────────────────────────────────────────
function uploadGameState() {
  if (!socket || !myRoomCode) return;

  const hands = [null, null, null, null];
  hands[mySeatIndex] = rackSlots;

  // Read our local variables and set them in the server seat arrays
  // For other seats, we keep their values from the last received server state so we don't lose them!
  const playersOpened = [false, false, false, false];
  const playersOpenedThisTurn = [false, false, false, false];
  const playersOpeningType = [null, null, null, null];

  playersOpened[mySeatIndex] = player.opened;
  playersOpenedThisTurn[mySeatIndex] = player.openedThisTurn;
  playersOpeningType[mySeatIndex] = player.openingType;

  // Host (seat 0) manages bot variables as well
  if (mySeatIndex === 0) {
    for (let v = 1; v <= 3; v++) {
      let i = (v + mySeatIndex) % 4; // which is just i = v
      playersOpened[i] = botOpened[v - 1];
      playersOpenedThisTurn[i] = botOpenedThisTurn[v - 1];
      playersOpeningType[i] = botOpeningType[v - 1];
    }
  }

  const state = {
    deckCount: deck.length,
    deck: deck,
    discardPiles: discardPiles,
    openedGroups: openedGroups,
    currentTurn: currentTurn,
    roundNumber: roundNumber,
    totalScores: totalScores,
    roundPenalties: roundPenalties,
    
    playersOpened: playersOpened,
    playersOpenedThisTurn: playersOpenedThisTurn,
    playersOpeningType: playersOpeningType,
    playerFinishedFromHand: playerFinishedFromHand,
    
    okeyTileInfo: okeyTileInfo,
    okeyWildcardValue: okeyWildcardValue,
    
    hands: hands,
    botHands: botHands
  };

  socket.emit('sync_state', state);
}

function uploadRoundEndState(winnerId, finishType, roundScores, hands, opened) {
  if (!socket || !myRoomCode || mySeatIndex !== 0) return;

  const state = {
    gamePhase: 'round_ended',
    winnerId: winnerId,
    finishType: finishType,
    roundScores: roundScores,
    hands: hands,
    opened: opened,
    totalScores: totalScores,
    roundNumber: roundNumber
  };

  socket.emit('sync_state', state);
}

function initSocket() {
  const warningEl = document.getElementById('file-protocol-warning');
  if (typeof io === 'undefined') {
    console.log("Socket.IO client library not loaded.");
    if (warningEl) {
      warningEl.style.display = 'block';
      warningEl.style.background = 'rgba(220, 53, 69, 0.15)';
      warningEl.style.borderColor = 'rgba(220, 53, 69, 0.4)';
      warningEl.style.color = '#ff6b6b';
      warningEl.innerHTML = "⚠️ İnternet bağlantısı yok veya Socket.IO kütüphanesi yüklenemedi. Sadece çevrimdışı oynayabilirsiniz.";
    }
    return;
  }

  if (warningEl) {
    warningEl.style.display = 'block';
    warningEl.style.background = 'rgba(255, 193, 7, 0.15)';
    warningEl.style.borderColor = 'rgba(255, 193, 7, 0.4)';
    warningEl.style.color = '#ffc107';
    warningEl.innerHTML = "🔄 Sunucuya bağlanılıyor (Bulut sunucusunun uyanması 50 saniye kadar sürebilir)...";
  }

  socket = io("https://one01okey.onrender.com", {
    reconnectionAttempts: 5,
    timeout: 15000
  });

  socket.on('connect', () => {
    console.log("Socket.IO connected successfully.");
    if (warningEl) {
      warningEl.style.display = 'none';
    }
  });

  socket.on('connect_error', (error) => {
    console.warn("Socket.IO connection error:", error);
    if (warningEl) {
      warningEl.style.display = 'block';
      warningEl.style.background = 'rgba(220, 53, 69, 0.15)';
      warningEl.style.borderColor = 'rgba(220, 53, 69, 0.4)';
      warningEl.style.color = '#ff6b6b';
      warningEl.innerHTML = "⚠️ Sunucuya bağlanılamadı. Çevrimdışı/Sandbox modunu deneyebilir veya sayfayı yenileyebilirsiniz.";
    }
  });

  socket.on('room_created', ({ roomCode, seatIndex }) => {
    myRoomCode = roomCode;
    mySeatIndex = seatIndex;
    document.getElementById('lobby-room-code').textContent = roomCode;
    document.getElementById('lobby-screen-join').style.display = 'none';
    document.getElementById('lobby-screen-wait').style.display = 'flex';
    document.getElementById('btn-start-game').style.display = 'block';
  });

  socket.on('room_joined', ({ roomCode, seatIndex }) => {
    myRoomCode = roomCode;
    mySeatIndex = seatIndex;
    document.getElementById('lobby-room-code').textContent = roomCode;
    document.getElementById('lobby-screen-join').style.display = 'none';
    document.getElementById('lobby-screen-wait').style.display = 'flex';
    document.getElementById('btn-start-game').style.display = 'none';
  });

  socket.on('room_update', ({ players, gameStarted }) => {
    playersInfo = players;
    updateLobbySeats();
  });

  socket.on('game_started', ({ players }) => {
    playersInfo = players;
    const lobbyOverlay = document.getElementById('lobby-overlay');
    if (lobbyOverlay) lobbyOverlay.style.display = 'none';
    
    updateVisualPlayerNames();

    if (mySeatIndex === 0) {
      dealTiles();
    }
  });

  socket.on('state_update', (state) => {
    syncLocalStateFromServer(state);
  });

  socket.on('guest_became_bot', ({ seatIndex }) => {
    if (mySeatIndex === 0 && currentTurn === seatIndex) {
      setTimeout(runBotTurn, 800);
    }
  });

  socket.on('error_msg', ({ message }) => {
    showMessage("❌ " + message);
  });
}

function updateLobbySeats() {
  for (let s = 0; s < 4; s++) {
    const seatDiv = document.getElementById(`seat-${s}`);
    if (!seatDiv) continue;

    const player = playersInfo.find(p => p.seatIndex === s);
    if (player) {
      seatDiv.classList.remove('empty');
      seatDiv.querySelector('.seat-avatar').textContent = player.isBot ? '🤖' : '🧑';
      seatDiv.querySelector('.seat-name').textContent = player.name;
      seatDiv.querySelector('.seat-status').textContent = s === 0 ? 'Oda Kurucusu' : 'Katıldı';
      if (s === 0) {
        seatDiv.querySelector('.seat-status').classList.add('host');
      } else {
        seatDiv.querySelector('.seat-status').classList.remove('host');
      }
    } else {
      seatDiv.classList.add('empty');
      seatDiv.querySelector('.seat-avatar').textContent = '🤖';
      seatDiv.querySelector('.seat-name').textContent = 'Boş / Bot';
      seatDiv.querySelector('.seat-status').textContent = 'Bekliyor...';
      seatDiv.querySelector('.seat-status').classList.remove('host');
    }
  }
}

function updateVisualPlayerNames() {
  for (let v = 0; v < 4; v++) {
    let i = (v + mySeatIndex) % 4;
    const player = playersInfo.find(p => p.seatIndex === i);
    const row = document.getElementById(`p${v}-row`);
    if (row && player) {
      row.querySelector('.player-name').textContent = player.name;
    }
  }
}

function socketCreateRoom() {
  if (!socket || !socket.connected) {
    showMessage("⚠️ Sunucuya henüz bağlanılamadı. Lütfen sunucunun uyanmasını (en fazla 50 saniye sürebilir) bekleyin veya çevrimdışı oynamak için aşağıdaki butonu kullanın.");
    return;
  }
  const name = document.getElementById('player-nickname').value;
  if (!name.trim()) {
    showMessage("Lütfen bir kullanıcı adı girin.");
    return;
  }
  socket.emit('create_room', name);
}

function socketJoinRoom() {
  if (!socket || !socket.connected) {
    showMessage("⚠️ Sunucuya henüz bağlanılamadı. Lütfen sunucunun uyanmasını (en fazla 50 saniye sürebilir) bekleyin veya çevrimdışı oynamak için aşağıdaki butonu kullanın.");
    return;
  }
  const name = document.getElementById('player-nickname').value;
  const code = document.getElementById('room-code-input').value;
  if (!name.trim()) {
    showMessage("Lütfen bir kullanıcı adı girin.");
    return;
  }
  if (!code.trim()) {
    showMessage("Lütfen bir oda kodu girin.");
    return;
  }
  socket.emit('join_room', { roomCode: code, playerName: name });
}

function socketStartGame() {
  if (!socket || !socket.connected) return;
  socket.emit('start_game');
}

function playOffline() {
  const lobbyOverlay = document.getElementById('lobby-overlay');
  if (lobbyOverlay) {
    lobbyOverlay.style.display = 'none';
  }
  socket = null;
  dealTiles();
}

function syncLocalStateFromServer(state) {
  if (!state) return;

  if (state.gamePhase === 'round_ended') {
    totalScores = state.totalScores;
    roundPenalties = state.roundPenalties;
    showRoundModal(state.winnerId, state.finishType, state.roundScores, state.hands, state.opened);
    return;
  }

  if (mySeatIndex !== 0) {
    deck = Array(state.deckCount || 0).fill({ id: -99, num: '?', color: 'black' });
  } else {
    deck = state.deck;
    botHands = state.botHands;
  }

  discardPiles = state.discardPiles;
  openedGroups = state.openedGroups;
  currentTurn = state.currentTurn;
  roundNumber = state.roundNumber;
  totalScores = state.totalScores;
  roundPenalties = state.roundPenalties;

  player.opened = state.playersOpened[mySeatIndex];
  player.openedThisTurn = state.playersOpenedThisTurn[mySeatIndex];
  player.openingType = state.playersOpeningType[mySeatIndex];

  for (let v = 1; v <= 3; v++) {
    let i = (v + mySeatIndex) % 4;
    botOpened[v - 1] = state.playersOpened[i];
    botOpenedThisTurn[v - 1] = state.playersOpenedThisTurn[i];
    botOpeningType[v - 1] = state.playersOpeningType[i];
  }

  playerFinishedFromHand = state.playerFinishedFromHand;
  okeyTileInfo = state.okeyTileInfo;
  okeyWildcardValue = state.okeyWildcardValue;

  if (state.hands && state.hands[mySeatIndex]) {
    rackSlots = state.hands[mySeatIndex];
  }

  updateAll();
  updateTurnHighlight();
}

