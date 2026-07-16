import React, { useState, useEffect, useRef } from 'react';
import { Users, Copy, MessageSquare, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function RightPanel({ room, network, myPlayerId }) {
  const [chatMsg, setChatMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef(null);

  const isHost = room.creator === myPlayerId;

  // Auto scroll logs to bottom when room state updates (new chat or actions)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [room.history]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    network.emit('send_chat', chatMsg.trim());
    setChatMsg('');
  };

  const handleApprove = (actionId) => {
    network.emit('approve_action', { actionId });
  };

  const handleReject = (actionId) => {
    network.emit('reject_action', { actionId });
  };

  const handleToggleApproval = () => {
    network.emit('toggle_approval');
  };

  const handleReset = () => {
    network.emit('reset_game');
  };

  return (
    <div className="win95-window win95-outset" style={{ width: '320px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title bar */}
      <div className="win95-titlebar">
        <div className="win95-title-text">
          <span>👥 Multiplayer Command Center</span>
        </div>
        <button className="win95-button win95-title-btn" onClick={handleReset}>🗙</button>
      </div>

      {/* Content panel */}
      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>

        {/* Room Info */}
        <div className="win95-inset" style={{ padding: '8px', backgroundColor: '#e6e6e6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>ROOM CODE:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 'bold', color: '#000080', letterSpacing: '1px' }}>
                {room.id}
              </span>
              <button
                className="win95-button"
                style={{ padding: '2px 4px', minWidth: 'unset' }}
                onClick={copyRoomCode}
                title="Copy Room Code"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
          {copied && (
            <div style={{ fontSize: '10px', color: '#008000', textAlign: 'right', marginTop: '2px' }}>
              Copied code to clipboard!
            </div>
          )}
        </div>

        {/* Players List */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={14} /> PLAYERS ({room.players.length})
          </div>
          <div className="win95-inset" style={{ backgroundColor: '#fff', maxHeight: '100px', overflowY: 'auto', padding: '4px' }}>
            {room.players.map((player) => (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 4px',
                  fontSize: '13px',
                  borderBottom: '1px solid #f0f0f0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: player.color,
                      border: '1px solid #404040'
                    }}
                  />
                  <span style={{ fontWeight: player.id === myPlayerId ? 'bold' : 'normal' }}>
                    {player.username} {player.id === myPlayerId && '(You)'}
                  </span>
                </div>
                {room.creator === player.id && (
                  <span style={{ fontSize: '10px', color: '#808080', border: '1px solid #808080', padding: '0 2px', backgroundColor: '#e6e6e6' }}>
                    HOST
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Settings / Approval Toggle */}
        <div className="win95-inset" style={{ padding: '6px', backgroundColor: '#dfdfdf' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>APPROVAL SYSTEM:</span>
            <button
              className="win95-button"
              onClick={handleToggleApproval}
              style={{ fontSize: '10px', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}
            >
              {room.settings.approvalMode ? (
                <>
                  <ShieldCheck size={12} color="#008000" />
                  <span>ON (Cooperative)</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={12} color="#800000" />
                  <span>OFF (Anarchy)</span>
                </>
              )}
            </button>
          </div>
          <p style={{ fontSize: '10px', color: '#555', marginTop: '4px', lineHeight: '1.2' }}>
            {room.settings.approvalMode
              ? "Left clicks are queued. Another player must approve them before execution."
              : "All player clicks are executed immediately."
            }
          </p>
        </div>

        {/* Pending Approvals */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '120px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
            ⏳ PENDING APPROVALS ({room.pendingActions.length})
          </div>
          <div
            className="win95-inset"
            style={{
              backgroundColor: '#fff',
              flex: 1,
              overflowY: 'auto',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {room.pendingActions.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#808080', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>
                No pending actions.<br/>Click tiles on the board to suggest a move.
              </div>
            ) : (
              room.pendingActions.map((action) => {
                const isMyAction = action.playerId === myPlayerId;
                return (
                  <div
                    key={action.id}
                    className="win95-outset-thin"
                    style={{
                      padding: '4px',
                      backgroundColor: '#e6e6e6',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: action.color }}>
                        {action.username}
                      </span>
                      <span style={{ fontSize: '10px', backgroundColor: '#000080', color: '#fff', padding: '0 3px' }}>
                        Suggests ({action.row + 1}, {action.col + 1})
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '10px', fontStyle: 'italic' }}>
                        {isMyAction ? "Awaiting friend approval..." : "Needs your approval"}
                      </span>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button
                          className="win95-button"
                          style={{ padding: '1px 6px', fontSize: '10px', color: '#008000', fontWeight: 'bold' }}
                          onClick={() => handleApprove(action.id)}
                          disabled={isMyAction}
                        >
                          Approve
                        </button>
                        <button
                          className="win95-button"
                          style={{ padding: '1px 6px', fontSize: '10px', color: '#ff0000', fontWeight: 'bold' }}
                          onClick={() => handleReject(action.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Activity Log & Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '180px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MessageSquare size={14} /> LIVE LOG & CHAT
          </div>

          {/* Logs scrollable container */}
          <div
            className="win95-inset"
            ref={logContainerRef}
            style={{
              backgroundColor: '#000',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: '11px',
              padding: '6px',
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {room.history.map((log) => {
              if (log.type === 'chat') {
                return (
                  <div key={log.id} style={{ color: '#fff' }}>
                    <span style={{ color: '#808080' }}>[{log.timestamp}]</span>{' '}
                    <span style={{ color: log.color, fontWeight: 'bold' }}>{log.username}:</span>{' '}
                    <span>{log.text}</span>
                  </div>
                );
              } else {
                return (
                  <div key={log.id} style={{ color: log.color || '#0f0' }}>
                    <span style={{ color: '#808080' }}>[{log.timestamp}]</span>{' '}
                    <span>{log.text}</span>
                  </div>
                );
              }
            })}
          </div>

          {/* Chat Form input */}
          <form onSubmit={handleSendChat} style={{ display: 'flex', marginTop: '4px', gap: '2px' }}>
            <input
              type="text"
              className="win95-input"
              style={{ flex: 1, fontSize: '12px', padding: '2px 4px' }}
              placeholder="Send message..."
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
            />
            <button type="submit" className="win95-button" style={{ padding: '2px 8px', fontSize: '12px' }}>
              Send
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
