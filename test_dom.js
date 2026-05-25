const fs = require('fs');
const path = require('path');

// Mock DOM
const makeMockElement = (props = {}) => {
  const base = {
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add: function(c) { this[c] = true; },
      remove: function(c) { delete this[c]; },
      contains: function(c) { return !!this[c]; }
    },
    appendChild: () => {},
    setAttribute: () => {}
  };
  return Object.assign(base, props);
};

const elements = {
  'p0-score-badge': makeMockElement(),
  'p1-score-badge': makeMockElement(),
  'p2-score-badge': makeMockElement(),
  'p3-score-badge': makeMockElement(),
  'p0-row': makeMockElement(),
  'p1-row': makeMockElement(),
  'p2-row': makeMockElement(),
  'p3-row': makeMockElement(),
  'okeyTile': makeMockElement(),
  'discardTile': makeMockElement(),
  'deck-tile-count': makeMockElement(),
  'round-val': makeMockElement(),
  'message': makeMockElement(),
  'selection-tooltip': makeMockElement({ style: { display: '' } }),
  'score-dropdown-menu': makeMockElement({ style: { display: '' } }),
  'score-p0': makeMockElement(),
  'score-p1': makeMockElement(),
  'score-p2': makeMockElement(),
  'score-p3': makeMockElement(),
  'rack': makeMockElement({
    innerHTML: '',
    appendChild: (node) => {
      appendedNodes.push(node);
    }
  })
};

const appendedNodes = [];

global.window = {};
global.document = {
  readyState: 'loading',
  getElementById: (id) => {
    return elements[id] || null;
  },
  createElement: (tag) => {
    return {
      className: '',
      innerHTML: '',
      onclick: null,
      ondblclick: null,
      classList: {
        add: function(cls) { this[cls] = true; },
        remove: function(cls) { delete this[cls]; }
      },
      appendChild: () => {},
      setAttribute: () => {}
    };
  },
  addEventListener: (event, cb) => {
    if (event === 'DOMContentLoaded') {
      global.DOMContentLoadedCallback = cb;
    }
  }
};

// Mock setTimeout
global.setTimeout = (cb, delay) => {
  cb(); // Run immediately for test
};

try {
  let code = fs.readFileSync('app.js', 'utf8');
  // Append helper functions to dump and manipulate state
  code += `
    global.dumpState = () => ({ deck, discardPile, okeyTileInfo, okeyWildcardValue, rackSlots, selectedGroupIndices, currentTurn, hasDrawn, tookDiscardThisTurn, discardedTileTaken, botHands });
    global.setRackSlot = (idx, val) => { rackSlots[idx] = val; };
    global.getRackSlots = () => rackSlots;
    global.triggerSelectGroup = (idx) => selectGroup(idx);
    global.triggerMoveGroupTo = (idx) => moveGroupTo(idx);
    global.triggerPassTurn = () => passTurn();
    global.triggerValidateConsecutiveRun = (group) => validateConsecutiveRun(group);
    global.triggerRecalculateScore = () => recalculateScore();
    global.triggerTakeDiscard = () => takeDiscard();
    global.triggerDiscardTile = () => discardTile();
    global.triggerOpenHand = () => openHand();
    global.triggerRecall = () => recall();
    global.getPlayerState = () => player;
    global.getOpenedGroups = () => openedGroups;
    global.setDiscardPile = (pile) => { discardPile = pile; };
    global.setHasDrawn = (val) => { hasDrawn = val; };
    global.setTookDiscardThisTurn = (val) => { tookDiscardThisTurn = val; };
    global.setDiscardedTileTaken = (val) => { discardedTileTaken = val; };
    global.setSelectedIndex = (val) => { selectedIndex = val; };
    global.setPlayerOpened = (val) => { player.opened = val; };
    global.triggerToggleTileFacedown = (idx) => toggleTileFacedown(idx);
    global.triggerLayOffTile = (draggedIdx, groupIdx) => layOffTile(draggedIdx, groupIdx);
    global.setOkeyWildcardValue = (val) => { okeyWildcardValue = val; };
    global.setBotOpeningType = (idx, val) => { botOpeningType[idx] = val; };
    global.triggerLayDownGroup = () => layDownGroup();
    global.setSelectedGroupIndices = (val) => { selectedGroupIndices = val; };
    global.setBotOpened = (idx, val) => { botOpened[idx] = val; };
    global.setBotOpenedThisTurn = (idx, val) => { botOpenedThisTurn[idx] = val; };
    global.triggerEndRound = (winnerId, finishType) => endRound(winnerId, finishType);
    global.getTotalScores = () => totalScores;
    global.setTotalScores = (val) => { totalScores = val; };
    global.getRoundPenalties = () => roundPenalties;
    global.setRoundPenalties = (val) => { roundPenalties = val; };
    global.setPlayerOpenedThisTurn = (val) => { player.openedThisTurn = val; };
    global.setCurrentTurn = (val) => { currentTurn = val; };
    global.setDeck = (val) => { deck = val; };
    global.enableShowMessageConsole = () => { showMessage = (msg) => { console.log('   [MSG]:', msg); }; };
    global.triggerToggleScoreDropdown = (event) => toggleScoreDropdown(event);
    global.triggerUpdateAll = (statusText) => updateAll(statusText);
  `;
  
  eval(code);
  
  if (global.DOMContentLoadedCallback) {
    global.DOMContentLoadedCallback();
    console.log('DOMContentLoadedCallback executed.');
    
    // Dump initial state
    const state = global.dumpState();
    console.log('Initial rackSlots non-null count:', state.rackSlots.filter(t => t !== null).length);

    // Test Case 1: Group Selection (Double Click)
    console.log('\n--- Test Case 1: Group Selection (Double Click) ---');
    // Clear rack slots to prevent interference
    for (let i = 0; i < 40; i++) {
      global.setRackSlot(i, null);
    }
    // Set contiguous block at slots 5, 6, 7
    global.setRackSlot(5, { id: 100, num: 5, color: 'red' });
    global.setRackSlot(6, { id: 101, num: 6, color: 'red' });
    global.setRackSlot(7, { id: 102, num: 7, color: 'red' });
    global.setRackSlot(8, null);
    global.setRackSlot(4, null);

    global.triggerSelectGroup(6); // Double click on middle element
    let newState = global.dumpState();
    console.log('Selected Group Indices:', newState.selectedGroupIndices);
    if (newState.selectedGroupIndices.length === 3 &&
        newState.selectedGroupIndices.includes(5) &&
        newState.selectedGroupIndices.includes(6) &&
        newState.selectedGroupIndices.includes(7)) {
      console.log('PASS: Group correctly detected and selected!');
    } else {
      console.error('FAIL: Group selection incorrect!', newState.selectedGroupIndices);
    }

    // Test Case 2: Group Movement
    console.log('\n--- Test Case 2: Group Movement ---');
    global.triggerMoveGroupTo(10); // Move group starting from index 5-7 to 10-12
    newState = global.dumpState();
    console.log('New group slots (10, 11, 12):', newState.rackSlots[10], newState.rackSlots[11], newState.rackSlots[12]);
    console.log('Old group slots (5, 6, 7):', newState.rackSlots[5], newState.rackSlots[6], newState.rackSlots[7]);
    if (newState.rackSlots[10] !== null && newState.rackSlots[11] !== null && newState.rackSlots[12] !== null &&
        newState.rackSlots[5] === null && newState.rackSlots[6] === null && newState.rackSlots[7] === null) {
      console.log('PASS: Group successfully moved to target slots!');
    } else {
      console.error('FAIL: Group movement failed!');
    }

    // Test Case 2b: Group Movement Capping (End of Rack)
    console.log('\n--- Test Case 2b: Group Movement Capping (End of Rack) ---');
    // Select group at 10, 11, 12 again
    global.triggerSelectGroup(11);
    // Move to slot 39 (overflow index)
    global.triggerMoveGroupTo(39);
    newState = global.dumpState();
    console.log('Slots 37, 38, 39 after capped move:', newState.rackSlots[37], newState.rackSlots[38], newState.rackSlots[39]);
    if (newState.rackSlots[37] !== null && newState.rackSlots[38] !== null && newState.rackSlots[39] !== null) {
      console.log('PASS: Group successfully capped at the end of the rack without disappearing!');
    } else {
      console.error('FAIL: Group movement capping failed (tiles disappeared)!');
    }

    // Test Case 3: Turn cycle and bot simulation
    console.log('\n--- Test Case 3: Turn cycle ---');
    console.log('Current turn before pass:', newState.currentTurn);
    global.triggerPassTurn(); // Pass from 0 (SEN) to 1 (AHMET)
    // AHMET is a bot, so global.setTimeout runs CB immediately.
    // Ahmet draws, discards, passes to Mehmet.
    // Mehmet draws, discards, passes to Ayse.
    // Ayse draws, discards, passes to Sen.
    // So the turn should return back to SEN (0) immediately!
    newState = global.dumpState();
    console.log('Current turn after bot executions:', newState.currentTurn);
    if (newState.currentTurn === 0) {
      console.log('PASS: Turn cycle executed successfully and returned to user!');
    } else {
      console.error('FAIL: Turn cycle incorrect! Current turn:', newState.currentTurn);
    }

    // Test Case 4: Consecutive run validation
    console.log('\n--- Test Case 4: Consecutive run validation ---');
    global.setOkeyWildcardValue({ num: 1, color: 'red' });

    let run1 = [{ num: 12, color: 'red' }, { num: 13, color: 'red' }, { num: 1, color: 'red' }];
    let res1 = global.triggerValidateConsecutiveRun(run1);
    console.log('12-13-1 valid:', res1.valid);
    if (!res1.valid) {
      console.log('PASS: 12-13-1 run is invalid!');
    } else {
      console.error('FAIL: 12-13-1 run should be invalid!');
    }

    let run2 = [{ num: 11, color: 'red' }, { num: 12, color: 'red' }, { num: 13, color: 'red' }];
    let res2 = global.triggerValidateConsecutiveRun(run2);
    console.log('11-12-13 valid:', res2.valid, 'points:', res2.points);
    if (res2.valid && res2.points === 36) {
      console.log('PASS: 11-12-13 run is valid with 36 points!');
    } else {
      console.error('FAIL: 11-12-13 run should be valid with 36 points!');
    }

    let run3 = [{ num: 'OKEY', color: 'joker', fake: true }, { num: 2, color: 'red' }, { num: 3, color: 'red' }];
    let res3 = global.triggerValidateConsecutiveRun(run3);
    console.log('Okey-2-3 valid:', res3.valid, 'points:', res3.points);
    if (res3.valid && res3.points === 6) {
      console.log('PASS: Okey-2-3 run is valid with exact wildcard value (1) and total 6 points!');
    } else {
      console.error('FAIL: Okey-2-3 run check failed!');
    }

    let runDescending = [{ num: 'OKEY', color: 'joker', isOkey: true, fake: false }, { num: 11, color: 'yellow' }, { num: 10, color: 'yellow' }];
    let resDesc = global.triggerValidateConsecutiveRun(runDescending);
    console.log('Okey-11-10 valid:', resDesc.valid, 'points:', resDesc.points);
    if (resDesc.valid && resDesc.points === 33) {
      console.log('PASS: Okey-11-10 descending run is valid with 33 points!');
    } else {
      console.error('FAIL: Okey-11-10 descending run check failed!');
    }

    // Test Case 5: Open Hand Threshold (Series >= 101)
    console.log('\n--- Test Case 5: Open Hand Threshold ---');
    // Clear rack
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    // Add series totaling 72 points
    global.setRackSlot(0, { id: 1, num: 10, color: 'red' });
    global.setRackSlot(1, { id: 2, num: 11, color: 'red' });
    global.setRackSlot(2, { id: 3, num: 12, color: 'red' }); // 33 pts
    global.setRackSlot(4, { id: 4, num: 13, color: 'blueText' });
    global.setRackSlot(5, { id: 5, num: 13, color: 'red' });
    global.setRackSlot(6, { id: 6, num: 13, color: 'yellow' }); // 39 pts
    // Total series score: 72 pts
    global.triggerRecalculateScore();
    let pState = global.getPlayerState();
    console.log('Initial score:', pState.score);
    global.triggerOpenHand();
    if (!pState.opened) {
      console.log('PASS: Blocked opening hand with < 101 points!');
    } else {
      console.error('FAIL: Allowed opening hand with < 101 points!');
    }

    // Now add another set to make score >= 101 (102 pts)
    global.setRackSlot(8, { id: 7, num: 10, color: 'blueText' });
    global.setRackSlot(9, { id: 8, num: 10, color: 'red' });
    global.setRackSlot(10, { id: 9, num: 10, color: 'yellow' }); // 30 pts. Total = 102 pts.
    global.triggerRecalculateScore();
    console.log('New score:', pState.score);
    global.triggerOpenHand();
    if (pState.opened) {
      console.log('PASS: Successfully opened hand with >= 101 points!');
    } else {
      console.error('FAIL: Failed to open hand with >= 101 points!');
    }

    // Test Case 6: Yandan Taş Alma Commitment
    console.log('\n--- Test Case 6: Yandan Tas Alma Commitment ---');
    // Reset player opened state
    global.setPlayerOpened(false);
    global.setHasDrawn(false);
    global.setTookDiscardThisTurn(false);
    global.setDiscardedTileTaken(null);
    global.getOpenedGroups().length = 0; // Clear table groups
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    // Put a tile in discard pile
    let discTile = { id: 50, num: 7, color: 'red' };
    global.setDiscardPile([discTile]);

    // Take discard tile
    global.triggerTakeDiscard();
    let curState = global.dumpState();
    console.log('After takeDiscard: tookDiscardThisTurn =', curState.tookDiscardThisTurn, 'hasDrawn =', curState.hasDrawn);

    // Try to discard without opening
    global.setSelectedIndex(0); // assume took tile went to slot 0
    global.triggerDiscardTile();
    curState = global.dumpState();
    if (!curState.tookDiscardThisTurn && curState.hasDrawn) {
      console.error('FAIL: Allowed discard without opening after taking a discard tile!');
    } else {
      console.log('PASS: Blocked discard without opening after taking discard tile!');
    }

    // Try to open but without using the discard tile in melds
    global.setRackSlot(0, { id: 50, num: 7, color: 'red' }); // discard tile
    global.setRackSlot(2, { id: 10, num: 11, color: 'red' });
    global.setRackSlot(3, { id: 11, num: 12, color: 'red' });
    global.setRackSlot(4, { id: 12, num: 13, color: 'red' }); // 36 pts
    global.setRackSlot(6, { id: 13, num: 10, color: 'black' });
    global.setRackSlot(7, { id: 14, num: 10, color: 'red' });
    global.setRackSlot(8, { id: 15, num: 10, color: 'blueText' });
    global.setRackSlot(9, { id: 16, num: 10, color: 'yellow' }); // 40 pts
    global.setRackSlot(11, { id: 17, num: 9, color: 'black' });
    global.setRackSlot(12, { id: 18, num: 9, color: 'red' });
    global.setRackSlot(13, { id: 19, num: 9, color: 'yellow' }); // 27 pts
    // Total score = 36 + 40 + 27 = 103 pts.
    global.triggerRecalculateScore();
    console.log('Meld score before open:', global.getPlayerState().score);
    global.triggerOpenHand();
    if (!global.getPlayerState().opened) {
      console.log('PASS: Blocked opening because took discard tile is not in opened melds!');
    } else {
      console.error('FAIL: Allowed opening even though discard tile was not in melds!');
    }

    // Now modify run to include the discard tile (Red 7-8-9-10)
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null); // Clear rack before setting up new tiles
    global.setDiscardedTileTaken({ id: 50, num: 8, color: 'red' });
    global.setRackSlot(0, { id: 20, num: 7, color: 'red' });
    global.setRackSlot(1, { id: 50, num: 8, color: 'red' }); // discard tile
    global.setRackSlot(2, { id: 22, num: 9, color: 'red' }); // 24 pts
    global.setRackSlot(3, { id: 23, num: 10, color: 'red' }); // 7-8-9-10 = 34 pts.
    global.setRackSlot(5, { id: 10, num: 11, color: 'red' });
    global.setRackSlot(6, { id: 11, num: 12, color: 'red' });
    global.setRackSlot(7, { id: 12, num: 13, color: 'red' }); // 36 pts
    global.setRackSlot(9, { id: 13, num: 10, color: 'black' });
    global.setRackSlot(10, { id: 14, num: 10, color: 'red' });
    global.setRackSlot(11, { id: 15, num: 10, color: 'blueText' });
    global.setRackSlot(12, { id: 16, num: 10, color: 'yellow' }); // 40 pts
    // Total score = 34 + 36 + 40 = 110 pts!
    global.triggerRecalculateScore();
    console.log('Meld score before open (with discard tile):', global.getPlayerState().score);
    global.triggerOpenHand();
    if (global.getPlayerState().opened) {
      console.log('PASS: Successfully opened hand since discard tile is used in melds!');
    } else {
      console.error('FAIL: Failed to open hand even though discard tile is used in melds!');
    }

    // Test Case 7: Recall/Undo Action
    console.log('\n--- Test Case 7: Recall / Undo Action ---');
    // Verify user can recall opened melds
    global.triggerRecall();
    curState = global.dumpState();
    let userOpenedGroups = global.getOpenedGroups().filter(g => g.player === 0);
    if (!global.getPlayerState().opened && userOpenedGroups.length === 0 && curState.rackSlots.filter(t => t !== null).length === 11) {
      console.log('PASS: Successfully recalled opened melds back to rack!');
    } else {
      console.error('FAIL: Failed to recall opened melds!', global.getPlayerState().opened, userOpenedGroups.length);
    }

    // Verify user can recall discard tile take
    global.setDiscardPile([discTile]);
    global.setHasDrawn(false);
    global.setTookDiscardThisTurn(false);
    global.setDiscardedTileTaken(null);
    global.triggerTakeDiscard();
    console.log('Took discard. rack count before recall:', global.dumpState().rackSlots.filter(t => t !== null).length);
    global.triggerRecall();
    curState = global.dumpState();
    console.log('After recall discard: tookDiscardThisTurn =', curState.tookDiscardThisTurn, 'hasDrawn =', curState.hasDrawn, 'rack count =', curState.rackSlots.filter(t => t !== null).length);
    if (!curState.tookDiscardThisTurn && !curState.hasDrawn && curState.discardPile.length === 1) {
      console.log('PASS: Successfully recalled/undid discard tile take!');
    } else {
      console.error('FAIL: Failed to recall/undo discard tile take!');
    }

    // Test Case 8: Double-Click Wildcard Flipping
    console.log('\n--- Test Case 8: Double-Click Wildcard Flipping ---');
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    
    // Set a wildcard tile at slot 5 (real Okey tile, fake: false, isOkey: true)
    let wildTile = { id: 80, num: 6, color: 'red', fake: false, isOkey: true, facedown: false };
    global.setRackSlot(5, wildTile);
    
    // Toggle facedown
    global.triggerToggleTileFacedown(5);
    console.log('Wildcard facedown status after toggle:', global.dumpState().rackSlots[5].facedown);
    if (global.dumpState().rackSlots[5].facedown) {
      console.log('PASS: Wildcard tile flipped facedown successfully!');
    } else {
      console.error('FAIL: Wildcard tile failed to flip facedown!');
    }
    
    // Toggle again
    global.triggerToggleTileFacedown(5);
    console.log('Wildcard facedown status after second toggle:', global.dumpState().rackSlots[5].facedown);
    if (!global.dumpState().rackSlots[5].facedown) {
      console.log('PASS: Wildcard tile flipped face up successfully!');
    } else {
      console.error('FAIL: Wildcard tile failed to flip face up!');
    }
    
    // Fake Okey tile should not toggle
    global.setRackSlot(6, { id: 81, num: 'OKEY', color: 'joker', fake: true, isOkey: false, facedown: false });
    global.triggerToggleTileFacedown(6);
    if (!global.dumpState().rackSlots[6].facedown) {
      console.log('PASS: Fake Okey tile did not toggle facedown!');
    } else {
      console.error('FAIL: Fake Okey tile toggled facedown!');
    }

    // Normal tile should not toggle
    global.setRackSlot(7, { id: 82, num: 5, color: 'red', facedown: false });
    global.triggerToggleTileFacedown(7);
    if (!global.dumpState().rackSlots[7].facedown) {
      console.log('PASS: Non-wildcard tile did not toggle facedown!');
    } else {
      console.error('FAIL: Non-wildcard tile toggled facedown!');
    }

    // Test Case 9: Laying Off Tiles (İşlek İşleme)
    console.log('\n--- Test Case 9: Laying Off Tiles (İşlek İşleme) ---');
    // Clear rack and setup target table group
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    global.getOpenedGroups().length = 0;
    
    // Setup player opened hand on the table
    let tableGroup = {
      player: 0,
      tiles: [
        { id: 91, num: 5, color: 'red' },
        { id: 92, num: 6, color: 'red' },
        { id: 93, num: 7, color: 'red' }
      ]
    };
    global.getOpenedGroups().push(tableGroup);
    
    // Setup player rack
    global.setRackSlot(0, { id: 94, num: 4, color: 'red' });      // valid prepend
    global.setRackSlot(1, { id: 95, num: 8, color: 'red' });      // valid append
    global.setRackSlot(2, { id: 96, num: 8, color: 'blueText' }); // invalid
    
    // Case 9a: Blocked if not opened
    global.setPlayerOpened(false);
    global.setHasDrawn(true);
    global.triggerLayOffTile(0, 0); // Try to lay off Red 4
    if (global.getOpenedGroups()[0].tiles.length === 3) {
      console.log('PASS: Blocked laying off when player hand is not opened!');
    } else {
      console.error('FAIL: Allowed laying off before opening hand!');
    }
    
    // Case 9b: Valid Prepend
    global.setPlayerOpened(true);
    global.triggerLayOffTile(0, 0); // Lay off Red 4 (prepend)
    let updatedGroup = global.getOpenedGroups()[0];
    console.log('Group tiles after prepend layoff:', updatedGroup.tiles.map(t => `${t.color} ${t.num}`).join(', '));
    if (updatedGroup.tiles.length === 4 && updatedGroup.tiles[0].num === 4 && global.dumpState().rackSlots[0] === null) {
      console.log('PASS: Successfully prepended tile to consecutive run group!');
    } else {
      console.error('FAIL: Failed to prepend tile to group!');
    }
    
    // Case 9c: Valid Append
    global.triggerLayOffTile(1, 0); // Lay off Red 8 (append)
    console.log('Group tiles after append layoff:', updatedGroup.tiles.map(t => `${t.color} ${t.num}`).join(', '));
    if (updatedGroup.tiles.length === 5 && updatedGroup.tiles[4].num === 8 && global.dumpState().rackSlots[1] === null) {
      console.log('PASS: Successfully appended tile to consecutive run group!');
    } else {
      console.error('FAIL: Failed to append tile to group!');
    }
    
    // Case 9d: Block invalid layoff
    global.triggerLayOffTile(2, 0); // Try to lay off Blue 8
    if (updatedGroup.tiles.length === 5 && global.dumpState().rackSlots[2] !== null) {
      console.log('PASS: Blocked invalid layoff correctly!');
    } else {
      console.error('FAIL: Allowed invalid layoff of Blue 8!');
    }

    // Test Case 10: Series vs Pairs Rules
    console.log('\n--- Test Case 10: Series vs Pairs Rules ---');
    // Reset rack and table
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    global.getOpenedGroups().length = 0;

    // 10a: Series player pair lay-down blocked when no bot opened pairs
    let playerState = global.getPlayerState();
    playerState.opened = true;
    playerState.openingType = 'series';
    global.setHasDrawn(true);
    global.setSelectedIndex(null);

    global.setBotOpeningType(0, null);
    global.setBotOpeningType(1, null);
    global.setBotOpeningType(2, null);

    global.setRackSlot(0, { id: 200, num: 5, color: 'red' });
    global.setRackSlot(1, { id: 201, num: 5, color: 'red' });
    global.setSelectedGroupIndices([0, 1]);

    global.triggerLayDownGroup();
    let after10a = global.getOpenedGroups();
    if (after10a.length === 0 && global.dumpState().rackSlots[0] !== null) {
      console.log('PASS: Series player pair lay-down blocked when no bots opened pairs!');
    } else {
      console.error('FAIL: Allowed series player to lay down pairs when no bots opened pairs!');
    }

    // 10b: Series player pair lay-down allowed when bot opened pairs
    global.setBotOpeningType(1, 'pairs'); // Bot 2 (MEHMET) has opened pairs
    global.triggerLayDownGroup();
    let after10b = global.getOpenedGroups();
    if (after10b.length === 1 && after10b[0].type === 'pair' && global.dumpState().rackSlots[0] === null) {
      console.log('PASS: Series player pair lay-down allowed when bot opened pairs!');
    } else {
      console.error('FAIL: Failed to lay down pair for series player even though bot opened pairs!');
    }

    // 10c: Pairs player series lay-down blocked
    playerState.openingType = 'pairs';
    global.setRackSlot(10, { id: 202, num: 5, color: 'blueText' });
    global.setRackSlot(11, { id: 203, num: 6, color: 'blueText' });
    global.setRackSlot(12, { id: 204, num: 7, color: 'blueText' });
    global.setSelectedGroupIndices([10, 11, 12]);

    global.triggerLayDownGroup();
    if (global.getOpenedGroups().length === 1 && global.dumpState().rackSlots[10] !== null) {
      console.log('PASS: Pairs player series lay-down blocked!');
    } else {
      console.error('FAIL: Allowed pairs player to lay down a series!');
    }

    // 10d: Pairs player series layoff blocked
    // Add a series group to openedGroups
    global.getOpenedGroups().push({
      player: 1, // Ahmet
      type: 'run',
      tiles: [
        { id: 210, num: 5, color: 'yellow' },
        { id: 211, num: 6, color: 'yellow' },
        { id: 212, num: 7, color: 'yellow' }
      ]
    });
    // Target group is at index 1
    global.setRackSlot(15, { id: 213, num: 4, color: 'yellow' }); // Fits the run
    global.triggerLayOffTile(15, 1);
    let layoffGroup = global.getOpenedGroups()[1];
    if (layoffGroup.tiles.length === 3 && global.dumpState().rackSlots[15] !== null) {
      console.log('PASS: Pairs player series layoff blocked!');
    } else {
      console.error('FAIL: Allowed pairs player to lay off a tile on a series group!');
    }

    // Test Case 11: Special Hand Finish Scoring (Elden Bitiş)
    console.log('\n--- Test Case 11: Special Hand Finish Scoring ---');
    
    // 11a: Special hand finish score (-200 / +400) when no other players have opened
    global.setTotalScores([0, 0, 0, 0]);
    global.setRoundPenalties([0, 0, 0, 0]);
    global.setPlayerOpened(true);
    global.setPlayerOpenedThisTurn(true);
    
    global.setBotOpened(0, false);
    global.setBotOpened(1, false);
    global.setBotOpened(2, false);
    
    global.setBotOpenedThisTurn(0, false);
    global.setBotOpenedThisTurn(1, false);
    global.setBotOpenedThisTurn(2, false);
    
    // Clear rack and hands to prevent tileValue errors
    for (let i = 0; i < 40; i++) global.setRackSlot(i, null);
    let scoringState = global.dumpState();
    scoringState.botHands[0].length = 0;
    scoringState.botHands[1].length = 0;
    scoringState.botHands[2].length = 0;

    // Trigger endRound for player (winnerId = 0, finishType = 'elden')
    global.triggerEndRound(0, 'elden');
    
    let roundScores1 = global.getTotalScores();
    console.log('Round Scores (expected [-200, 400, 400, 400]):', roundScores1);
    if (roundScores1[0] === -200 && roundScores1[1] === 400 && roundScores1[2] === 400 && roundScores1[3] === 400) {
      console.log('PASS: Special hand finish scoring applied correctly (-200 for winner, +400 for others)!');
    } else {
      console.error('FAIL: Special hand finish scoring incorrect!', roundScores1);
    }
    
    // 11b: Standard hand finish score when at least one other player has opened
    global.setTotalScores([0, 0, 0, 0]);
    global.setRoundPenalties([0, 0, 0, 0]);
    global.setPlayerOpened(true);
    global.setPlayerOpenedThisTurn(true);
    
    global.setBotOpened(0, true); // Bot 1 (AHMET) is opened!
    global.setBotOpened(1, false);
    global.setBotOpened(2, false);
    
    global.triggerEndRound(0, 'elden');
    
    let roundScores2 = global.getTotalScores();
    console.log('Round Scores when someone else is opened:', roundScores2);
    // Winner should get -202 (not -200)
    if (roundScores2[0] === -202) {
      console.log('PASS: Standard hand finish scoring applied when another player has opened!');
    } else {
      console.error('FAIL: Standard hand finish scoring incorrect when another player has opened!', roundScores2);
    }

    // Test Case 12: İşlek Penalty Fix
    console.log('\n--- Test Case 12: İşlek Penalty Fix ---');
    global.enableShowMessageConsole();
    
    // 12a: Test işlek penalty when player is NOT opened
    global.setTotalScores([0, 0, 0, 0]);
    global.setRoundPenalties([0, 0, 0, 0]);
    global.setCurrentTurn(0);
    global.setBotOpened(0, false);
    global.setBotOpened(1, false);
    global.setBotOpened(2, false);
    let pState12 = global.getPlayerState();
    pState12.opened = false;
    pState12.openingType = null;
    pState12.openedThisTurn = false;
    global.setHasDrawn(true);
    global.setSelectedIndex(0);
    global.getOpenedGroups().length = 0;
    
    // Set a dummy deck to prevent deck running out when turn passes to bots
    global.setDeck([
      { id: 400, num: 2, color: 'red' },
      { id: 401, num: 3, color: 'red' },
      { id: 402, num: 4, color: 'red' },
      { id: 403, num: 5, color: 'red' },
      { id: 404, num: 6, color: 'red' },
      { id: 405, num: 7, color: 'red' }
    ]);
    
    // Add series on table
    global.getOpenedGroups().push({
      player: 1, // Ahmet
      type: 'run',
      tiles: [
        { id: 300, num: 5, color: 'red' },
        { id: 301, num: 6, color: 'red' },
        { id: 302, num: 7, color: 'red' }
      ]
    });
    
    // Player has Red 4 (fits Red 5-6-7) at slot 0, and another tile at slot 1 to prevent empty rack auto-finish
    global.setRackSlot(0, { id: 303, num: 4, color: 'red' });
    global.setRackSlot(1, { id: 305, num: 9, color: 'blueText' });
    
    global.triggerDiscardTile();
    let scoreAfterDiscard = global.getRoundPenalties()[0];
    console.log('Player round penalties after discarding işlek Red 4:', scoreAfterDiscard);
    if (scoreAfterDiscard === 100) {
      console.log('PASS: Discarding an işlek tile when unopened correctly adds 100 penalty points to round penalties!');
    } else {
      console.error('FAIL: Expected 100 penalty points, got:', scoreAfterDiscard);
    }
    
    // 12b: Test that wildcard discard does not trigger double penalty
    global.setTotalScores([0, 0, 0, 0]);
    global.setRoundPenalties([0, 0, 0, 0]);
    global.setCurrentTurn(0);
    global.setBotOpened(0, false);
    global.setBotOpened(1, false);
    global.setBotOpened(2, false);
    pState12.opened = true;
    pState12.openingType = 'series';
    global.setHasDrawn(true);
    global.setSelectedIndex(0);
    
    // Set a dummy deck again
    global.setDeck([
      { id: 400, num: 2, color: 'red' },
      { id: 401, num: 3, color: 'red' },
      { id: 402, num: 4, color: 'red' },
      { id: 403, num: 5, color: 'red' },
      { id: 404, num: 6, color: 'red' },
      { id: 405, num: 7, color: 'red' }
    ]);
    
    // Set Okey wildcard to Blue 10
    global.setOkeyWildcardValue({ num: 10, color: 'blueText' });
    
    // Set slot 0 with Blue 10 wildcard (isOkey = true)
    global.setRackSlot(0, { id: 304, num: 10, color: 'blueText', isOkey: true });
    // Set slot 1 with another tile to prevent empty rack
    global.setRackSlot(1, { id: 305, num: 9, color: 'blueText' });
    
    global.triggerDiscardTile();
    let scoreAfterWildcardDiscard = global.getRoundPenalties()[0];
    console.log('Player round penalties after discarding wildcard Okey:', scoreAfterWildcardDiscard);
    if (scoreAfterWildcardDiscard === 100) {
      console.log('PASS: Discarding wildcard Okey triggers only 100 penalty points (not double penalty) in round penalties!');
    } else {
      console.error('FAIL: Expected exactly 100 penalty points, got:', scoreAfterWildcardDiscard);
    }
    // Test Case 13: Scoreboard Dropdown Box (Puan Durumu)
    console.log('\n--- Test Case 13: Scoreboard Dropdown Box ---');
    
    // 13a: Test dropdown menu toggle logic
    let menuEl = document.getElementById('score-dropdown-menu');
    menuEl.style.display = 'none'; // reset to none
    
    global.triggerToggleScoreDropdown({ stopPropagation: () => {} });
    console.log('Dropdown style.display after first toggle:', menuEl.style.display);
    if (menuEl.style.display === 'block') {
      console.log('PASS: Scoreboard dropdown toggles open successfully!');
    } else {
      console.error('FAIL: Scoreboard dropdown failed to toggle open!');
    }
    
    global.triggerToggleScoreDropdown({ stopPropagation: () => {} });
    console.log('Dropdown style.display after second toggle:', menuEl.style.display);
    if (menuEl.style.display === 'none') {
      console.log('PASS: Scoreboard dropdown toggles closed successfully!');
    } else {
      console.error('FAIL: Scoreboard dropdown failed to toggle closed!');
    }
    
    // 13b: Test score synchronization in updateAll
    global.setTotalScores([120, -45, 0, 310]);
    global.triggerUpdateAll();
    
    let p0ScoreText = document.getElementById('score-p0').textContent;
    let p1ScoreText = document.getElementById('score-p1').textContent;
    let p2ScoreText = document.getElementById('score-p2').textContent;
    let p3ScoreText = document.getElementById('score-p3').textContent;
    
    console.log('Scoreboard labels:', p0ScoreText, p1ScoreText, p2ScoreText, p3ScoreText);
    if (p0ScoreText === '+120' && p1ScoreText === '-45' && p2ScoreText === '0' && p3ScoreText === '+310') {
      console.log('PASS: Scoreboard dropdown scores correctly synchronized!');
    } else {
      console.error('FAIL: Scoreboard dropdown score synchronization incorrect!');
    }

    // Test Case 14: Okey Wildcard Stealing (Okey Çalma / Değiştirme)
    console.log('\n--- Test Case 14: Okey Wildcard Stealing ---');
    
    // Reset state
    global.setPlayerOpened(true);
    global.setHasDrawn(true);
    let ogs = global.getOpenedGroups();
    ogs.length = 0; // Clear existing groups

    // 14a: Stealing Okey in a consecutive run (7-8-Okey-10 replaced by 9)
    let wildcardOkey = { id: 999, num: 4, color: 'red', isOkey: true }; // Wildcard
    let runGroup = {
      player: 1,
      type: 'series',
      tiles: [
        { id: 201, num: 7, color: 'red' },
        { id: 202, num: 8, color: 'red' },
        wildcardOkey,
        { id: 204, num: 10, color: 'red' }
      ]
    };
    ogs.push(runGroup);

    // Place Red 9 in player's rack index 0
    global.setRackSlot(0, { id: 203, num: 9, color: 'red' });

    // Perform layoff (stealing wildcard)
    global.triggerLayOffTile(0, 0);

    let updatedRunGroup = ogs[0];
    let stolenOkeyInRack = global.getRackSlots()[0];

    console.log('Run group tiles after swap:', updatedRunGroup.tiles.map(t => `${t.color} ${t.num}`).join(', '));
    console.log('Stolen tile in rack slot 0:', stolenOkeyInRack ? `id: ${stolenOkeyInRack.id}, isOkey: ${stolenOkeyInRack.isOkey}` : 'null');

    if (updatedRunGroup.tiles[2].num === 9 && updatedRunGroup.tiles[2].color === 'red' && stolenOkeyInRack && stolenOkeyInRack.id === 999) {
      console.log('PASS: Successfully replaced wildcard Okey in consecutive run and returned it to player rack!');
    } else {
      console.error('FAIL: Consecutive run Okey stealing failed!');
    }

    // 14b: Stealing Okey in a same-number set (Red 7 - Black 7 - Okey replaced by Blue 7)
    let wildcardOkey2 = { id: 888, num: 4, color: 'red', isOkey: true }; // Wildcard
    let setGroup = {
      player: 2,
      type: 'series',
      tiles: [
        { id: 301, num: 7, color: 'red' },
        { id: 302, num: 7, color: 'black' },
        wildcardOkey2
      ]
    };
    ogs.push(setGroup);

    // Place Blue 7 in player's rack index 1
    global.setRackSlot(1, { id: 303, num: 7, color: 'blueText' });

    // Perform layoff (stealing wildcard)
    global.triggerLayOffTile(1, 1);

    let updatedSetGroup = ogs[1];
    let stolenOkeyInRack2 = global.getRackSlots()[1];

    console.log('Set group tiles after swap:', updatedSetGroup.tiles.map(t => `${t.color} ${t.num}`).join(', '));
    console.log('Stolen tile in rack slot 1:', stolenOkeyInRack2 ? `id: ${stolenOkeyInRack2.id}, isOkey: ${stolenOkeyInRack2.isOkey}` : 'null');

    if (updatedSetGroup.tiles[2].num === 7 && updatedSetGroup.tiles[2].color === 'blueText' && stolenOkeyInRack2 && stolenOkeyInRack2.id === 888) {
      console.log('PASS: Successfully replaced wildcard Okey in same-number set and returned it to player rack!');
    } else {
      console.error('FAIL: Same-number set Okey stealing failed!');
    }
  }
} catch (e) {
  console.error('Error during execution:', e);
}
