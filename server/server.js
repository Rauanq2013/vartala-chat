require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
    origin: [CLIENT_URL, 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Static files for uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: [CLIENT_URL, 'http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Inject io into req
app.use((req, res, next) => {
    req.io = io;
    next();
});

const authRoutes = require('./auth');
const groupsRoutes = require('./groups');
const uploadRoutes = require('./upload');
const messagesRoutes = require('./messages');
const chatHandler = require('./chat');
const { initDb } = require('./database');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/users', require('./users'));
app.use('/api/features', require('./features'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.io authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_this_in_prod';
            const decoded = jwt.verify(token, SECRET_KEY);
            socket.userId = decoded.id;
            socket.username = decoded.username;
            socket.join(`user_${decoded.id}`);
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    } else {
        next();
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id, socket.username || 'anonymous');
    chatHandler(io, socket);
});

const PORT = process.env.PORT || 3001;

initDb().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
