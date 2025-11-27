const express = require('express');
const router = express.Router();
const { prepare } = require('./database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'super_secret_key_change_this_in_prod';

// Middleware (Duplicate from auth.js - in a real app, move to shared middleware file)
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

const isAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get All Groups
router.get('/', authenticateToken, (req, res) => {
    const groups = prepare('SELECT * FROM groups').all();
    res.json(groups);
});

// Create Group (All Users)
router.post('/', authenticateToken, (req, res) => {
    const { name } = req.body;
    try {
        const result = prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run(name, req.user.id);
        res.status(201).json({ id: result.lastInsertRowid, name, created_by: req.user.id });
    } catch (err) {
        res.status(400).json({ error: 'Group name already exists' });
    }
});

// Delete Group (Admin or Creator)
router.delete('/:id', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.is_admin;

    // Check if group exists and get creator
    const group = prepare('SELECT created_by FROM groups WHERE id = ?').get(groupId);
    if (!group) {
        return res.status(404).json({ error: 'Group not found' });
    }

    if (isAdmin || group.created_by === userId) {
        prepare('DELETE FROM groups WHERE id = ?').run(groupId);
        res.json({ success: true });
    } else {
        res.status(403).json({ error: 'Not authorized to delete this group' });
    }
});

// Request to Join Group (Creates join request)
router.post('/:id/join', authenticateToken, (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.user.id;

        // Check if user is the group owner
        const group = prepare('SELECT created_by FROM groups WHERE id = ?').get(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // If user is the owner, auto-approve
        if (group.created_by === userId) {
            prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
            return res.json({ success: true, status: 'approved' });
        }

        // Check if already a member
        const isMember = prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
        if (isMember) {
            return res.json({ success: true, status: 'already_member' });
        }

        // Check if request already exists
        const existingRequest = prepare('SELECT * FROM join_requests WHERE group_id = ? AND user_id = ?').get(groupId, userId);
        if (existingRequest) {
            return res.json({ success: true, status: existingRequest.status });
        }

        // Create join request
        prepare('INSERT INTO join_requests (group_id, user_id, status) VALUES (?, ?, ?)').run(groupId, userId, 'pending');
        res.json({ success: true, status: 'pending' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to request join' });
    }
});

// Get Pending Join Requests for Groups Owned by User
router.get('/requests/pending', authenticateToken, (req, res) => {
    const requests = prepare(`
        SELECT jr.*, g.name as group_name, u.username, u.full_name, u.email
        FROM join_requests jr
        JOIN groups g ON jr.group_id = g.id
        JOIN users u ON jr.user_id = u.id
        WHERE g.created_by = ? AND jr.status = 'pending'
        ORDER BY jr.created_at DESC
    `).all(req.user.id);
    res.json(requests);
});

// Approve Join Request
router.post('/requests/:requestId/approve', authenticateToken, (req, res) => {
    try {
        const request = prepare(`
            SELECT jr.*, g.created_by 
            FROM join_requests jr
            JOIN groups g ON jr.group_id = g.id
            WHERE jr.id = ?
        `).get(req.params.requestId);

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Check if user is the group owner
        if (request.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Only group owner can approve requests' });
        }

        // Add user to group members
        prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(request.group_id, request.user_id);

        // Update request status
        prepare('UPDATE join_requests SET status = ? WHERE id = ?').run('approved', req.params.requestId);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

// Reject Join Request
router.post('/requests/:requestId/reject', authenticateToken, (req, res) => {
    try {
        const request = prepare(`
            SELECT jr.*, g.created_by 
            FROM join_requests jr
            JOIN groups g ON jr.group_id = g.id
            WHERE jr.id = ?
        `).get(req.params.requestId);

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Check if user is the group owner
        if (request.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Only group owner can reject requests' });
        }

        // Update request status
        prepare('UPDATE join_requests SET status = ? WHERE id = ?').run('rejected', req.params.requestId);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

// Get User's Join Request Status for a Group
router.get('/:id/request-status', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Check if owner
    const group = prepare('SELECT created_by FROM groups WHERE id = ?').get(groupId);
    if (group && group.created_by === userId) {
        return res.json({ status: 'owner' });
    }

    // Check if member
    const isMember = prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    if (isMember) {
        return res.json({ status: 'member' });
    }

    // Check for pending/approved/rejected request
    const request = prepare('SELECT status FROM join_requests WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    if (request) {
        return res.json({ status: request.status });
    }

    res.json({ status: 'none' });
});

// Get Group Messages
router.get('/:id/messages', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Get messages
    const messages = prepare(`
        SELECT m.*, u.username, u.full_name, u.profile_pic
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        WHERE m.group_id = ? 
        ORDER BY m.created_at ASC
    `).all(groupId);

    // For each message, get reactions and check if deleted
    const messagesWithMeta = messages.map(msg => {
        // Get reactions
        const reactions = prepare(`
            SELECT emoji, COUNT(*) as count
            FROM message_reactions
            WHERE message_id = ?
            GROUP BY emoji
        `).all(msg.id);

        // Check if deleted for this user or for all
        const deleted = prepare(`
            SELECT deleted_for_all 
            FROM deleted_messages 
            WHERE message_id = ? AND (user_id = ? OR deleted_for_all = 1)
            LIMIT 1
        `).get(msg.id, userId);

        return {
            ...msg,
            type: 'message',
            reactions: reactions || [],
            is_deleted: !!deleted,
            deleted_for_all: deleted?.deleted_for_all || false
        };
    });

    // Get call history
    const callHistory = prepare(`
        SELECT ch.*, u.username, u.full_name
        FROM call_history ch
        JOIN users u ON ch.caller_id = u.id
        WHERE ch.group_id = ?
        ORDER BY ch.started_at ASC
    `).all(groupId);

    const callHistoryWithType = callHistory.map(call => ({
        ...call,
        type: 'call_history',
        created_at: call.started_at
    }));

    // Merge and sort by timestamp
    const timeline = [...messagesWithMeta, ...callHistoryWithType].sort((a, b) => {
        return new Date(a.created_at) - new Date(b.created_at);
    });

    res.json(timeline);
});

module.exports = router;
