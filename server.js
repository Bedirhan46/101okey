const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

// Serve static assets from the root workspace
app.use(express.static(path.join(__dirname)));

// Room management structure
// roomCode -> { code, players: [ { id, name, isBot, seatIndex, ready } ], gameStarted, gameState: {} }
const rooms = {};

// Helper: Generate a random 5-character alphanumeric room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

io.on('connection', (socket) => {
  let currentRoomCode = null;
  let currentSeatIndex = null;

  console.log(`Socket connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create_room', (playerName) => {
    const name = playerName ? playerName.trim() : 'Oyuncu';
    const roomCode = generateRoomCode();

    rooms[roomCode] = {
      code: roomCode,
      players: [
        { id: socket.id, name, isBot: false, seatIndex: 0, ready: true }
      ],
      gameStarted: false,
      gameState: null
    };

    currentRoomCode = roomCode;
    currentSeatIndex = 0;

    socket.join(roomCode);
    socket.emit('room_created', { roomCode, seatIndex: 0 });
    io.to(roomCode).emit('room_update', {
      players: rooms[roomCode].players,
      gameStarted: false
    });

    console.log(`Room created: ${roomCode} by host: ${name} (${socket.id})`);
  });

  // 2. Join Room
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = roomCode ? roomCode.trim().toUpperCase() : '';
    const name = playerName ? playerName.trim() : 'Misafir';

    const room = rooms[code];
    if (!room) {
      return socket.emit('error_msg', { message: 'Oda bulunamadı!' });
    }
    if (room.gameStarted) {
      return socket.emit('error_msg', { message: 'Oyun zaten başladı!' });
    }
    if (room.players.length >= 4) {
      return socket.emit('error_msg', { message: 'Oda dolu! En fazla 4 oyuncu katılabilir.' });
    }

    // Assign first available seat index (1, 2, or 3)
    const takenSeats = room.players.map(p => p.seatIndex);
    let assignedSeat = -1;
    for (let i = 0; i < 4; i++) {
      if (!takenSeats.includes(i)) {
        assignedSeat = i;
        break;
      }
    }

    const newPlayer = {
      id: socket.id,
      name,
      isBot: false,
      seatIndex: assignedSeat,
      ready: true
    };

    room.players.push(newPlayer);
    currentRoomCode = code;
    currentSeatIndex = assignedSeat;

    socket.join(code);
    socket.emit('room_joined', { roomCode: code, seatIndex: assignedSeat });
    io.to(code).emit('room_update', {
      players: room.players,
      gameStarted: false
    });

    console.log(`Player ${name} (${socket.id}) joined Room ${code} at seat ${assignedSeat}`);
  });

  // 3. Start Game
  socket.on('start_game', () => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    if (room.players[0].id !== socket.id) {
      return socket.emit('error_msg', { message: 'Sadece oda kurucusu oyunu başlatabilir!' });
    }

    room.gameStarted = true;

    // Fill remaining seats with bots
    const names = ['Ahmet', 'Mehmet', 'Ayşe', 'Can'];
    const takenSeats = room.players.map(p => p.seatIndex);
    for (let i = 0; i < 4; i++) {
      if (!takenSeats.includes(i)) {
        const botName = 'Bot ' + names[i];
        room.players.push({
          id: `bot_${i}`,
          name: botName,
          isBot: true,
          seatIndex: i,
          ready: true
        });
      }
    }

    // Sort players by seatIndex to keep consistency
    room.players.sort((a, b) => a.seatIndex - b.seatIndex);

    io.to(currentRoomCode).emit('game_started', { players: room.players });
    console.log(`Game started in room ${currentRoomCode}. Players:`, room.players.map(p => p.name));
  });

  // 4. Sync Game State (State Relay)
  socket.on('sync_state', (gameState) => {
    const room = rooms[currentRoomCode];
    if (!room) return;

    // Merge with previous gameState to preserve hands of other players
    if (room.gameState) {
      if (gameState.hands) {
        for (let i = 0; i < 4; i++) {
          if (i !== currentSeatIndex) {
            if (gameState.hands[i]) {
              gameState.hands[i] = gameState.hands[i].map((t, idx) => {
                const cachedHand = room.gameState.hands[i];
                if (t && t.hidden && cachedHand && cachedHand[idx]) {
                  return cachedHand[idx];
                }
                return t;
              });
            } else {
              gameState.hands[i] = room.gameState.hands[i];
            }
          }
        }
      }
      // Also preserve botHands if not provided or if updated by non-host
      if (!gameState.botHands && room.gameState.botHands) {
        gameState.botHands = room.gameState.botHands;
      } else if (currentSeatIndex !== 0 && room.gameState.botHands) {
        gameState.botHands = room.gameState.botHands;
      }
    }

    // Update server side gameState cache
    room.gameState = gameState;

    // Broadcast tailored state update to all players
    room.players.forEach((p) => {
      if (p.isBot) return;

      // Filter state for player `p` to prevent cheating
      const filteredState = filterStateForPlayer(gameState, p.seatIndex);

      io.to(p.id).emit('state_update', filteredState);
    });
  });

  // Chat message relay
  socket.on('send_message', (text) => {
    const room = rooms[currentRoomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(currentRoomCode).emit('chat_message', {
      sender: player.name,
      text: text
    });
  });

  // 5. Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (!currentRoomCode) return;

    const room = rooms[currentRoomCode];
    if (!room) return;

    const pIndex = room.players.findIndex(p => p.id === socket.id);
    if (pIndex === -1) return;

    const leavingPlayer = room.players[pIndex];

    if (!room.gameStarted) {
      // Game hasn't started yet: simply remove player
      room.players.splice(pIndex, 1);
      io.to(currentRoomCode).emit('room_update', {
        players: room.players,
        gameStarted: false
      });
      console.log(`Player ${leavingPlayer.name} removed from room ${currentRoomCode}`);
    } else {
      // Game has started:
      if (leavingPlayer.seatIndex === 0) {
        // Host disconnected: end room
        io.to(currentRoomCode).emit('error_msg', { message: 'Oda kurucusu ayrıldı. Oda kapatılıyor!' });
        delete rooms[currentRoomCode];
        console.log(`Room ${currentRoomCode} deleted because host left`);
      } else {
        // Guest disconnected: replace player with a Bot
        leavingPlayer.isBot = true;
        leavingPlayer.name = `Bot ${leavingPlayer.name}`;
        leavingPlayer.id = `bot_${leavingPlayer.seatIndex}`;

        io.to(currentRoomCode).emit('room_update', {
          players: room.players,
          gameStarted: true
        });

        // Trigger Host client to re-check turns/bot AI
        io.to(room.players[0].id).emit('guest_became_bot', { seatIndex: leavingPlayer.seatIndex });

        console.log(`Player ${leavingPlayer.name} disconnected. Replaced with Bot at seat ${leavingPlayer.seatIndex}`);
      }
    }
  });
});

// Helper function to strip private hand info of other players
function filterStateForPlayer(state, playerSeat) {
  if (!state) return null;

  // At the end of the round, reveal everyone's actual hands
  if (state.gamePhase === 'round_ended') {
    return state;
  }

  // Clone state
  const stateCopy = JSON.parse(JSON.stringify(state));

  // If hands exist, hide non-player hands
  if (stateCopy.hands) {
    stateCopy.hands = stateCopy.hands.map((hand, idx) => {
      if (idx === playerSeat) return hand; // keep player's own hand
      if (!hand) return null;
      // Replace other player hands with dummy count representations to prevent inspect cheating
      return hand.map(t => {
        if (!t) return null;
        // Keep ID if needed, but strip num/color/isOkey
        return { id: t.id, hidden: true };
      });
    });
  }

  // Hide botHands for non-hosts (botHands should only be fully visible to the Host (seatIndex 0) who computes bot AI)
  if (playerSeat !== 0 && stateCopy.botHands) {
    stateCopy.botHands = stateCopy.botHands.map(hand => {
      if (!hand) return null;
      return hand.map(t => {
        if (!t) return null;
        return { id: t.id, hidden: true };
      });
    });
  }

  return stateCopy;
}

server.listen(PORT, () => {
  console.log(`101 Okey server running on port ${PORT}`);
});
