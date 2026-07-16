import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from './gameEngine';
import { HostNetwork, ClientNetwork } from './peerNetwork';
import MinesweeperBoard from './components/MinesweeperBoard';
import RightPanel from './components/RightPanel';
import { AlertOctagon, HelpCircle } from 'lucide-react';

export default function App() {
  // Lobby States
  const [username, setUsername] = useState(() => {
    const saved = localStorage.getItem('ms_username');
    if (saved) return saved;
    return `Player_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [roomCode, setRoomCode] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');

  // Custom Difficulty inputs
  const [customWidth, setCustomWidth] = useState('9');
  const [customHeight, setCustomHeight] = useState('9');
  const [customMines, setCustomMines] = useState('10');

  // Connection & Room States
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isHost, setIsHost] = useState(false);

  // Refs that persist across renders
  const engineRef = useRef(null);       // GameEngine (host only)
  const hostNetRef = useRef(null);      // HostNetwork (host only)
  const clientNetRef = useRef(null);    // ClientNetwork (joiner only)

  // Save username to local storage
  useEffect(() => {
    localStorage.setItem('ms_username', username);
  }, [username]);

  // ── Host: broadcast state to all peers ──
  const broadcastState = useCallback(() => {
    if (!engineRef.current || !hostNetRef.current) return;
    const state = engineRef.current.getState();
    setRoom({ ...state }); // Update host's own UI
    hostNetRef.current.broadcast('room_state', state);
  }, []);

  // ── Create a socket-like wrapper for components ──
  // This gives MinesweeperBoard and RightPanel a unified API
  const createNetworkInterface = useCallback((isHostMode) => {
    return {
      emit: (event, data) => {
        if (isHostMode) {
          // Host processes actions locally via game engine
          handleHostAction(event, data);
        } else {
          // Client sends to host
          if (clientNetRef.current) {
            clientNetRef.current.emit(event, data);
          }
        }
      },
      on: (event, callback) => {
        if (!isHostMode && clientNetRef.current) {
          clientNetRef.current.on(event, callback);
        }
      },
      off: (event, callback) => {
        if (!isHostMode && clientNetRef.current) {
          clientNetRef.current.off(event, callback);
        }
      },
    };
  }, []);

  // Process actions on the host's game engine
  const handleHostAction = useCallback((event, data) => {
    const engine = engineRef.current;
    if (!engine) return;
    const hostId = '__host__';

    switch (event) {
      case 'game_action':
        engine.handleAction(hostId, data);
        break;
      case 'approve_action':
        engine.approveAction(hostId, data.actionId);
        break;
      case 'reject_action':
        engine.rejectAction(hostId, data.actionId);
        break;
      case 'toggle_approval':
        engine.toggleApproval(hostId);
        break;
      case 'reset_game':
        engine.resetGame(hostId);
        break;
      case 'change_difficulty':
        engine.changeDifficulty(hostId, data.difficulty, data);
        break;
      case 'send_chat':
        engine.sendChat(hostId, data);
        break;
      case 'cursor_move':
        // Host broadcasts their own cursor to all peers
        if (hostNetRef.current) {
          const player = engine.room.players.find(p => p.id === hostId);
          if (player) {
            hostNetRef.current.broadcast('remote_cursor_move', {
              id: hostId,
              username: player.username,
              color: player.color,
              x: data.x,
              y: data.y,
              cellRow: data.cellRow,
              cellCol: data.cellCol,
            });
          }
        }
        return; // Don't broadcast full state for cursor moves
      default:
        return;
    }

    broadcastState();
  }, [broadcastState]);

  // ── CREATE GAME (Host) ──
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter a username');
      return;
    }

    setErrorMsg('');

    const payload = { username: username.trim(), difficulty };
    if (difficulty === 'custom') {
      payload.width = customWidth;
      payload.height = customHeight;
      payload.minesCount = customMines;
    }

    // 1. Create game engine
    const engine = new GameEngine(
      payload.username,
      payload.difficulty,
      { width: payload.width, height: payload.height, minesCount: payload.minesCount }
    );
    engineRef.current = engine;

    // Timer tick → broadcast to peers
    engine.onTimerTick((time) => {
      setRoom(prev => prev ? { ...prev, timer: time } : null);
      if (hostNetRef.current) {
        hostNetRef.current.broadcast('timer_update', time);
      }
    });

    // 2. Start host network
    const hostNet = new HostNetwork(engine.roomId);
    hostNetRef.current = hostNet;

    try {
      await hostNet.start();
    } catch (err) {
      setErrorMsg('Failed to create room: ' + (err.message || 'Unknown error'));
      engine.destroy();
      engineRef.current = null;
      hostNetRef.current = null;
      return;
    }

    // 3. Handle incoming peer connections
    hostNet.on('peer_connected', ({ peerId }) => {
      // Peer will send a 'join_room' message with their username
    });

    hostNet.on('peer_disconnected', ({ peerId }) => {
      engine.removePlayer(peerId);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    // Handle all events from peers
    hostNet.on('join_room', ({ _peerId, username: peerUsername }) => {
      engine.addPlayer(_peerId, peerUsername || 'Player');
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('game_action', ({ _peerId, ...action }) => {
      engine.handleAction(_peerId, action);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('approve_action', ({ _peerId, actionId }) => {
      engine.approveAction(_peerId, actionId);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('reject_action', ({ _peerId, actionId }) => {
      engine.rejectAction(_peerId, actionId);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('toggle_approval', ({ _peerId }) => {
      engine.toggleApproval(_peerId);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('reset_game', ({ _peerId }) => {
      engine.resetGame(_peerId);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('change_difficulty', ({ _peerId, difficulty: diff, ...opts }) => {
      engine.changeDifficulty(_peerId, diff, opts);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('send_chat', ({ _peerId, message }) => {
      engine.sendChat(_peerId, message);
      const state = engine.getState();
      setRoom({ ...state });
      hostNet.broadcast('room_state', state);
    });

    hostNet.on('cursor_move', ({ _peerId, ...coords }) => {
      const player = engine.room.players.find(p => p.id === _peerId);
      if (player) {
        // Broadcast this peer's cursor to all OTHER peers (and the host UI)
        const cursorData = {
          id: _peerId,
          username: player.username,
          color: player.color,
          x: coords.x,
          y: coords.y,
          cellRow: coords.cellRow,
          cellCol: coords.cellCol,
        };
        // Send to all peers (they'll filter out their own)
        hostNet.broadcast('remote_cursor_move', cursorData);
        // Also update the host's own cursor display
        setRemoteCursorForHost(cursorData);
      }
    });

    // 4. Set state
    setMyPlayerId('__host__');
    setIsHost(true);
    setIsConnected(true);
    setRoom(engine.getState());
  };

  // ── JOIN GAME (Client) ──
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter a username');
      return;
    }
    if (!roomCode.trim()) {
      setErrorMsg('Please enter a room code');
      return;
    }

    setErrorMsg('');

    const code = roomCode.trim().toUpperCase();
    const clientNet = new ClientNetwork();
    clientNetRef.current = clientNet;

    // Listen for state updates from host
    clientNet.on('room_state', (state) => {
      setRoom(state);
      setErrorMsg('');
    });

    clientNet.on('timer_update', (time) => {
      setRoom(prev => prev ? { ...prev, timer: time } : null);
    });

    clientNet.on('error_message', (msg) => {
      setErrorMsg(msg);
    });

    clientNet.on('disconnect', () => {
      setIsConnected(false);
      setRoom(null);
      setErrorMsg('Disconnected from host. The host may have left the game.');
    });

    try {
      const myId = await clientNet.connect(code);
      setMyPlayerId(myId);
      setIsHost(false);
      setIsConnected(true);

      // Send join message to host
      clientNet.emit('join_room', { username: username.trim() });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to connect');
      clientNetRef.current = null;
    }
  };

  const handleLeaveRoom = () => {
    // Clean up connections
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    if (hostNetRef.current) {
      hostNetRef.current.destroy();
      hostNetRef.current = null;
    }
    if (clientNetRef.current) {
      clientNetRef.current.destroy();
      clientNetRef.current = null;
    }
    setRoom(null);
    setIsConnected(false);
    setMyPlayerId(null);
    setIsHost(false);
    setErrorMsg('');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) engineRef.current.destroy();
      if (hostNetRef.current) hostNetRef.current.destroy();
      if (clientNetRef.current) clientNetRef.current.destroy();
    };
  }, []);

  // ── Remote cursor state for host (receives peer cursors via callback) ──
  const [hostRemoteCursors, setHostRemoteCursors] = useState({});
  const setRemoteCursorForHost = useCallback((cursorData) => {
    setHostRemoteCursors(prev => ({
      ...prev,
      [cursorData.id]: cursorData
    }));
  }, []);

  // Create the network interface for components
  const networkInterface = React.useMemo(() => {
    if (!room) return null;

    if (isHost) {
      // Host: actions go directly to game engine
      return {
        emit: (event, data) => {
          handleHostAction(event, data);
        },
        on: () => {},  // Host listens via state
        off: () => {},
        isHost: true,
        hostRemoteCursors, // Pass cursor state for host rendering
      };
    } else {
      // Client: actions go to host via WebRTC
      const client = clientNetRef.current;
      return {
        emit: (event, data) => {
          if (client) {
            // For chat, wrap the message string in an object
            if (event === 'send_chat') {
              client.emit(event, { message: data });
            } else {
              client.emit(event, data);
            }
          }
        },
        on: (event, callback) => {
          if (client) client.on(event, callback);
        },
        off: (event, callback) => {
          if (client) client.off(event, callback);
        },
        isHost: false,
      };
    }
  }, [room, isHost, handleHostAction, hostRemoteCursors]);

  // Render Lobby screen
  if (!room) {
    return (
      <div
        className="win95-window win95-outset"
        style={{
          width: '450px',
          maxWidth: '95%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '4px 4px 20px rgba(0,0,0,0.5)'
        }}
      >
        {/* Title Bar */}
        <div className="win95-titlebar">
          <div className="win95-title-text">
            <span>💣 Microsoft Minesweeper Setup</span>
          </div>
          <button className="win95-button win95-title-btn" disabled>🗙</button>
        </div>

        {/* Setup Banner */}
        <div style={{
          background: 'linear-gradient(90deg, #000080, #80c0ff)',
          color: '#fff',
          padding: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #808080'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'sans-serif' }}>Minesweeper Co-op</h2>
            <p style={{ fontSize: '11px', marginTop: '2px' }}>Peer-to-Peer Edition — No Server Required</p>
          </div>
          <span style={{ fontSize: '28px' }}>💣</span>
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* User Profile */}
          <div className="win95-outset-thin" style={{ padding: '10px', backgroundColor: '#e6e6e6' }}>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#000080' }}>
              1. PLAYER IDENTITY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="username-input" style={{ fontSize: '13px', width: '90px' }}>Username:</label>
              <input
                id="username-input"
                type="text"
                className="win95-input"
                style={{ flex: 1 }}
                value={username}
                onChange={(e) => setUsername(e.target.value.slice(0, 16))}
                maxLength={16}
              />
            </div>
          </div>

          {/* Action Sections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

            {/* Create Room */}
            <form onSubmit={handleCreateRoom} className="win95-outset-thin" style={{ padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#e6e6e6' }}>
              <div>
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#000080' }}>
                  2A. HOST NEW ROOM
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  <label htmlFor="difficulty-select" style={{ fontSize: '12px' }}>Difficulty:</label>
                  <select
                    id="difficulty-select"
                    className="win95-input"
                    style={{ padding: '2px', fontSize: '12px' }}
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="beginner">Beginner (9x9, 10m)</option>
                    <option value="intermediate">Intermediate (16x16, 40m)</option>
                    <option value="expert">Expert (30x16, 99m)</option>
                    <option value="custom">Custom...</option>
                  </select>
                </div>

                {difficulty === 'custom' && (
                  <div className="win95-inset" style={{ padding: '6px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#dfdfdf', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label htmlFor="custom-w">Width:</label>
                      <input id="custom-w" type="number" min="5" max="50" style={{ width: '45px', padding: '0 2px' }} value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label htmlFor="custom-h">Height:</label>
                      <input id="custom-h" type="number" min="5" max="50" style={{ width: '45px', padding: '0 2px' }} value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label htmlFor="custom-m">Mines:</label>
                      <input id="custom-m" type="number" min="1" max="1000" style={{ width: '45px', padding: '0 2px' }} value={customMines} onChange={(e) => setCustomMines(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="win95-button" style={{ width: '100%', marginTop: '6px', fontWeight: 'bold' }}>
                Create Game
              </button>
            </form>

            {/* Join Room */}
            <form onSubmit={handleJoinRoom} className="win95-outset-thin" style={{ padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#e6e6e6' }}>
              <div>
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#000080' }}>
                  2B. JOIN LOBBY
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  <label htmlFor="room-code-input" style={{ fontSize: '12px' }}>Enter Room Code:</label>
                  <input
                    id="room-code-input"
                    type="text"
                    className="win95-input"
                    style={{ fontSize: '14px', textTransform: 'uppercase', textAlign: 'center', fontFamily: 'monospace', letterSpacing: '2px', fontWeight: 'bold' }}
                    placeholder="ABCD"
                    maxLength={4}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="win95-button" style={{ width: '100%', marginTop: '6px', fontWeight: 'bold' }}>
                Join Game
              </button>
            </form>

          </div>

          {/* Connection Status indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555', borderTop: '1px solid #808080', paddingTop: '8px' }}>
            <span>Network: <span style={{ color: '#008080', fontWeight: 'bold' }}>Peer-to-Peer (WebRTC)</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><HelpCircle size={12} /> v2.0.0</span>
          </div>

          {/* Error Message banner */}
          {errorMsg && (
            <div className="win95-outset-thin" style={{ backgroundColor: '#ffffe0', border: '1px solid #e6db55', padding: '6px 10px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: '#8b0000' }}>
              <AlertOctagon size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

        </div>
      </div>
    );
  }

  // Render Game screen
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', maxWidth: '100%' }}>
      {/* Title Header bar */}
      <div
        className="win95-window win95-outset"
        style={{
          width: '100%',
          padding: '2px',
          backgroundColor: '#c0c0c0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '1px 1px 5px rgba(0,0,0,0.3)'
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', paddingLeft: '8px', color: '#000' }}>
          💣 MS Minesweeper Online {isHost ? '(Hosting)' : '(Connected)'}
        </span>
        <button
          className="win95-button"
          onClick={handleLeaveRoom}
          style={{ padding: '2px 8px', fontSize: '11px' }}
        >
          Exit Room
        </button>
      </div>

      {/* Main split dashboard (Board left, Command Center right) */}
      <div className="grid-container">

        {/* Minesweeper Window */}
        <MinesweeperBoard
          room={room}
          network={networkInterface}
          myPlayerId={myPlayerId}
          isHost={isHost}
        />

        {/* Control Panel Window */}
        <RightPanel
          room={room}
          network={networkInterface}
          myPlayerId={myPlayerId}
        />

      </div>
    </div>
  );
}
