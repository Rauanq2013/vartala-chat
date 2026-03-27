const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query, getRow, getAllRows, run } = require('./database');

const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_this_in_prod';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Search messages in a group
router.get('/:id/search', authenticateToken, async (req, res) => {
    const groupId = req.params.id;
    const searchQuery = req.query.q;
    if (!searchQuery) return res.status(400).json({ error: 'Search query required' });
    try {
        const messages = await getAllRows(`
            SELECT m.*, u.username, u.full_name, u.profile_pic
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.group_id = $1 AND m.content ILIKE $2
            ORDER BY m.created_at DESC
            LIMIT 50
        `, [groupId, `%${searchQuery}%`]);
        res.json(messages);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Pin a message
router.post('/:id/pin/:messageId', authenticateToken, async (req, res) => {
    const { id: groupId, messageId } = req.params;
    const userId = req.user.id;
    try {
        const group = await getRow('SELECT created_by FROM groups WHERE id = $1', [groupId]);
        const user = await getRow('SELECT is_admin FROM users WHERE id = $1', [userId]);

        if (group.created_by !== userId && !user.is_admin) {
            return res.status(403).json({ error: 'Only group owner or admin can pin messages' });
        }

        const pinnedCount = await getRow('SELECT COUNT(*) as count FROM pinned_messages WHERE group_id = $1', [groupId]);
        if (parseInt(pinnedCount.count) >= 3) {
            return res.status(400).json({ error: 'Maximum 3 pinned messages allowed' });
        }

        await query('INSERT INTO pinned_messages (group_id, message_id, pinned_by) VALUES ($1, $2, $3)', [groupId, messageId, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Pin error:', err);
        res.status(500).json({ error: 'Failed to pin message' });
    }
});

// Unpin a message
router.delete('/:id/pin/:messageId', authenticateToken, async (req, res) => {
    const { id: groupId, messageId } = req.params;
    const userId = req.user.id;
    try {
        const group = await getRow('SELECT created_by FROM groups WHERE id = $1', [groupId]);
        const user = await getRow('SELECT is_admin FROM users WHERE id = $1', [userId]);

        if (group.created_by !== userId && !user.is_admin) {
            return res.status(403).json({ error: 'Only group owner or admin can unpin messages' });
        }

        await query('DELETE FROM pinned_messages WHERE group_id = $1 AND message_id = $2', [groupId, messageId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Unpin error:', err);
        res.status(500).json({ error: 'Failed to unpin message' });
    }
});

// Get pinned messages
router.get('/:id/pinned', authenticateToken, async (req, res) => {
    const groupId = req.params.id;
    try {
        const pinnedMessages = await getAllRows(`
            SELECT m.*, u.username, u.full_name, u.profile_pic, pm.pinned_at
            FROM pinned_messages pm
            JOIN messages m ON pm.message_id = m.id
            JOIN users u ON m.user_id = u.id
            WHERE pm.group_id = $1
            ORDER BY pm.pinned_at DESC
        `, [groupId]);
        res.json(pinnedMessages);
    } catch (err) {
        console.error('Get pinned error:', err);
        res.status(500).json({ error: 'Failed to get pinned messages' });
    }
});

// Forward a message
router.post('/:id/forward', authenticateToken, async (req, res) => {
    const { messageId, targetGroupIds } = req.body;
    const userId = req.user.id;
    try {
        const originalMessage = await getRow('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (!originalMessage) return res.status(404).json({ error: 'Message not found' });

        const forwardedMessages = [];
        for (const targetGroupId of targetGroupIds) {
            const result = await run(`
                INSERT INTO messages (group_id, user_id, type, content, filename, filesize, forwarded)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id
            `, [targetGroupId, userId, originalMessage.type, originalMessage.content, originalMessage.filename, originalMessage.filesize]);
            forwardedMessages.push({ groupId: targetGroupId, messageId: result.lastInsertRowid });
        }

        res.json({ success: true, forwardedMessages });
    } catch (err) {
        console.error('Forward error:', err);
        res.status(500).json({ error: 'Failed to forward message' });
    }
});

// Get unread count for user
router.get('/unread-counts', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const groups = await getAllRows(`
            SELECT g.id, g.name,
                   (SELECT COUNT(*) FROM messages m
                    LEFT JOIN user_group_settings ugs ON ugs.group_id = g.id AND ugs.user_id = $1
                    WHERE m.group_id = g.id
                    AND (ugs.last_read_message_id IS NULL OR m.id > ugs.last_read_message_id)
                    AND m.user_id != $2) as unread_count
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = $3
        `, [userId, userId, userId]);
        res.json(groups);
    } catch (err) {
        console.error('Unread count error:', err);
        res.status(500).json({ error: 'Failed to get unread counts' });
    }
});

// Update last read message
router.put('/:id/mark-read', authenticateToken, async (req, res) => {
    const groupId = req.params.id;
    const { messageId } = req.body;
    const userId = req.user.id;
    try {
        await query(`
            INSERT INTO user_group_settings (user_id, group_id, last_read_message_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, group_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id
        `, [userId, groupId, messageId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

module.exports = router;
