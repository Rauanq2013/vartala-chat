const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, getRow } = require('./database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_this_in_prod';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(500).json({ error: 'Failed to authenticate token' });
        req.userId = decoded.id;
        next();
    });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images are allowed'));
    }
});

// Update Profile Picture
router.put('/profile-pic', verifyToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const serverBase = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
    const fileUrl = `${serverBase}/uploads/${req.file.filename}`;
    try {
        await query('UPDATE users SET profile_pic = $1 WHERE id = $2', [fileUrl, req.userId]);
        res.json({ url: fileUrl });
    } catch (err) {
        console.error('Failed to update profile pic:', err);
        res.status(500).json({ error: 'Failed to update profile picture' });
    }
});

// Get User Profile
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await getRow('SELECT id, username, email, full_name, profile_pic, status, is_admin FROM users WHERE id = $1', [req.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update Profile Settings
router.put('/profile-settings', verifyToken, async (req, res) => {
    const { status, email } = req.body;
    try {
        const existingUser = await getRow('SELECT status, email FROM users WHERE id = $1', [req.userId]);
        if (!existingUser) return res.status(404).json({ error: 'User not found' });

        const newStatus = status !== undefined ? status : existingUser.status;
        const newEmail = email !== undefined ? email : existingUser.email;

        if (newEmail && newEmail !== existingUser.email) {
            const existing = await getRow('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, req.userId]);
            if (existing) return res.status(400).json({ error: 'Email already in use' });
        }

        await query('UPDATE users SET status = $1, email = $2 WHERE id = $3', [newStatus || null, newEmail, req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to update profile settings:', err);
        res.status(500).json({ error: 'Failed to update profile settings' });
    }
});

// Delete Account
router.delete('/me', verifyToken, async (req, res) => {
    try {
        await query('DELETE FROM users WHERE id = $1', [req.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete account:', err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router;
