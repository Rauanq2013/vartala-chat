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

// Get User's Groups (Joined or Created)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const groups = await getAllRows(`
            SELECT DISTINCT g.*
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            WHERE g.created_by = $1 OR gm.user_id = $2
        `, [req.user.id, req.user.id]);
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// Create Group
router.post('/', authenticateToken, async (req, res) => {
    const { name } = req.body;
    try {
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const result = await run(
            'INSERT INTO groups (name, created_by, invite_code) VALUES ($1, $2, $3) RETURNING id',
            [name, req.user.id, inviteCode]
        );
        await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [result.lastInsertRowid, req.user.id]);
        res.status(201).json({ id: result.lastInsertRowid, name, created_by: req.user.id, invite_code: inviteCode });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Group name already exists' });
    }
});

// Delete Group (Admin or Creator)
router.delete('/:id', authenticateToken, async (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.is_admin;
    try {
        const group = await getRow('SELECT created_by FROM groups WHERE id = $1', [groupId]);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (isAdmin || group.created_by === userId) {
            await query('DELETE FROM groups WHERE id = $1', [groupId]);
            res.json({ success: true });
        } else {
            res.status(403).json({ error: 'Not authorized to delete this group' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// Get Invite Code (Owner Only)
router.get('/:id/invite-code', authenticateToken, async (req, res) => {
    try {
        const group = await getRow('SELECT invite_code, created_by FROM groups WHERE id = $1', [req.params.id]);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (group.created_by !== req.user.id) return res.status(403).json({ error: 'Only owner can view invite code' });
        res.json({ invite_code: group.invite_code });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get invite code' });
    }
});

// Join via Invite Link
router.post('/join/:inviteCode', authenticateToken, async (req, res) => {
    try {
        const { inviteCode } = req.params;
        const userId = req.user.id;

        const group = await getRow('SELECT * FROM groups WHERE invite_code = $1', [inviteCode]);
        if (!group) return res.status(404).json({ error: 'Invalid invite code' });

        const isMember = await getRow('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, userId]);
        if (isMember) return res.json({ success: true, status: 'already_member', group });

        if (group.created_by === userId) {
            await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group.id, userId]);
            return res.json({ success: true, status: 'approved', group });
        }

        const existingRequest = await getRow('SELECT * FROM join_requests WHERE group_id = $1 AND user_id = $2', [group.id, userId]);
        if (existingRequest) {
            if (existingRequest.status === 'rejected') {
                await query('UPDATE join_requests SET status = $1, created_at = NOW() WHERE id = $2', ['pending', existingRequest.id]);
                return res.json({ success: true, status: 'pending', group });
            }
            return res.json({ success: true, status: existingRequest.status, group });
        }

        await query('INSERT INTO join_requests (group_id, user_id, status) VALUES ($1, $2, $3)', [group.id, userId, 'pending']);
        res.json({ success: true, status: 'pending', group });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to join group' });
    }
});

// Request to Join Group (Legacy)
router.post('/:id/join', authenticateToken, async (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.user.id;

        const group = await getRow('SELECT created_by FROM groups WHERE id = $1', [groupId]);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        if (group.created_by === userId) {
            await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, userId]);
            return res.json({ success: true, status: 'approved' });
        }

        const isMember = await getRow('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (isMember) return res.json({ success: true, status: 'already_member' });

        const existingRequest = await getRow('SELECT * FROM join_requests WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (existingRequest) {
            if (existingRequest.status === 'rejected') {
                await query('UPDATE join_requests SET status = $1, created_at = NOW() WHERE id = $2', ['pending', existingRequest.id]);
                return res.json({ success: true, status: 'pending' });
            }
            return res.json({ success: true, status: existingRequest.status });
        }

        await query('INSERT INTO join_requests (group_id, user_id, status) VALUES ($1, $2, $3)', [groupId, userId, 'pending']);
        res.json({ success: true, status: 'pending' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to request join' });
    }
});

// Get Pending Join Requests for Groups Owned by User
router.get('/requests/pending', authenticateToken, async (req, res) => {
    try {
        const requests = await getAllRows(`
            SELECT jr.*, g.name as group_name, u.username, u.full_name, u.email
            FROM join_requests jr
            JOIN groups g ON jr.group_id = g.id
            JOIN users u ON jr.user_id = u.id
            WHERE g.created_by = $1 AND jr.status = 'pending'
            ORDER BY jr.created_at DESC
        `, [req.user.id]);
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Approve Join Request
router.post('/requests/:requestId/approve', authenticateToken, async (req, res) => {
    try {
        const request = await getRow(`
            SELECT jr.*, g.created_by
            FROM join_requests jr
            JOIN groups g ON jr.group_id = g.id
            WHERE jr.id = $1
        `, [req.params.requestId]);

        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (request.created_by !== req.user.id) return res.status(403).json({ error: 'Only group owner can approve requests' });

        await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [request.group_id, request.user_id]);
        await query('UPDATE join_requests SET status = $1 WHERE id = $2', ['approved', req.params.requestId]);

        if (req.io) {
            req.io.to(`user_${request.user_id}`).emit('group_approved', { groupId: request.group_id });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

// Reject Join Request
router.post('/requests/:requestId/reject', authenticateToken, async (req, res) => {
    try {
        const request = await getRow(`
            SELECT jr.*, g.created_by
            FROM join_requests jr
            JOIN groups g ON jr.group_id = g.id
            WHERE jr.id = $1
        `, [req.params.requestId]);

        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (request.created_by !== req.user.id) return res.status(403).json({ error: 'Only group owner can reject requests' });

        await query('UPDATE join_requests SET status = $1 WHERE id = $2', ['rejected', req.params.requestId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

// Get User's Join Request Status for a Group
router.get('/:id/request-status', authenticateToken, async (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.user.id;

        const group = await getRow('SELECT created_by FROM groups WHERE id = $1', [groupId]);
        if (group && group.created_by === userId) return res.json({ status: 'owner' });

        const isMember = await getRow('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (isMember) return res.json({ status: 'member' });

        const request = await getRow('SELECT status FROM join_requests WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (request) return res.json({ status: request.status });

        res.json({ status: 'none' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get request status' });
    }
});

// Get Group Messages
router.get('/:id/messages', authenticateToken, async (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;

    try {
        const messages = await getAllRows(`
            SELECT m.*, u.username, u.full_name, u.profile_pic
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.group_id = $1
            ORDER BY m.created_at ASC
        `, [groupId]);

        const messagesWithMeta = await Promise.all(messages.map(async (msg) => {
            const reactions = await getAllRows(`
                SELECT emoji, COUNT(*) as count
                FROM message_reactions
                WHERE message_id = $1
                GROUP BY emoji
            `, [msg.id]);

            const deleted = await getRow(`
                SELECT deleted_for_all
                FROM deleted_messages
                WHERE message_id = $1 AND (user_id = $2 OR deleted_for_all = TRUE)
                LIMIT 1
            `, [msg.id, userId]);

            const pinned = await getRow('SELECT id FROM pinned_messages WHERE message_id = $1 AND group_id = $2 LIMIT 1', [msg.id, groupId]);

            let replyTo = null;
            if (msg.reply_to_message_id) {
                const repliedMsg = await getRow(`
                    SELECT m.id, m.content, u.username, u.full_name
                    FROM messages m
                    JOIN users u ON m.user_id = u.id
                    WHERE m.id = $1
                `, [msg.reply_to_message_id]);
                if (repliedMsg) {
                    replyTo = { id: repliedMsg.id, content: repliedMsg.content, username: repliedMsg.username, full_name: repliedMsg.full_name };
                }
            }

            return {
                ...msg,
                category: 'message',
                reactions: reactions || [],
                is_deleted: !!deleted,
                deleted_for_all: deleted?.deleted_for_all || false,
                reply_to: replyTo,
                is_pinned: !!pinned
            };
        }));

        const callHistory = await getAllRows(`
            SELECT ch.*, u.username, u.full_name
            FROM call_history ch
            JOIN users u ON ch.caller_id = u.id
            WHERE ch.group_id = $1
            ORDER BY ch.started_at ASC
        `, [groupId]);

        const callHistoryWithType = callHistory.map(call => ({
            ...call,
            category: 'call_history',
            created_at: call.started_at
        }));

        const timeline = [...messagesWithMeta, ...callHistoryWithType].sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
        );

        res.json(timeline);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

module.exports = router;
