const { prepare, saveDb } = require('./database');

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
    socket.on('send_message', (data) => {
        // data: { groupId, userId, type, content }
        const { groupId, userId, type, content } = data;

        try {
            // Save to DB
            const result = prepare(`
                INSERT INTO messages (group_id, user_id, type, content, filename, filesize) 
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(groupId, userId, type, content, data.filename || null, data.filesize || null);

            // Get username and full_name for the broadcast
            const user = prepare('SELECT username, full_name, profile_pic FROM users WHERE id = ?').get(userId);

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
                created_at: new Date().toISOString()
            };

            // Broadcast to room
            io.to(`group_${groupId}`).emit('receive_message', messagePayload);
        } catch (err) {
            console.error("Error saving message:", err);
            socket.emit('error', { message: "Failed to send message" });
        }
    });

    // WebRTC Call Signaling
    // Initiate a call (1-on-1 or group)
    socket.on('call:initiate', ({ callId, targetUserId, groupId, isVideo }) => {
        const room = groupId ? `group_${groupId}` : `user_${targetUserId}`;
        socket.join(`call_${callId}`);

        // Save call record to database
        try {
            const result = prepare(`
                INSERT INTO call_history (group_id, caller_id, call_type, started_at, participants)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                groupId || null,
                socket.userId,
                isVideo ? 'video' : 'audio',
                new Date().toISOString(),
                JSON.stringify([socket.userId])
            );

            // Store call history ID in socket for later update
            socket.callHistoryId = result.lastInsertRowid;
        } catch (err) {
            console.error("Error saving call history:", err);
        }

        const callData = {
            callId,
            callerId: socket.userId,
            callerName: socket.username,
            isVideo,
            groupId,
            targetUserId
        };

        if (groupId) {
            // Group call - notify all members in the group
            socket.to(`group_${groupId}`).emit('call:incoming', callData);
        } else {
            // Private call - notify specific user
            io.to(`user_${targetUserId}`).emit('call:incoming', callData);
        }
    });

    // Join an ongoing call
    socket.on('call:join', ({ callId }) => {
        socket.join(`call_${callId}`);
        // Notify others in the call
        socket.to(`call_${callId}`).emit('call:user-joined', {
            userId: socket.userId,
            username: socket.username,
            socketId: socket.id
        });
    });

    // WebRTC Offer
    socket.on('call:offer', ({ callId, targetSocketId, offer }) => {
        io.to(targetSocketId).emit('call:offer', {
            callId,
            offer,
            fromSocketId: socket.id,
            fromUserId: socket.userId,
            fromUsername: socket.username
        });
    });

    // WebRTC Answer
    socket.on('call:answer', ({ callId, targetSocketId, answer }) => {
        io.to(targetSocketId).emit('call:answer', {
            callId,
            answer,
            fromSocketId: socket.id
        });
    });

    // ICE Candidate
    socket.on('call:ice-candidate', ({ callId, targetSocketId, candidate }) => {
        io.to(targetSocketId).emit('call:ice-candidate', {
            callId,
            candidate,
            fromSocketId: socket.id
        });
    });

    // End call
    socket.on('call:end', ({ callId }) => {
        // Update call history with end time and duration
        if (socket.callHistoryId) {
            try {
                const callRecord = prepare('SELECT started_at FROM call_history WHERE id = ?').get(socket.callHistoryId);
                if (callRecord) {
                    const startTime = new Date(callRecord.started_at);
                    const endTime = new Date();
                    const duration = Math.floor((endTime - startTime) / 1000); // Duration in seconds

                    prepare(`
                        UPDATE call_history 
                        SET ended_at = ?, duration = ?
                        WHERE id = ?
                    `).run(endTime.toISOString(), duration, socket.callHistoryId);

                    // Broadcast call history update to group
                    const updatedCall = prepare(`
                        SELECT ch.*, u.username, u.full_name 
                        FROM call_history ch
                        JOIN users u ON ch.caller_id = u.id
                        WHERE ch.id = ?
                    `).get(socket.callHistoryId);

                    if (updatedCall) {
                        const groupId = updatedCall.group_id;
                        if (groupId) {
                            io.to(`group_${groupId}`).emit('call_history_update', {
                                ...updatedCall,
                                type: 'call_history'
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Error updating call history:", err);
            }
        }

        socket.to(`call_${callId}`).emit('call:ended', {
            userId: socket.userId,
            username: socket.username
        });
        socket.leave(`call_${callId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        // Notify any active calls
        const rooms = Array.from(socket.rooms);
        rooms.forEach(room => {
            if (room.startsWith('call_')) {
                socket.to(room).emit('call:user-left', {
                    userId: socket.userId,
                    username: socket.username
                });
            }
        });
    });
};
