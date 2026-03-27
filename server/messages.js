const express = require('express');
const router = express.Router();
const { query, getRow, getAllRows, run } = require('./database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_this_in_prod';

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

// Add Emoji Reaction
router.post('/:messageId/react', authenticateToken, async (req, res) => {
    const { emoji } = req.body;
    const { messageId } = req.params;
    try {
        await query(
            'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id, emoji) DO NOTHING',
            [messageId, req.user.id, emoji]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});

// Remove Emoji Reaction
router.delete('/:messageId/react', authenticateToken, async (req, res) => {
    const { emoji } = req.body;
    const { messageId } = req.params;
    try {
        await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, req.user.id, emoji]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// Delete Message for All
router.delete('/:messageId/delete-all', authenticateToken, async (req, res) => {
    const { messageId } = req.params;
    try {
        const message = await getRow('SELECT user_id FROM messages WHERE id = $1', [messageId]);
        if (!message || message.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own messages' });
        }
        await query('INSERT INTO deleted_messages (message_id, user_id, deleted_for_all) VALUES ($1, $2, TRUE)', [messageId, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Delete Message for Me
router.delete('/:messageId/delete-me', authenticateToken, async (req, res) => {
    const { messageId } = req.params;
    try {
        await query('INSERT INTO deleted_messages (message_id, user_id, deleted_for_all) VALUES ($1, $2, FALSE)', [messageId, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Edit Message
router.put('/:messageId/edit', authenticateToken, async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;
    try {
        const message = await getRow('SELECT user_id, edit_count, type FROM messages WHERE id = $1', [messageId]);
        if (!message || message.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only edit your own messages' });
        }
        if (message.type !== 'text') {
            return res.status(400).json({ error: 'Only text messages can be edited' });
        }
        if (message.edit_count >= 5) {
            return res.status(400).json({ error: 'Message has been edited 5 times already' });
        }
        await query('UPDATE messages SET content = $1, edit_count = edit_count + 1, edited_at = NOW() WHERE id = $2', [content, messageId]);
        res.json({ success: true, edit_count: message.edit_count + 1 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to edit message' });
    }
});

module.exports = router;
