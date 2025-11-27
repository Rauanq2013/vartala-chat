const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { prepare } = require('./database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'super_secret_key_change_this_in_prod';

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token provided' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(500).json({ error: 'Failed to authenticate token' });
        req.userId = decoded.id;
        next();
    });
};

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// Update Profile Picture
router.put('/profile-pic', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    try {
        prepare('UPDATE users SET profile_pic = ? WHERE id = ?').run(fileUrl, req.userId);
        res.json({ url: fileUrl });
    } catch (err) {
        console.error("Failed to update profile pic:", err);
        res.status(500).json({ error: 'Failed to update profile picture' });
    }
});

// Get User Profile
router.get('/me', verifyToken, (req, res) => {
    try {
        const user = prepare('SELECT id, username, email, full_name, profile_pic, status, is_admin FROM users WHERE id = ?').get(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update Profile Settings
router.put('/profile-settings', verifyToken, (req, res) => {
    const { status } = req.body;

    try {
        prepare('UPDATE users SET status = ? WHERE id = ?').run(status || null, req.userId);
        res.json({ success: true });
    } catch (err) {
        console.error("Failed to update profile settings:", err);
        res.status(500).json({ error: 'Failed to update profile settings' });
    }
});

module.exports = router;
