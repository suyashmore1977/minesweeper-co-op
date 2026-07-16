// ============================================================
// PeerJS WebRTC Networking Layer
// Drop-in replacement for Socket.io with same event API
// ============================================================
import Peer from 'peerjs';

// Prefix for PeerJS IDs to avoid collisions on the public signaling server
const PEER_PREFIX = 'minesweeper-coop-';

// ── Host Network ───────────────────────────────────────────
// Created by the player who clicks "Create Game".
// Their browser becomes the game server.
// ────────────────────────────────────────────────────────────

export class HostNetwork {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.peerId = PEER_PREFIX + roomCode;
    this.peer = null;
    this.connections = new Map(); // peerId -> DataConnection
    this._listeners = {};        // event -> [callback]
    this._ready = false;
    this._onReady = null;
    this._onError = null;
  }

  // Start listening for connections
  start() {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(this.peerId, {
        debug: 0,
      });

      this.peer.on('open', (id) => {
        this._ready = true;
        if (this._onReady) this._onReady();
        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('[Host] PeerJS error:', err);
        // If ID is taken, the room code is already in use
        if (err.type === 'unavailable-id') {
          if (this._onError) this._onError('Room code already in use. Try again.');
          reject(new Error('Room code already in use'));
        } else {
          if (this._onError) this._onError(err.message || 'Connection error');
          reject(err);
        }
      });

      // Handle incoming peer connections
      this.peer.on('connection', (conn) => {
        this._setupConnection(conn);
      });

      this.peer.on('disconnected', () => {
        // Try to reconnect to signaling server
        if (!this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    });
  }

  _setupConnection(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this._emit('peer_connected', { peerId: conn.peer, conn });
    });

    conn.on('data', (data) => {
      // All incoming messages have { event, payload }
      if (data && data.event) {
        this._emit(data.event, { ...data.payload, _peerId: conn.peer });
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this._emit('peer_disconnected', { peerId: conn.peer });
    });

    conn.on('error', (err) => {
      console.error('[Host] Connection error from', conn.peer, err);
      this.connections.delete(conn.peer);
      this._emit('peer_disconnected', { peerId: conn.peer });
    });
  }

  // Send to a specific peer
  sendTo(peerId, event, payload) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send({ event, payload });
    }
  }

  // Broadcast to ALL connected peers
  broadcast(event, payload) {
    const message = { event, payload };
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  // Internal event emitter
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data));
    }
  }

  getConnectedPeerIds() {
    return Array.from(this.connections.keys());
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections.clear();
    this._listeners = {};
    this._ready = false;
  }
}

// ── Client Network ─────────────────────────────────────────
// Created by players who click "Join Game".
// Connects to the host's peer ID via WebRTC.
// Provides socket-like emit/on interface.
// ────────────────────────────────────────────────────────────

export class ClientNetwork {
  constructor() {
    this.peer = null;
    this.conn = null;         // DataConnection to host
    this._listeners = {};
    this._ready = false;
  }

  // Connect to a host's room code
  connect(roomCode) {
    return new Promise((resolve, reject) => {
      const hostPeerId = PEER_PREFIX + roomCode;
      
      // Generate a unique peer ID for this client
      this.peer = new Peer(undefined, {
        debug: 0,
      });

      this.peer.on('open', (myId) => {
        // Now connect to the host
        this.conn = this.peer.connect(hostPeerId, {
          reliable: true,
        });

        this.conn.on('open', () => {
          this._ready = true;
          this._emitLocal('connect', { id: myId });
          resolve(myId);
        });

        this.conn.on('data', (data) => {
          if (data && data.event) {
            this._emitLocal(data.event, data.payload);
          }
        });

        this.conn.on('close', () => {
          this._ready = false;
          this._emitLocal('disconnect', {});
        });

        this.conn.on('error', (err) => {
          console.error('[Client] Connection error:', err);
          this._ready = false;
          this._emitLocal('disconnect', {});
        });
      });

      this.peer.on('error', (err) => {
        console.error('[Client] PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
          this._emitLocal('error_message', 'Room not found. Check the code!');
          reject(new Error('Room not found'));
        } else {
          this._emitLocal('error_message', err.message || 'Connection error');
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        if (!this.peer.destroyed) {
          this.peer.reconnect();
        }
      });

      // Timeout if connection doesn't happen within 10 seconds
      setTimeout(() => {
        if (!this._ready) {
          reject(new Error('Connection timed out'));
          this._emitLocal('error_message', 'Connection timed out. Check the room code.');
        }
      }, 10000);
    });
  }

  // Send a message to the host (like socket.emit)
  emit(event, payload) {
    if (this.conn && this.conn.open) {
      this.conn.send({ event, payload });
    }
  }

  // Listen for events from the host (like socket.on)
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  _emitLocal(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data));
    }
  }

  get isConnected() {
    return this._ready && this.conn && this.conn.open;
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.conn = null;
    this._listeners = {};
    this._ready = false;
  }
}
