const express = require('express');
const router = express.Router();
const { prepare } = require('./database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'super_secret_key_change_this_in_prod';

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
router.post('/:messageId/react', authenticateToken, (req, res) => {
    const { emoji } = req.body;
    const { messageId } = req.params;

    try {
        prepare('INSERT OR REPLACE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(
            messageId,
            req.user.id,
            emoji
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});

// Remove Emoji Reaction
router.delete('/:messageId/react', authenticateToken, (req, res) => {
    const { emoji } = req.body;
    const { messageId } = req.params;

    try {
        prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(
            messageId,
            req.user.id,
            emoji
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// Get Reactions for a Message
router.get('/:messageId/reactions', authenticateToken, (req, res) => {
    const { messageId } = req.params;

    try {
        const reactions = prepare(`
            SELECT emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
            FROM message_reactions mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.message_id = ?
            GROUP BY emoji
        `).all(messageId);

        res.json(reactions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get reactions' });
    }
});

// Delete Message for All
router.delete('/:messageId/delete-all', authenticateToken, (req, res) => {
    const { messageId } = req.params;

    try {
        // Check if user owns the message
        const message = prepare('SELECT user_id FROM messages WHERE id = ?').get(messageId);
        if (!message || message.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own messages' });
        }

        // Mark as deleted for all
        prepare('INSERT INTO deleted_messages (message_id, user_id, deleted_for_all) VALUES (?, ?, 1)').run(
            messageId,
            req.user.id
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Delete Message for Me
router.delete('/:messageId/delete-me', authenticateToken, (req, res) => {
    const { messageId } = req.params;

    try {
        prepare('INSERT INTO deleted_messages (message_id, user_id, deleted_for_all) VALUES (?, ?, 0)').run(
            messageId,
            req.user.id
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Edit Message
router.put('/:messageId/edit', authenticateToken, (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;

    try {
        // Check if user owns the message
        const message = prepare('SELECT user_id, edit_count, type FROM messages WHERE id = ?').get(messageId);
        if (!message || message.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only edit your own messages' });
        }

        // Only text messages can be edited
        if (message.type !== 'text') {
            return res.status(400).json({ error: 'Only text messages can be edited' });
        }

        // Check edit limit
        if (message.edit_count >= 5) {
            return res.status(400).json({ error: 'Message has been edited 5 times already' });
        }

        // Update message
        prepare('UPDATE messages SET content = ?, edit_count = edit_count + 1, edited_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            content,
            messageId
        );

        res.json({ success: true, edit_count: message.edit_count + 1 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to edit message' });
    }
});

module.exports = router;
