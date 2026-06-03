/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { Stroke, Message, User, RoomState } from './src/types';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Setup directories
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DATABASE_FILE = path.join(process.cwd(), 'users_db.json');

// Initialize local database with default admin/users storage
interface UserRecord extends User {
  passwordHash: string;
}
let userDatabase: { [email: string]: UserRecord } = {};

if (fs.existsSync(DATABASE_FILE)) {
  try {
    userDatabase = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error loading database, resetting...:', e);
    userDatabase = {};
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(userDatabase, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving user database:', e);
  }
}

// In-memory room state management
const activeRooms: { [roomId: string]: RoomState } = {};

// Helper to secure/hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'SyncSpaceSalt2026').digest('hex');
}

// Configure payload limits for file handling
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Create mock latency or simple health endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Authentication: Register
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: 'All fields (username, email, password) are required.' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (userDatabase[normalizedEmail]) {
    res.status(400).json({ error: 'An account with this email already exists.' });
    return;
  }

  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  userDatabase[normalizedEmail] = {
    id: crypto.randomUUID(),
    username: username.trim(),
    email: normalizedEmail,
    avatarColor,
    passwordHash: hashPassword(password),
  };

  saveDatabase();

  const { passwordHash, ...userResponse } = userDatabase[normalizedEmail];
  res.json({ message: 'User registered successfully!', user: userResponse });
});

// Authentication: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = userDatabase[normalizedEmail];

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const { passwordHash, ...userResponse } = user;
  res.json({ message: 'Authentication successful!', user: userResponse });
});

// Secure REST File Upload Handler (Takes base64 with file description, saves safely)
app.post('/api/upload', (req, res) => {
  const { fileName, fileType, base64Data, senderName } = req.body;
  if (!fileName || !base64Data) {
    res.status(400).json({ error: 'Invalid upload specifications.' });
    return;
  }

  try {
    // Remove base64 metadata headers if present
    const base64Content = base64Data.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Generate secure random file prefix to prevent directory traversal
    const safePrefix = crypto.randomBytes(8).toString('hex');
    const safeFileName = `${safePrefix}_${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
    const filePath = path.join(UPLOADS_DIR, safeFileName);

    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${safeFileName}`;
    res.json({
      message: 'File shared successfully',
      url: relativeUrl,
      fileName: safeFileName,
      originalName: fileName,
      fileSize: buffer.length
    });
  } catch (error) {
    console.error('File storage failed:', error);
    res.status(500).json({ error: 'Internal storage error.' });
  }
});

// Configure Socket.io server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
});

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let currentUser: User | null = null;

  // Real-Time signaling protocols for room joins
  socket.on('join-room', ({ roomId, user }: { roomId: string; user: User }) => {
    if (!roomId || !user) return;
    
    // Safety check on existing connection
    if (currentRoom) {
      socket.leave(currentRoom);
    }

    currentRoom = roomId;
    currentUser = user;
    socket.join(roomId);

    // Fetch or construct room states
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = {
        id: roomId,
        name: `Room ${roomId}`,
        participants: {},
        drawings: [],
        messages: [],
      };
    }

    activeRooms[roomId].participants[socket.id] = user;

    // Send immediate local sync status: current drawings list, message backups, participant rosters
    socket.emit('room-status', {
      participants: activeRooms[roomId].participants,
      messages: activeRooms[roomId].messages,
      drawings: activeRooms[roomId].drawings,
    });

    // Notify all active socket nodes in the room that a new peer has connected
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      user,
    });

    console.log(`Socket ${socket.id} (User: ${user.username}) joined room: ${roomId}`);
  });

  // WebRTC Signaling Relay
  socket.on('send-signal', ({ targetSocketId, signalData }: { targetSocketId: string; signalData: any }) => {
    if (!targetSocketId || !currentUser) return;
    
    // Forward signaling payload directly to target recipient peer socket
    io.to(targetSocketId).emit('signal-received', {
      senderSocketId: socket.id,
      senderUser: currentUser,
      signalData,
    });
  });

  // Chat message channel with room caching
  socket.on('send-message', (msg: Message) => {
    if (!currentRoom || !activeRooms[currentRoom]) return;

    activeRooms[currentRoom].messages.push(msg);
    // Keep history bounded to avoid memory bloating
    if (activeRooms[currentRoom].messages.length > 200) {
      activeRooms[currentRoom].messages.shift();
    }

    io.to(currentRoom).emit('message-received', msg);
  });

  // Collaborative whiteboard synchronous drawing streams
  socket.on('draw-stroke', ({ stroke }: { stroke: Stroke }) => {
    if (!currentRoom || !activeRooms[currentRoom] || !stroke) return;

    activeRooms[currentRoom].drawings.push(stroke);
    
    // Broadcast active brush vectors to all peer devices in the session in real-time
    socket.to(currentRoom).emit('stroke-received', stroke);
  });

  // Collaborative whiteboard clearing
  socket.on('clear-drawings', () => {
    if (!currentRoom || !activeRooms[currentRoom]) return;

    activeRooms[currentRoom].drawings = [];
    io.to(currentRoom).emit('drawings-cleared');
  });

  // Media connection tracks updates (Mute toggles, Webcam toggles)
  socket.on('toggle-media', ({ streamId, type, enabled }: { streamId: string; type: 'audio' | 'video'; enabled: boolean }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('media-toggled', {
      socketId: socket.id,
      type,
      enabled,
    });
  });

  // Handle client socket disconnects cleanly
  socket.on('disconnect', () => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      
      // Clean up participant from state
      delete room.participants[socket.id];

      // Notify other peers in the room instantly so they tear down the respective RTCPeerConnection
      io.to(currentRoom).emit('user-left', {
        socketId: socket.id,
        user: currentUser,
      });

      console.log(`Socket ${socket.id} left room ${currentRoom}`);

      // Optional: purge room state if completely vacant
      if (Object.keys(room.participants).length === 0) {
        delete activeRooms[currentRoom];
        console.log(`Room ${currentRoom} is empty and deleted.`);
      }
    }
  });
});

// Configure Vite middleware in development or direct static distribution routing
async function initFullStackServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development server linked successfully as middleware.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static distribution pipeline active.');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RTC Full-Stack server is actively bound to http://0.0.0.0:${PORT}`);
  });
}

initFullStackServer();
