const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prepare } = require('./database');

const SECRET_KEY = 'super_secret_key_change_this_in_prod';

// Middleware to verify Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware to check Admin
const isAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Login Route
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Allow login with username or email
    const user = prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin } });
});

// Sign Up Route
router.post('/signup', (req, res) => {
    const { fullName, email, password } = req.body;

    // Generate username from email (part before @)
    const username = email.split('@')[0];

    // Check if user already exists
    const existingUser = prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        const result = prepare('INSERT INTO users (username, email, full_name, password, is_admin) VALUES (?, ?, ?, ?, ?)').run(
            username,
            email,
            fullName,
            hashedPassword,
            0
        );

        const token = jwt.sign({ id: result.lastInsertRowid, username, is_admin: 0 }, SECRET_KEY, { expiresIn: '24h' });
        res.status(201).json({
            token,
            user: { id: result.lastInsertRowid, username, is_admin: 0 }
        });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to create user' });
    }
});

// Create User (Admin Only)
router.post('/users', authenticateToken, isAdmin, (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        const result = prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)').run(username, hashedPassword, 0);
        res.status(201).json({ id: result.lastInsertRowid, username });
    } catch (err) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

// Get All Users (Admin Only - for management if needed, or for group adding)
router.get('/users', authenticateToken, (req, res) => {
    const users = prepare('SELECT id, username, is_admin FROM users').all();
    res.json(users);
});

module.exports = router;
