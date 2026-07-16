// ============================================================
// Game Engine — runs entirely in the host's browser
// Extracted from server.js, no server dependencies
// ============================================================

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

const DIFFICULTIES = {
  beginner:     { width: 9,  height: 9,  minesCount: 10 },
  intermediate: { width: 16, height: 16, minesCount: 40 },
  expert:       { width: 30, height: 16, minesCount: 99 },
};

// ── Board Helpers ──────────────────────────────────────────

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
        isQuestionMark: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function inBounds(r, c, width, height) {
  return r >= 0 && r < height && c >= 0 && c < width;
}

function generateMines(room, firstR, firstC) {
  const { width, height, minesCount } = room.settings;
  const grid = room.board.grid;

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

  const maxSafeCells = width * height - minesCount;
  if (maxSafeCells < safeCells.size) {
    safeCells.clear();
    safeCells.add(`${firstR},${firstC}`);
  }

  let minesPlaced = 0;
  const mines = [];

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

// ── Reveal / Chord / Win ───────────────────────────────────

function revealTile(room, startR, startC) {
  const grid = room.board.grid;
  const { width, height } = room.settings;

  if (!inBounds(startR, startC, width, height)) return [];

  const cell = grid[startR][startC];
  if (cell.isRevealed || cell.isFlagged) return [];

  if (cell.isMine) {
    cell.isRevealed = true;
    cell.isQuestionMark = false;
    handleGameOver(room, false);
    return [cell];
  }

  const revealedCells = [];
  const queue = [[startR, startC]];
  cell.isRevealed = true;
  cell.isQuestionMark = false;
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
              neighbor.isQuestionMark = false;
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

function chordReveal(room, r, c) {
  const grid = room.board.grid;
  const { width, height } = room.settings;
  const cell = grid[r][c];

  if (!cell.isRevealed || cell.neighborMines === 0) return [];

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
            if (neighbor.isMine) hitMine = true;
          }
        }
      }
    }

    if (cellsToReveal.length === 0) return [];

    let revealed = [];
    for (const [nr, nc] of cellsToReveal) {
      const neighbor = grid[nr][nc];
      if (neighbor.isMine) {
        neighbor.isRevealed = true;
        revealed.push(neighbor);
      } else {
        revealed = revealed.concat(revealTile(room, nr, nc));
      }
    }

    if (hitMine) handleGameOver(room, false);
    return revealed;
  }
  return [];
}

function checkWinCondition(room) {
  const { width, height, minesCount } = room.settings;
  const grid = room.board.grid;

  let revealedCount = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c].isRevealed) revealedCount++;
    }
  }

  if (revealedCount === width * height - minesCount) {
    handleGameOver(room, true);
  }
}

function handleGameOver(room, won) {
  room.gameState = won ? 'won' : 'lost';
  room._stopTimer();

  const grid = room.board.grid;
  for (let r = 0; r < room.settings.height; r++) {
    for (let c = 0; c < room.settings.width; c++) {
      const cell = grid[r][c];
      if (cell.isMine) {
        if (won) {
          cell.isFlagged = true;
          cell.isQuestionMark = false;
        } else if (!cell.isRevealed && !cell.isFlagged) {
          cell.isRevealed = true;
          cell.isQuestionMark = false;
        }
      } else if (cell.isFlagged) {
        room.board.grid[r][c].wrongFlag = true;
      }
    }
  }

  const logText = won ? 'Game Won! Excellent work!' : 'Game Over! Hit a mine!';
  room._addLog('info', logText, won ? '#008000' : '#ff0000');
}

// ── Game Engine Class ──────────────────────────────────────

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class GameEngine {
  constructor(hostUsername, difficultyKey, customOpts = {}) {
    const settings = {
      difficulty: difficultyKey,
      width:  DIFFICULTIES[difficultyKey]?.width  || 9,
      height: DIFFICULTIES[difficultyKey]?.height || 9,
      minesCount: DIFFICULTIES[difficultyKey]?.minesCount || 10,
      approvalMode: true,
    };

    if (difficultyKey === 'custom') {
      settings.width  = Math.max(5, Math.min(50, parseInt(customOpts.width)  || 9));
      settings.height = Math.max(5, Math.min(50, parseInt(customOpts.height) || 9));
      const maxMines = Math.floor((settings.width * settings.height) * 0.8);
      settings.minesCount = Math.max(1, Math.min(maxMines, parseInt(customOpts.minesCount) || 10));
    }

    this.roomId = generateRoomId();

    // The host player gets a special stable ID
    this.hostId = '__host__';

    this.room = {
      id: this.roomId,
      creator: this.hostId,
      settings,
      players: [{ id: this.hostId, username: hostUsername, color: PLAYER_COLORS[0], active: true }],
      board: {
        grid: createEmptyBoard(settings.width, settings.height),
        generated: false,
        mines: [],
      },
      gameState: 'idle',
      timer: 0,
      pendingActions: [],
      history: [],

      // Internal helpers attached to room for convenience
      _timerInterval: null,
      _onTimerTick: null,

      _startTimer: function () {
        if (this._timerInterval) return;
        this._timerInterval = setInterval(() => {
          this.timer++;
          if (this._onTimerTick) this._onTimerTick(this.timer);
          if (this.timer >= 999) this._stopTimer();
        }, 1000);
      },

      _stopTimer: function () {
        if (this._timerInterval) {
          clearInterval(this._timerInterval);
          this._timerInterval = null;
        }
      },

      _addLog: function (type, text, color = '#000000', username = '') {
        const logItem = {
          id: Math.random().toString(36).substring(2, 9),
          type,
          text,
          color,
          username,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        this.history.push(logItem);
        if (this.history.length > 100) this.history.shift();
        return logItem;
      },
    };

    this.room._addLog('info', `Room created by ${hostUsername}. Code: ${this.roomId}`, '#000080');
  }

  // Set a callback for timer ticks (so the host can broadcast)
  onTimerTick(callback) {
    this.room._onTimerTick = callback;
  }

  // Get a clean state snapshot to send to peers
  getState() {
    return {
      id: this.room.id,
      creator: this.room.creator,
      settings: this.room.settings,
      players: this.room.players,
      board: {
        grid: this.room.board.grid,
        generated: this.room.board.generated,
        minesCount: this.room.settings.minesCount,
      },
      gameState: this.room.gameState,
      timer: this.room.timer,
      pendingActions: this.room.pendingActions,
      history: this.room.history,
    };
  }

  // ── Player Management ──

  addPlayer(peerId, username) {
    let player = this.room.players.find(p => p.id === peerId);
    if (!player) {
      const colorIndex = this.room.players.length % PLAYER_COLORS.length;
      player = { id: peerId, username, color: PLAYER_COLORS[colorIndex], active: true };
      this.room.players.push(player);
    }
    this.room._addLog('info', `${username} joined the game.`, player.color);
    return player;
  }

  removePlayer(peerId) {
    const idx = this.room.players.findIndex(p => p.id === peerId);
    if (idx === -1) return;

    const player = this.room.players[idx];
    this.room.players.splice(idx, 1);
    this.room.pendingActions = this.room.pendingActions.filter(a => a.playerId !== peerId);
    this.room._addLog('info', `${player.username} left the game.`, '#808080');

    // Reassign host if needed
    if (this.room.creator === peerId && this.room.players.length > 0) {
      this.room.creator = this.room.players[0].id;
      this.room._addLog('info', `${this.room.players[0].username} is now the host.`, '#000080');
    }
  }

  // ── Game Actions ──

  handleAction(playerId, action) {
    const room = this.room;
    if (room.gameState === 'won' || room.gameState === 'lost') return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const { row, col, type } = action;
    const grid = room.board.grid;
    const cell = grid[row]?.[col];
    if (!cell) return;

    if (type === 'flag') {
      if (cell.isRevealed) return;
      
      let logText = '';
      if (!cell.isFlagged && !cell.isQuestionMark) {
        // Unrevealed -> Flagged
        cell.isFlagged = true;
        logText = `${player.username} flagged tile (${row + 1}, ${col + 1})`;
      } else if (cell.isFlagged) {
        // Flagged -> Question Mark
        cell.isFlagged = false;
        cell.isQuestionMark = true;
        logText = `${player.username} marked tile (${row + 1}, ${col + 1}) with question mark`;
      } else {
        // Question Mark -> Unrevealed
        cell.isQuestionMark = false;
        logText = `${player.username} cleared tile (${row + 1}, ${col + 1})`;
      }

      room._addLog('action', logText, player.color);
      checkWinCondition(room);
    } else if (type === 'reveal' || type === 'chord') {
      if (cell.isRevealed || (cell.isFlagged && type === 'reveal')) return;

      const bypassApproval = !room.settings.approvalMode || room.players.length === 1;

      if (bypassApproval) {
        this._executeReveal(player, row, col, type);
      } else {
        const exists = room.pendingActions.some(a => a.row === row && a.col === col && a.type === type);
        if (exists) return;

        const actionId = Math.random().toString(36).substring(2, 9);
        room.pendingActions.push({
          id: actionId,
          playerId,
          username: player.username,
          color: player.color,
          row,
          col,
          type,
          approvals: [],
        });
        room._addLog('action', `${player.username} requested click at (${row + 1}, ${col + 1})`, player.color);
      }
    }
  }

  _executeReveal(clicker, row, col, type) {
    const room = this.room;

    if (room.gameState === 'idle') {
      room.gameState = 'playing';
      if (!room.board.generated) {
        generateMines(room, row, col);
      }
      room._startTimer();
    }

    if (type === 'chord') {
      chordReveal(room, row, col);
    } else {
      revealTile(room, row, col);
    }

    // Clean up pending for revealed cells
    room.pendingActions = room.pendingActions.filter(act => {
      const c = room.board.grid[act.row]?.[act.col];
      return c && !c.isRevealed;
    });
  }

  approveAction(playerId, actionId) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const action = room.pendingActions.find(a => a.id === actionId);
    if (!action) return;

    // Can't approve own action
    if (action.playerId === playerId) return;
    if (action.approvals.includes(playerId)) return;

    action.approvals.push(playerId);
    room._addLog('info', `${player.username} approved ${action.username}'s click`, player.color);

    const clicker = room.players.find(p => p.id === action.playerId);
    this._executeReveal(clicker || player, action.row, action.col, action.type);
  }

  rejectAction(playerId, actionId) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const idx = room.pendingActions.findIndex(a => a.id === actionId);
    if (idx === -1) return;

    const action = room.pendingActions[idx];
    room.pendingActions.splice(idx, 1);
    room._addLog('info', `${player.username} rejected ${action.username}'s click`, player.color);
  }

  toggleApproval(playerId) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    room.settings.approvalMode = !room.settings.approvalMode;
    const modeStr = room.settings.approvalMode ? 'ENABLED' : 'DISABLED';
    room._addLog('info', `Click Approval Mode ${modeStr} by ${player.username}`, '#800080');
  }

  resetGame(playerId) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    const name = player ? player.username : 'Someone';

    room._stopTimer();
    room.board.grid = createEmptyBoard(room.settings.width, room.settings.height);
    room.board.generated = false;
    room.board.mines = [];
    room.gameState = 'idle';
    room.timer = 0;
    room.pendingActions = [];

    room._addLog('info', `Game reset by ${name}`, '#000080');
  }

  changeDifficulty(playerId, difficultyKey, customOpts = {}) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    const name = player ? player.username : 'Someone';

    const settings = room.settings;
    settings.difficulty = difficultyKey;
    settings.width  = DIFFICULTIES[difficultyKey]?.width  || 9;
    settings.height = DIFFICULTIES[difficultyKey]?.height || 9;
    settings.minesCount = DIFFICULTIES[difficultyKey]?.minesCount || 10;

    if (difficultyKey === 'custom') {
      settings.width  = Math.max(5, Math.min(50, parseInt(customOpts.width)  || 9));
      settings.height = Math.max(5, Math.min(50, parseInt(customOpts.height) || 9));
      const maxMines = Math.floor((settings.width * settings.height) * 0.8);
      settings.minesCount = Math.max(1, Math.min(maxMines, parseInt(customOpts.minesCount) || 10));
    }

    room._stopTimer();
    room.board.grid = createEmptyBoard(settings.width, settings.height);
    room.board.generated = false;
    room.board.mines = [];
    room.gameState = 'idle';
    room.timer = 0;
    room.pendingActions = [];

    room._addLog('info', `Difficulty changed to ${difficultyKey.toUpperCase()} (${settings.width}x${settings.height}, ${settings.minesCount} mines) by ${name}`, '#000080');
  }

  sendChat(playerId, msg) {
    const room = this.room;
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      room._addLog('chat', msg, player.color, player.username);
    }
  }

  destroy() {
    this.room._stopTimer();
  }
}
