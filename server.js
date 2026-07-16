import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Serve static files from Vite build in production
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html for all routes in production (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Game Rooms State Store
const rooms = new Map();

// Color Palette for players (Windows 95 high-contrast style colors)
const PLAYER_COLORS = [
  '#0000ff', // Blue
  '#008000', // Green
  '#ff0000', // Red
  '#800080', // Purple
  '#ff8c00', // Dark Orange
  '#008080', // Teal
  '#ff1493', // Deep Pink
  '#8b4513', // Saddle Brown
];

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate an empty board grid
function createEmptyBoard(width, height) {
  const grid = [];
  for (let r = 0; r < height; r++) {
    const row = [];
    for (let c = 0; c < width; c++) {
      row.push({
        row: r,
        col: c,
        isMine: false,
        neighborMines: 0,
        isRevealed: false,
        isFlagged: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

// Check if coordinates are in bounds
function inBounds(r, c, width, height) {
  return r >= 0 && r < height && c >= 0 && c < width;
}

// Place mines after the first click is executed, ensuring safety
function generateMines(room, firstR, firstC) {
  const { width, height, minesCount } = room.settings;
  const grid = room.board.grid;
  
  let minesPlaced = 0;
  const mines = [];

  // Define neighborhood around first click to make it a blank space (standard Minesweeper)
  const safeCells = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = firstR + dr;
      const nc = firstC + dc;
      if (inBounds(nr, nc, width, height)) {
        safeCells.add(`${nr},${nc}`);
      }
    }
  }

  // Fallback: If mines count is too high, just protect the first cell itself
  const maxSafeCells = width * height - minesCount;
  if (maxSafeCells < safeCells.size) {
    safeCells.clear();
    safeCells.add(`${firstR},${firstC}`);
  }

  while (minesPlaced < minesCount) {
    const r = Math.floor(Math.random() * height);
    const c = Math.floor(Math.random() * width);
    const key = `${r},${c}`;

    if (!grid[r][c].isMine && !safeCells.has(key)) {
      grid[r][c].isMine = true;
      mines.push([r, c]);
      minesPlaced++;
    }
  }

  // Calculate neighbor counts
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c].isMine) continue;
      
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc, width, height) && grid[nr][nc].isMine) {
            count++;
          }
        }
      }
      grid[r][c].neighborMines = count;
    }
  }

  room.board.mines = mines;
  room.board.generated = true;
}

// Reveal a tile, with recursive flood fill
function revealTile(room, startR, startC) {
  const grid = room.board.grid;
  const { width, height } = room.settings;

  if (!inBounds(startR, startC, width, height)) return [];

  const cell = grid[startR][startC];
  if (cell.isRevealed || cell.isFlagged) return [];

  // Hit a mine!
  if (cell.isMine) {
    cell.isRevealed = true;
    handleGameOver(room, false);
    return [cell];
  }

  const revealedCells = [];
  const queue = [[startR, startC]];
  cell.isRevealed = true;
  revealedCells.push(cell);

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const current = grid[r][c];

    if (current.neighborMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc, width, height)) {
            const neighbor = grid[nr][nc];
            if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
              neighbor.isRevealed = true;
              revealedCells.push(neighbor);
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  checkWinCondition(room);
  return revealedCells;
}

// Handle double click / chord reveal
function chordReveal(room, r, c) {
  const grid = room.board.grid;
  const { width, height } = room.settings;
  const cell = grid[r][c];
  
  if (!cell.isRevealed || cell.neighborMines === 0) return [];

  // Count flags around the cell
  let flagCount = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc, width, height) && grid[nr][nc].isFlagged) {
        flagCount++;
      }
    }
  }

  // If flag count matches the neighbor mine count, reveal all other neighbors
  if (flagCount === cell.neighborMines) {
    const cellsToReveal = [];
    let hitMine = false;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc, width, height)) {
          const neighbor = grid[nr][nc];
          if (!neighbor.isRevealed && !neighbor.isFlagged) {
            cellsToReveal.push([nr, nc]);
            if (neighbor.isMine) {
              hitMine = true;
            }
          }
        }
      }
    }

    if (cellsToReveal.length === 0) return [];

    // Trigger mine hits or flood reveal
    let revealed = [];
    for (const [nr, nc] of cellsToReveal) {
      // If it's a mine, we reveal it and fail
      const neighbor = grid[nr][nc];
      if (neighbor.isMine) {
        neighbor.isRevealed = true;
        revealed.push(neighbor);
      } else {
        revealed = revealed.concat(revealTile(room, nr, nc));
      }
    }

    if (hitMine) {
      handleGameOver(room, false);
    }
    return revealed;
  }
  return [];
}

// Check if the board is solved
function checkWinCondition(room) {
  const { width, height, minesCount } = room.settings;
  const grid = room.board.grid;

  let revealedCount = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c].isRevealed) {
        revealedCount++;
      }
    }
  }

  const totalCells = width * height;
  if (revealedCount === totalCells - minesCount) {
    handleGameOver(room, true);
  }
}

// Game Over handler (Win / Loss)
function handleGameOver(room, won) {
  room.gameState = won ? 'won' : 'lost';
  stopTimer(room);

  // Reveal all mines on loss or place flags on all mines on win
  const grid = room.board.grid;
  for (let r = 0; r < room.settings.height; r++) {
    for (let c = 0; c < room.settings.width; c++) {
      const cell = grid[r][c];
      if (cell.isMine) {
        if (won) {
          cell.isFlagged = true;
        } else if (!cell.isRevealed && !cell.isFlagged) {
          cell.isRevealed = true; // Show unrevealed mines
        }
      } else if (cell.isFlagged) {
        // Flagged a cell that was not a mine (wrong flag)
        room.board.grid[r][c].wrongFlag = true;
      }
    }
  }

  const logText = won ? 'Game Won! Excellent work!' : 'Game Over! Hit a mine!';
  addLog(room, 'info', logText, won ? '#008000' : '#ff0000');
}

// Start game timer
function startTimer(room) {
  if (room.timerInterval) return;
  room.timerInterval = setInterval(() => {
    room.timer++;
    io.to(room.id).emit('timer_update', room.timer);
    if (room.timer >= 999) {
      stopTimer(room);
    }
  }, 1000);
}

// Stop game timer
function stopTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

// Helper to push history logs
function addLog(room, type, text, color = '#000000', username = '') {
  const logItem = {
    id: Math.random().toString(36).substring(2, 9),
    type,
    text,
    color,
    username,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
  room.history.push(logItem);
  if (room.history.length > 100) room.history.shift(); // Cap history
  return logItem;
}

// Get clean object representing room without server-side references (e.g. interval IDs)
function getRoomPayload(room) {
  return {
    id: room.id,
    creator: room.creator,
    settings: room.settings,
    players: room.players,
    board: {
      grid: room.board.grid,
      generated: room.board.generated,
      minesCount: room.settings.minesCount,
    },
    gameState: room.gameState,
    timer: room.timer,
    pendingActions: room.pendingActions,
    history: room.history,
  };
}

// Difficulties Setup
const DIFFICULTIES = {
  beginner: { width: 9, height: 9, minesCount: 10 },
  intermediate: { width: 16, height: 16, minesCount: 40 },
  expert: { width: 30, height: 16, minesCount: 99 },
};

io.on('connection', (socket) => {
  let currentRoomCode = null;
  let username = 'Anonymous';

  // Create Room
  socket.on('create_room', (data) => {
    username = data.username || 'Host';
    const difficultyKey = data.difficulty || 'beginner';
    const settings = {
      difficulty: difficultyKey,
      width: DIFFICULTIES[difficultyKey]?.width || 9,
      height: DIFFICULTIES[difficultyKey]?.height || 9,
      minesCount: DIFFICULTIES[difficultyKey]?.minesCount || 10,
      approvalMode: true, // Default to approval mode
    };

    if (difficultyKey === 'custom') {
      settings.width = Math.max(5, Math.min(50, parseInt(data.width) || 9));
      settings.height = Math.max(5, Math.min(50, parseInt(data.height) || 9));
      const maxMines = Math.floor((settings.width * settings.height) * 0.8);
      settings.minesCount = Math.max(1, Math.min(maxMines, parseInt(data.minesCount) || 10));
    }

    const roomId = generateRoomId();
    const playerColor = PLAYER_COLORS[0];

    const room = {
      id: roomId,
      creator: socket.id,
      settings,
      players: [{ id: socket.id, username, color: playerColor, active: true }],
      board: {
        grid: createEmptyBoard(settings.width, settings.height),
        generated: false,
        mines: [],
      },
      gameState: 'idle',
      timer: 0,
      timerInterval: null,
      pendingActions: [],
      history: [],
    };

    rooms.set(roomId, room);
    currentRoomCode = roomId;

    socket.join(roomId);
    addLog(room, 'info', `Room created by ${username}. Code: ${roomId}`, '#000080');

    socket.emit('room_state', getRoomPayload(room));
  });

  // Join Room
  socket.on('join_room', (data) => {
    const code = (data.code || '').trim().toUpperCase();
    username = data.username || 'Player';
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error_message', 'Room not found. Check the code!');
      return;
    }

    // Check if player is already in room or add new
    let player = room.players.find(p => p.id === socket.id);
    if (!player) {
      const colorIndex = room.players.length % PLAYER_COLORS.length;
      const playerColor = PLAYER_COLORS[colorIndex];
      player = { id: socket.id, username, color: playerColor, active: true };
      room.players.push(player);
    }

    currentRoomCode = code;
    socket.join(code);

    addLog(room, 'info', `${username} joined the game.`, player.color);
    io.to(code).emit('room_state', getRoomPayload(room));
  });

  // Handle Cursor Movements
  socket.on('cursor_move', (coords) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      socket.to(currentRoomCode).emit('remote_cursor_move', {
        id: socket.id,
        username: player.username,
        color: player.color,
        x: coords.x,
        y: coords.y,
        cellRow: coords.cellRow,
        cellCol: coords.cellCol,
      });
    }
  });

  // Handle Game Clicks (Left reveal / Right flag)
  socket.on('game_action', (action) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState === 'won' || room.gameState === 'lost') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const { row, col, type } = action; // type: 'reveal' | 'flag' | 'chord'
    const grid = room.board.grid;
    const cell = grid[row]?.[col];

    if (!cell) return;

    if (type === 'flag') {
      if (cell.isRevealed) return;
      cell.isFlagged = !cell.isFlagged;
      
      const logText = cell.isFlagged 
        ? `${player.username} flagged tile (${row + 1}, ${col + 1})`
        : `${player.username} unflagged tile (${row + 1}, ${col + 1})`;
      
      addLog(room, 'action', logText, player.color);
      checkWinCondition(room);
      io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
    } 
    else if (type === 'reveal' || type === 'chord') {
      if (cell.isRevealed || (cell.isFlagged && type === 'reveal')) return;

      // Click Approval System check
      // Only bypass if approvalMode is OFF, or there is only 1 player in the room.
      const bypassApproval = !room.settings.approvalMode || room.players.length === 1;

      if (bypassApproval) {
        // Execute Action Immediately
        executeRevealAction(room, player, row, col, type);
      } else {
        // Queue Action for approval
        // Prevent duplicate actions in queue for same cell
        const exists = room.pendingActions.some(a => a.row === row && a.col === col && a.type === type);
        if (exists) return;

        const actionId = Math.random().toString(36).substring(2, 9);
        const newAction = {
          id: actionId,
          playerId: socket.id,
          username: player.username,
          color: player.color,
          row,
          col,
          type,
          approvals: [],
        };

        room.pendingActions.push(newAction);
        addLog(room, 'action', `${player.username} requested click at (${row + 1}, ${col + 1})`, player.color);
        io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
      }
    }
  });

  // Execute actual reveal action
  function executeRevealAction(room, clicker, row, col, type) {
    if (room.gameState === 'idle') {
      room.gameState = 'playing';
      // First click is always safe
      if (!room.board.generated) {
        generateMines(room, row, col);
      }
      startTimer(room);
    }

    if (type === 'chord') {
      chordReveal(room, row, col);
    } else {
      revealTile(room, row, col);
    }

    // Clean up any pending actions for cells that have just been revealed
    room.pendingActions = room.pendingActions.filter(act => {
      const c = room.board.grid[act.row]?.[act.col];
      return c && !c.isRevealed;
    });

    io.to(room.id).emit('room_state', getRoomPayload(room));
  }

  // Approve a pending action
  socket.on('approve_action', (data) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const action = room.pendingActions.find(a => a.id === data.actionId);
    if (!action) return;

    // A player cannot approve their own action unless solo (which bypasses anyway)
    if (action.playerId === socket.id) return;

    // Check if player has already approved
    if (action.approvals.includes(socket.id)) return;

    action.approvals.push(socket.id);
    addLog(room, 'info', `${player.username} approved ${action.username}'s click`, player.color);

    // Simple cooperative rule: 1 approval from anyone else triggers the click immediately
    const clicker = room.players.find(p => p.id === action.playerId);
    executeRevealAction(room, clicker || player, action.row, action.col, action.type);
  });

  // Reject a pending action
  socket.on('reject_action', (data) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const actionIndex = room.pendingActions.findIndex(a => a.id === data.actionId);
    if (actionIndex === -1) return;

    const action = room.pendingActions[actionIndex];
    room.pendingActions.splice(actionIndex, 1);

    addLog(room, 'info', `${player.username} rejected ${action.username}'s click`, player.color);
    io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
  });

  // Toggle Click Approval settings
  socket.on('toggle_approval', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    room.settings.approvalMode = !room.settings.approvalMode;
    const modeStr = room.settings.approvalMode ? 'ENABLED' : 'DISABLED';
    
    addLog(room, 'info', `Click Approval Mode ${modeStr} by ${player.username}`, '#800080');
    io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
  });

  // Reset Game
  socket.on('reset_game', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    const name = player ? player.username : 'Someone';

    stopTimer(room);
    room.board.grid = createEmptyBoard(room.settings.width, room.settings.height);
    room.board.generated = false;
    room.board.mines = [];
    room.gameState = 'idle';
    room.timer = 0;
    room.pendingActions = [];

    addLog(room, 'info', `Game reset by ${name}`, '#000080');
    io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
  });

  // Change Difficulty
  socket.on('change_difficulty', (data) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    const name = player ? player.username : 'Someone';

    const difficultyKey = data.difficulty || 'beginner';
    const settings = room.settings;
    settings.difficulty = difficultyKey;
    settings.width = DIFFICULTIES[difficultyKey]?.width || 9;
    settings.height = DIFFICULTIES[difficultyKey]?.height || 9;
    settings.minesCount = DIFFICULTIES[difficultyKey]?.minesCount || 10;

    if (difficultyKey === 'custom') {
      settings.width = Math.max(5, Math.min(50, parseInt(data.width) || 9));
      settings.height = Math.max(5, Math.min(50, parseInt(data.height) || 9));
      const maxMines = Math.floor((settings.width * settings.height) * 0.8);
      settings.minesCount = Math.max(1, Math.min(maxMines, parseInt(data.minesCount) || 10));
    }

    stopTimer(room);
    room.board.grid = createEmptyBoard(settings.width, settings.height);
    room.board.generated = false;
    room.board.mines = [];
    room.gameState = 'idle';
    room.timer = 0;
    room.pendingActions = [];

    addLog(room, 'info', `Difficulty changed to ${difficultyKey.toUpperCase()} (${settings.width}x${settings.height}, ${settings.minesCount} mines) by ${name}`, '#000080');
    io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
  });

  // Send Chat Message
  socket.on('send_chat', (msg) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      addLog(room, 'chat', msg, player.color, player.username);
      io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const player = room.players[playerIndex];
          room.players.splice(playerIndex, 1);
          
          // Clean up pending actions by this player
          room.pendingActions = room.pendingActions.filter(a => a.playerId !== socket.id);

          addLog(room, 'info', `${player.username} left the game.`, '#808080');

          if (room.players.length === 0) {
            // Delete room if empty
            stopTimer(room);
            rooms.delete(currentRoomCode);
          } else {
            // If host left, assign new host
            if (room.creator === socket.id && room.players.length > 0) {
              room.creator = room.players[0].id;
              addLog(room, 'info', `${room.players[0].username} is now the host.`, '#000080');
            }
            io.to(currentRoomCode).emit('room_state', getRoomPayload(room));
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
