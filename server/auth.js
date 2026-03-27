const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, getRow, getAllRows, run } = require('./database');

const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_this_in_prod';

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
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await getRow('SELECT * FROM users WHERE username = $1 OR email = $2', [username, username]);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, email: user.email, profile_pic: user.profile_pic, is_admin: user.is_admin } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Sign Up Route
router.post('/signup', async (req, res) => {
    const { fullName, email, password } = req.body;
    const username = email.split('@')[0];

    try {
        const existingUser = await getRow('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (existingUser) return res.status(400).json({ error: 'Username or email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await run(
            'INSERT INTO users (username, email, full_name, password, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, email, fullName, hashedPassword, 0]
        );

        const token = jwt.sign({ id: result.lastInsertRowid, username, is_admin: 0 }, SECRET_KEY, { expiresIn: '24h' });
        res.status(201).json({
            token,
            user: { id: result.lastInsertRowid, username, full_name: fullName, email, is_admin: 0 }
        });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to create user' });
    }
});

// Create User (Admin Only)
router.post('/users', authenticateToken, isAdmin, async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await run(
            'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id',
            [username, hashedPassword, 0]
        );
        res.status(201).json({ id: result.lastInsertRowid, username });
    } catch (err) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

// Get All Users (Admin Only)
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const users = await getAllRows('SELECT id, username, full_name, is_admin FROM users ORDER BY id');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Delete User (Admin Only)
router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const userId = req.params.id;
    if (userId === req.user.id.toString()) {
        return res.status(400).json({ error: 'Cannot delete your own account here' });
    }
    try {
        await query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Reset User Password (Admin Only)
router.put('/users/:id/reset-password', authenticateToken, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to reset password:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
