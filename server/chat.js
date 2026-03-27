const { query, getRow, getAllRows, run } = require('./database');

module.exports = (io, socket) => {
    // Join a group room
    socket.on('join_group', (groupId) => {
        socket.join(`group_${groupId}`);
        console.log(`User ${socket.id} joined group_${groupId}`);
    });

    // Leave a group room
    socket.on('leave_group', (groupId) => {
        socket.leave(`group_${groupId}`);
    });

    // Send Message
    socket.on('send_message', async (data) => {
        const { groupId, userId, type, content } = data;
        try {
            const result = await run(`
                INSERT INTO messages (group_id, user_id, type, content, filename, filesize, reply_to_message_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
            `, [groupId, userId, type, content, data.filename || null, data.filesize || null, data.reply_to_message_id || null]);

            const user = await getRow('SELECT username, full_name, profile_pic FROM users WHERE id = $1', [userId]);

            let replyTo = null;
            if (data.reply_to_message_id) {
                const repliedMsg = await getRow(`
                    SELECT m.id, m.content, u.username, u.full_name
                    FROM messages m JOIN users u ON m.user_id = u.id
                    WHERE m.id = $1
                `, [data.reply_to_message_id]);
                if (repliedMsg) {
                    replyTo = { id: repliedMsg.id, content: repliedMsg.content, username: repliedMsg.username, full_name: repliedMsg.full_name };
                }
            }

            const messagePayload = {
                id: result.lastInsertRowid,
                group_id: groupId,
                user_id: userId,
                username: user.username,
                full_name: user.full_name,
                profile_pic: user.profile_pic,
                type,
                content,
                filename: data.filename || null,
                filesize: data.filesize || null,
                reply_to: replyTo,
                created_at: new Date().toISOString()
            };

            io.to(`group_${groupId}`).emit('receive_message', messagePayload);
        } catch (err) {
            console.error('Error saving message:', err);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle message deletion (broadcast to group)
    socket.on('message_deleted', ({ messageId, groupId }) => {
        socket.to(`group_${groupId}`).emit('message_deleted', { messageId, groupId });
    });

    // Handle message edit (broadcast to group)
    socket.on('message_edited', ({ messageId, groupId }) => {
        socket.to(`group_${groupId}`).emit('message_edited', { messageId, groupId });
    });

    // Typing indicators
    socket.on('typing_start', ({ groupId, userId, username }) => {
        socket.to(`group_${groupId}`).emit('user_typing', { userId, username });
    });

    socket.on('typing_stop', ({ groupId, userId }) => {
        socket.to(`group_${groupId}`).emit('user_stop_typing', { userId });
    });

    // Read receipts
    socket.on('message_read', async ({ messageId, userId, groupId }) => {
        try {
            await query(`
                INSERT INTO message_read_status (message_id, user_id, read_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (message_id, user_id) DO NOTHING
            `, [messageId, userId]);
            socket.to(`group_${groupId}`).emit('message_read_update', { messageId, userId });
        } catch (err) {
            console.error('Error saving read status:', err);
        }
    });

    // Online status
    socket.on('user_online', async ({ userId }) => {
        try {
            await query('UPDATE users SET is_online = TRUE, last_seen_at = NOW() WHERE id = $1', [userId]);
            socket.broadcast.emit('user_status_change', { userId, isOnline: true });
        } catch (err) {
            console.error('Error updating online status:', err);
        }
    });

    socket.on('user_offline', async ({ userId }) => {
        try {
            await query('UPDATE users SET is_online = FALSE, last_seen_at = NOW() WHERE id = $1', [userId]);
            socket.broadcast.emit('user_status_change', { userId, isOnline: false });
        } catch (err) {
            console.error('Error updating offline status:', err);
        }
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            try {
                await query('UPDATE users SET is_online = FALSE, last_seen_at = NOW() WHERE id = $1', [socket.userId]);
                socket.broadcast.emit('user_status_change', { userId: socket.userId, isOnline: false });
            } catch (err) {
                console.error('Error on disconnect:', err);
            }
        }
    });

    // WebRTC Signaling
    socket.on('call:initiate', async ({ callId, groupId, isVideo }) => {
        try {
            const result = await run(`
                INSERT INTO call_history (group_id, caller_id, call_type)
                VALUES ($1, $2, $3) RETURNING id
            `, [groupId, socket.userId, isVideo ? 'video' : 'audio']);

            socket.callHistoryId = result.lastInsertRowid;
            socket.callGroupId = groupId;

            const caller = await getRow('SELECT full_name, username FROM users WHERE id = $1', [socket.userId]);
            socket.to(`group_${groupId}`).emit('call:incoming', {
                callId,
                groupId,
                isVideo,
                callerName: caller?.full_name || caller?.username || 'Unknown',
                callerId: socket.userId
            });
        } catch (err) {
            console.error('Error initiating call:', err);
        }
    });

    socket.on('call:join', ({ callId }) => {
        socket.join(`call_${callId}`);
        socket.to(`call_${callId}`).emit('call:peer_joined', { peerId: socket.id, userId: socket.userId });
    });

    socket.on('call:offer', ({ callId, offer, targetSocketId }) => {
        io.to(targetSocketId).emit('call:offer', { offer, fromSocketId: socket.id });
    });

    socket.on('call:answer', ({ callId, answer, targetSocketId }) => {
        io.to(targetSocketId).emit('call:answer', { answer, fromSocketId: socket.id });
    });

    socket.on('call:ice_candidate', ({ callId, candidate, targetSocketId }) => {
        io.to(targetSocketId).emit('call:ice_candidate', { candidate, fromSocketId: socket.id });
    });

    socket.on('call:end', async ({ callId, groupId }) => {
        try {
            const endedAt = new Date();
            if (socket.callHistoryId) {
                const startResult = await getRow('SELECT started_at FROM call_history WHERE id = $1', [socket.callHistoryId]);
                if (startResult) {
                    const duration = Math.floor((endedAt - new Date(startResult.started_at)) / 1000);
                    await query('UPDATE call_history SET ended_at = NOW(), duration = $1 WHERE id = $2', [duration, socket.callHistoryId]);

                    const callRecord = await getRow(`
                        SELECT ch.*, u.username, u.full_name
                        FROM call_history ch
                        JOIN users u ON ch.caller_id = u.id
                        WHERE ch.id = $1
                    `, [socket.callHistoryId]);

                    if (callRecord) {
                        io.to(`group_${groupId}`).emit('call_history_update', {
                            ...callRecord,
                            type: 'call_history',
                            category: 'call_history',
                            created_at: callRecord.started_at
                        });
                    }
                }
            }
            io.to(`call_${callId}`).emit('call:ended', { callId });
            socket.leave(`call_${callId}`);
        } catch (err) {
            console.error('Error ending call:', err);
        }
    });
};
