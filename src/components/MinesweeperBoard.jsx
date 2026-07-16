import React, { useState, useEffect, useRef } from 'react';
import SevenSegment from './SevenSegment';

export default function MinesweeperBoard({ room, network, myPlayerId, isHost }) {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState({});
  const gridRef = useRef(null);

  // Track flags remaining (Mines - flags placed)
  const calculateFlagsRemaining = () => {
    let flags = 0;
    room.board.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.isFlagged) flags++;
      });
    });
    return room.settings.minesCount - flags;
  };

  // Sync remote cursor tracking
  useEffect(() => {
    if (!network) return;

    if (isHost) {
      // Host receives cursors via the hostRemoteCursors prop on network
      // This is handled reactively via the network interface
      return;
    }

    // Client: listen for cursor events from host
    const handleRemoteCursor = (data) => {
      setRemoteCursors(prev => ({
        ...prev,
        [data.id]: data
      }));
    };

    network.on('remote_cursor_move', handleRemoteCursor);

    // Clean up cursor if player leaves
    const handleRoomState = (updatedRoom) => {
      const activeIds = updatedRoom.players.map(p => p.id);
      setRemoteCursors(prev => {
        const clean = { ...prev };
        Object.keys(clean).forEach(id => {
          if (!activeIds.includes(id)) {
            delete clean[id];
          }
        });
        return clean;
      });
    };

    network.on('room_state', handleRoomState);

    return () => {
      network.off('remote_cursor_move', handleRemoteCursor);
      network.off('room_state', handleRoomState);
    };
  }, [network, isHost]);

  // For host: use the cursor data passed through the network interface
  const activeCursors = isHost
    ? (network?.hostRemoteCursors || {})
    : remoteCursors;

  // Clean cursors when players leave (for host)
  const filteredCursors = {};
  const activePlayerIds = room.players.map(p => p.id);
  Object.entries(activeCursors).forEach(([id, cursor]) => {
    if (activePlayerIds.includes(id) && id !== myPlayerId) {
      filteredCursors[id] = cursor;
    }
  });

  // Track mouse coordinates over the board and emit
  const handleMouseMove = (e) => {
    if (!network || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellWidth = 32;
    const cellHeight = 32;
    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    network.emit('cursor_move', {
      x,
      y,
      cellRow: row,
      cellCol: col
    });
  };

  const handleMouseLeave = () => {
    if (!network) return;
    network.emit('cursor_move', { x: -500, y: -500, cellRow: -1, cellCol: -1 });
  };

  // Click actions
  const handleCellClick = (r, c, type) => {
    if (room.gameState === 'won' || room.gameState === 'lost') return;
    network.emit('game_action', { row: r, col: c, type });
  };

  const handleReset = () => {
    network.emit('reset_game');
  };

  const handleChangeDifficulty = (difficulty) => {
    network.emit('change_difficulty', { difficulty });
  };

  // Determine smiley state
  const getSmileyFace = () => {
    if (room.gameState === 'lost') return '😵';
    if (room.gameState === 'won') return '😎';
    if (isMouseDown) return '😮';
    return '🙂';
  };

  const { grid } = room.board;
  const { width, height } = room.settings;

  // Retro assets for authentic styling
  const flagSvg = (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ width: '18px', height: '18px', display: 'block' }}>
      {/* Base */}
      <rect x="2" y="13" width="12" height="1" fill="#000000" />
      <rect x="3" y="12" width="10" height="1" fill="#000000" />
      <rect x="4" y="11" width="8" height="1" fill="#000000" />
      <rect x="5" y="10" width="6" height="1" fill="#000000" />
      {/* Pole */}
      <rect x="8" y="2" width="1" height="8" fill="#000000" />
      {/* Red flag */}
      <path d="M 3,2 L 8,2 L 8,7 L 3,7 Z" fill="#ff0000" />
    </svg>
  );

  const mineSvg = (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ width: '18px', height: '18px', display: 'block' }}>
      {/* Spikes */}
      <rect x="7" y="0" width="2" height="16" fill="#000000" />
      <rect x="0" y="7" width="16" height="2" fill="#000000" />
      <line x1="2" y1="2" x2="14" y2="14" stroke="#000000" strokeWidth="1.5" />
      <line x1="2" y1="14" x2="14" y2="2" stroke="#000000" strokeWidth="1.5" />
      {/* Body */}
      <rect x="5" y="4" width="6" height="8" fill="#000000" />
      <rect x="4" y="5" width="8" height="6" fill="#000000" />
      {/* White reflection shine */}
      <rect x="6" y="6" width="2" height="2" fill="#ffffff" />
    </svg>
  );

  // Render cell contents
  const renderCellContent = (cell) => {
    if (cell.isRevealed) {
      if (cell.isMine) {
        return mineSvg;
      }
      if (cell.neighborMines > 0) {
        return cell.neighborMines;
      }
      return '';
    } else {
      if (cell.isFlagged) {
        if (room.gameState === 'lost' && cell.wrongFlag) {
          // Wrongly flagged cell during game over
          return (
            <div style={{ position: 'relative', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {flagSvg}
              <span style={{
                position: 'absolute',
                color: '#ff0000',
                fontSize: '20px',
                fontWeight: 'bold',
                top: '-3px',
                left: '2px',
                textShadow: '1px 1px 1px #fff',
                pointerEvents: 'none'
              }}>
                ✕
              </span>
            </div>
          );
        }
        return flagSvg;
      }

      if (cell.isQuestionMark) {
        return <span style={{ fontWeight: 'bold', color: '#000080' }}>?</span>;
      }

      // If it is pending approval, show a colored indicator
      const pendingAction = room.pendingActions.find(a => a.row === cell.row && a.col === cell.col);
      if (pendingAction) {
        return (
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: pendingAction.color,
              border: '1px solid #fff',
              boxShadow: '0 0 3px #000'
            }}
            title={`Suggested by ${pendingAction.username}`}
          />
        );
      }
      return '';
    }
  };

  return (
    <div className="win95-window win95-outset" style={{ padding: '6px', userSelect: 'none', maxWidth: '100%' }}>

      {/* Menu / Difficulty Bar */}
      <div className="win95-menu-bar">
        <span style={{ fontWeight: 'bold', marginRight: '6px' }}>Game</span>
        <div style={{ display: 'flex', gap: '8px', color: '#555' }}>
          <span
            onClick={() => handleChangeDifficulty('beginner')}
            style={{
              cursor: 'pointer',
              color: room.settings.difficulty === 'beginner' ? '#000' : '#808080',
              fontWeight: room.settings.difficulty === 'beginner' ? 'bold' : 'normal',
              textDecoration: room.settings.difficulty === 'beginner' ? 'underline' : 'none'
            }}
          >
            Beginner
          </span>
          <span>|</span>
          <span
            onClick={() => handleChangeDifficulty('intermediate')}
            style={{
              cursor: 'pointer',
              color: room.settings.difficulty === 'intermediate' ? '#000' : '#808080',
              fontWeight: room.settings.difficulty === 'intermediate' ? 'bold' : 'normal',
              textDecoration: room.settings.difficulty === 'intermediate' ? 'underline' : 'none'
            }}
          >
            Intermediate
          </span>
          <span>|</span>
          <span
            onClick={() => handleChangeDifficulty('expert')}
            style={{
              cursor: 'pointer',
              color: room.settings.difficulty === 'expert' ? '#000' : '#808080',
              fontWeight: room.settings.difficulty === 'expert' ? 'bold' : 'normal',
              textDecoration: room.settings.difficulty === 'expert' ? 'underline' : 'none'
            }}
          >
            Expert
          </span>
        </div>
      </div>

      {/* Internal Beveled Frame (holds status header and grid) */}
      <div className="win95-inset" style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>

        {/* Status Header */}
        <div
          className="win95-inset-thin"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 6px',
            backgroundColor: '#c0c0c0',
            height: '52px'
          }}
        >
          {/* Flags remaining LED display */}
          <SevenSegment value={calculateFlagsRemaining()} />

          {/* Smiley Reset Button */}
          <button
            className="win95-button smiley-btn"
            onClick={handleReset}
            onMouseDown={() => setIsMouseDown(true)}
            onMouseUp={() => setIsMouseDown(false)}
            onMouseLeave={() => setIsMouseDown(false)}
          >
            {getSmileyFace()}
          </button>

          {/* Timer LED display */}
          <SevenSegment value={room.timer} />
        </div>

        {/* Scrollable grid container to make it fit on smaller screens */}
        <div style={{ maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
          <div
            ref={gridRef}
            className="ms-grid"
            style={{
              gridTemplateColumns: `repeat(${width}, 32px)`,
              gridTemplateRows: `repeat(${height}, 32px)`,
              width: `${width * 32 + 6}px`,
              height: `${height * 32 + 6}px`
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {grid.map((row, rIdx) =>
              row.map((cell, cIdx) => {
                const isPending = room.pendingActions.some(a => a.row === rIdx && a.col === cIdx);
                let cellClass = `ms-cell ${cell.isRevealed ? 'revealed' : 'unrevealed'}`;

                if (cell.isRevealed && cell.isMine) {
                  cellClass += ' exploded';
                }
                if (room.gameState === 'lost' && cell.wrongFlag) {
                  cellClass += ' wrong-flag';
                }
                if (isPending) {
                  cellClass += ' pending-approval';
                }

                const numClass = cell.isRevealed && cell.neighborMines > 0 ? `mine-num-${cell.neighborMines}` : '';

                return (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    className={`${cellClass} ${numClass}`}
                    onMouseDown={(e) => {
                      if (room.gameState === 'won' || room.gameState === 'lost') return;
                      if (e.button === 1) {
                        e.preventDefault(); // prevent middle-click auto-scroll
                      }
                      if (e.button === 0 && !cell.isRevealed && !cell.isFlagged) {
                        setIsMouseDown(true);
                      }
                    }}
                    onMouseUp={(e) => {
                      setIsMouseDown(false);
                      if (room.gameState === 'won' || room.gameState === 'lost') return;

                      if (e.button === 0) {
                        if (cell.isRevealed) {
                          handleCellClick(rIdx, cIdx, 'chord');
                        } else {
                          handleCellClick(rIdx, cIdx, 'reveal');
                        }
                      } else if (e.button === 1) {
                        e.preventDefault();
                        if (cell.isRevealed) {
                          handleCellClick(rIdx, cIdx, 'chord');
                        }
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (room.gameState === 'won' || room.gameState === 'lost') return;
                      handleCellClick(rIdx, cIdx, 'flag');
                    }}
                    onDoubleClick={() => {
                      handleCellClick(rIdx, cIdx, 'chord');
                    }}
                  >
                    {renderCellContent(cell)}
                  </div>
                );
              })
            )}

            {/* Render Remote User Cursors Overlay */}
            <div className="cursor-container">
              {Object.entries(filteredCursors).map(([id, cursor]) => {
                if (!cursor || cursor.x < 0 || cursor.y < 0) return null;
                return (
                  <div
                    key={id}
                    className="remote-cursor"
                    style={{
                      left: `${cursor.x}px`,
                      top: `${cursor.y}px`,
                      transform: 'translate(-2px, -2px)',
                      '--cursor-color': cursor.color,
                    }}
                  >
                    <svg className="cursor-pointer-svg" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M0 0V15L4.5 10.5L9.5 17.5L12 15.5L7 9L12.5 8L0 0Z"
                        fill={cursor.color}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    </svg>
                    <div className="cursor-label">{cursor.username}</div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
