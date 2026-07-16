import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import MinesweeperBoard from './components/MinesweeperBoard';
import RightPanel from './components/RightPanel';
import { AlertOctagon, HelpCircle } from 'lucide-react';

let socket;

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

  // Save username to local storage
  useEffect(() => {
    localStorage.setItem('ms_username', username);
  }, [username]);

  // Connect socket on mount
  useEffect(() => {
    // In dev: proxies to port 3001. In prod: connects to the same origin serving this page.
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
      setMyPlayerId(socket.id);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setRoom(null);
    });

    socket.on('room_state', (state) => {
      setRoom(state);
      setErrorMsg('');
    });

    socket.on('timer_update', (time) => {
      setRoom(prev => prev ? { ...prev, timer: time } : null);
    });

    socket.on('error_message', (msg) => {
      setErrorMsg(msg);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter a username');
      return;
    }

    const payload = {
      username: username.trim(),
      difficulty,
    };

    if (difficulty === 'custom') {
      payload.width = customWidth;
      payload.height = customHeight;
      payload.minesCount = customMines;
    }

    socket.emit('create_room', payload);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter a username');
      return;
    }
    if (!roomCode.trim()) {
      setErrorMsg('Please enter a room code');
      return;
    }

    socket.emit('join_room', {
      username: username.trim(),
      code: roomCode.trim().toUpperCase(),
    });
  };

  const handleLeaveRoom = () => {
    // Reload page or disconnect/connect to clear state
    window.location.reload();
  };

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
            <p style={{ fontSize: '11px', marginTop: '2px' }}>Multiplayer Online Edition</p>
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
            <span>Network Status: {isConnected ? <span style={{ color: '#008000', fontWeight: 'bold' }}>Connected</span> : <span style={{ color: '#ff0000', fontWeight: 'bold' }}>Connecting...</span>}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><HelpCircle size={12} /> v1.0.0</span>
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
          💣 MS Minesweeper Online
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
          socket={socket} 
          myPlayerId={myPlayerId} 
        />
        
        {/* Control Panel Window */}
        <RightPanel 
          room={room} 
          socket={socket} 
          myPlayerId={myPlayerId} 
        />

      </div>
    </div>
  );
}
