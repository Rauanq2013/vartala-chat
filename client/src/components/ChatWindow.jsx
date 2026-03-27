import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import socket from '../socket';
import CallWindow from './CallWindow';
import MessageContextMenu from './MessageContextMenu';
import ReplyPreview from './ReplyPreview';
import ForwardModal from './ForwardModal';

const ChatWindow = ({ user }) => {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [mediaType, setMediaType] = useState(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showJoinGroup, setShowJoinGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [activeCall, setActiveCall] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [replyingToMessage, setReplyingToMessage] = useState(null);
    const [forwardingMessage, setForwardingMessage] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [userStatus, setUserStatus] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showProfilePicUpload, setShowProfilePicUpload] = useState(false);
    const [showPinnedModal, setShowPinnedModal] = useState(false);
    const [pinnedMessages, setPinnedMessages] = useState([]);

    const [showAttachments, setShowAttachments] = useState(false);
    const fileInputRef = useRef(null);
    const profilePicInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const messagesEndRef = useRef(null);
    const videoPreviewRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        fetchGroups();

        const token = localStorage.getItem('token');
        if (token) {
            socket.auth = { token };
            socket.connect();
        }

        // Listen for incoming calls
        socket.on('call:incoming', (callData) => {
            setIncomingCall(callData);
        });

        // Listen for group approval
        socket.on('group_approved', () => {
            fetchGroups();
            alert("Your request to join a group was approved!");
        });

        return () => {
            socket.off('receive_message');
            socket.off('call:incoming');
            socket.off('group_approved');
        };
    }, []);

    useEffect(() => {
        const handleMessage = (message) => {
            if (selectedGroup && message.group_id === selectedGroup.id) {
                setMessages((prev) => [...prev, message]);
                scrollToBottom();
            }
        };

        const handleCallHistory = (callRecord) => {
            if (selectedGroup && callRecord.group_id === selectedGroup.id) {
                setMessages((prev) => {
                    // Check if this call history already exists
                    const exists = prev.some(m =>
                        m.type === 'call_history' && m.id === callRecord.id
                    );
                    if (exists) {
                        return prev;
                    }
                    return [...prev, callRecord];
                });
                scrollToBottom();
            }
        };

        const handleMessageDeleted = ({ messageId }) => {
            setMessages(prev => prev.filter(m => m.id !== messageId));
        };

        const handleMessageEdited = async ({ groupId }) => {
            if (selectedGroup && groupId === selectedGroup.id) {
                // Re-fetch messages to get the updated content
                const res = await api.get(`/groups/${groupId}/messages`);
                setMessages(Array.isArray(res.data) ? res.data : []);
            }
        };

        socket.on('receive_message', handleMessage);
        socket.on('call_history_update', handleCallHistory);
        socket.on('message_deleted', handleMessageDeleted);
        socket.on('message_edited', handleMessageEdited);

        return () => {
            socket.off('receive_message', handleMessage);
            socket.off('call_history_update', handleCallHistory);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('message_edited', handleMessageEdited);
        };
    }, [selectedGroup]);

    useEffect(() => {
        if (mediaType === 'video' && videoPreviewRef.current && streamRef.current) {
            videoPreviewRef.current.srcObject = streamRef.current;
        }
    }, [mediaType, isRecording]);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/groups');
            setGroups(res.data);
        } catch (err) {
            console.error("Failed to fetch groups");
        }
    };

    const fetchPinnedMessages = async () => {
        if (!selectedGroup) return;
        try {
            const res = await api.get(`/features/${selectedGroup.id}/pinned`);
            setPinnedMessages(res.data || []);
            setShowPinnedModal(true);
        } catch (err) {
            console.error("Failed to fetch pinned", err);
            alert("Failed to fetch pinned messages");
        }
    };

    const createGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        try {
            await api.post('/groups', { name: newGroupName });
            setNewGroupName('');
            setShowCreateGroup(false);
            fetchGroups();
        } catch (err) {
            console.error("Failed to create group", err);
            alert("Failed to create group");
        }
    };
    const joinGroup = async (group) => {
        try {
            // First check the request status
            const statusRes = await api.get(`/groups/${group.id}/request-status`);
            const status = statusRes.data.status;

            if (status === 'owner' || status === 'member') {
                // Already owner or member, proceed normally
                setSelectedGroup(group);
                socket.emit('join_group', group.id);

                const res = await api.get(`/groups/${group.id}/messages`);
                setMessages(Array.isArray(res.data) ? res.data : []);
                scrollToBottom();
            } else if (status === 'pending') {
                alert('Your request to join this group is pending approval from the owner.');
            } else if (status === 'rejected') {
                alert('Your request to join this group was rejected.');
            } else {
                // No request yet, create one
                const joinRes = await api.post(`/groups/${group.id}/join`);
                if (joinRes.data.status === 'pending') {
                    alert('Join request sent! Waiting for owner approval.');
                } else if (joinRes.data.status === 'approved' || joinRes.data.status === 'already_member') {
                    // Auto-approved (owner) or already member
                    setSelectedGroup(group);
                    socket.emit('join_group', group.id);

                    const res = await api.get(`/groups/${group.id}/messages`);
                    setMessages(Array.isArray(res.data) ? res.data : []);
                    scrollToBottom();
                }
            }
        } catch (err) {
            console.error("Failed to join group", err);
            alert('Failed to join group');
        }
    };

    const deleteGroup = async (e, groupId) => {
        e.stopPropagation(); // Prevent joining the group when clicking delete
        if (!window.confirm("Are you sure you want to delete this group?")) return;

        try {
            await api.delete(`/groups/${groupId}`);
            setGroups(groups.filter(g => g.id !== groupId));
            if (selectedGroup && selectedGroup.id === groupId) {
                setSelectedGroup(null);
                setMessages([]);
            }
        } catch (err) {
            console.error("Failed to delete group:", err);
            alert("Failed to delete group");
        }
    };

    const handleJoinByCode = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post(`/groups/join/${joinCode}`);
            if (res.data.success) {
                if (res.data.status === 'pending') {
                    alert('Join request sent! Waiting for approval.');
                } else {
                    alert('Joined group successfully!');
                    fetchGroups();
                    if (res.data.group) {
                        // Optionally auto-select, but fetching groups is safer to get full list
                    }
                }
                setShowJoinGroup(false);
                setJoinCode('');
            }
        } catch (err) {
            console.error("Failed to join group:", err);
            alert(err.response?.data?.error || "Failed to join group");
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const sendMessage = (type, content) => {
        if (!selectedGroup) return;
        socket.emit('send_message', {
            groupId: selectedGroup.id,
            userId: user.id,
            type,
            content,
            reply_to_message_id: replyingToMessage ? replyingToMessage.id : null
        });
        setReplyingToMessage(null);
    };

    const startRecording = async (type) => {
        try {
            const constraints = type === 'audio' ? { audio: true } : { video: true, audio: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: type === 'audio' ? 'audio/webm' : 'video/webm' });
                const formData = new FormData();
                formData.append('file', blob, `recording.${type === 'audio' ? 'webm' : 'webm'}`);

                try {
                    const res = await api.post('/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    sendMessage(type, res.data.url);
                } catch (err) {
                    console.error("Upload failed", err);
                }

                stream.getTracks().forEach(track => track.stop());
                if (videoPreviewRef.current) {
                    videoPreviewRef.current.srcObject = null;
                }
                streamRef.current = null;
            };

            mediaRecorder.start();
            setIsRecording(true);
            setMediaType(type);
        } catch (err) {
            console.error("Error accessing media devices", err);
            alert("Could not access microphone/camera");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setMediaType(null);
        }
    };

    const startGroupCall = (isVideo) => {
        const callId = `call_${Date.now()}`;
        setActiveCall({ callId, isVideo, groupId: selectedGroup.id, participants: [] });
        socket.emit('call:initiate', {
            callId,
            groupId: selectedGroup.id,
            isVideo
        });
    };

    const acceptCall = () => {
        const callId = incomingCall.callId;
        setActiveCall({ ...incomingCall, participants: [] });
        socket.emit('call:join', { callId });
        setIncomingCall(null);
    };

    const rejectCall = () => {
        setIncomingCall(null);
    };

    const endCall = () => {
        setActiveCall(null);
    };

    const handleMessageRightClick = (e, message) => {
        e.preventDefault();
        setContextMenu({
            message,
            position: { x: e.clientX, y: e.clientY }
        });
    };

    const handleMessageAction = async (action, data) => {
        const message = contextMenu.message;

        try {
            switch (action) {
                case 'react':
                    await api.post(`/messages/${message.id}/react`, { emoji: data });
                    // Refresh messages to show new reaction
                    const res = await api.get(`/groups/${selectedGroup.id}/messages`);
                    setMessages(Array.isArray(res.data) ? res.data : []);
                    break;

                case 'edit':
                    setEditingMessage(message);
                    setInputText(message.content);
                    break;

                case 'reply':
                    setReplyingToMessage(message);
                    break;

                case 'forward':
                    setForwardingMessage(message);
                    break;

                case 'pin':
                    if (message.is_pinned) {
                        await api.delete(`/features/${selectedGroup.id}/pin/${message.id}`);
                    } else {
                        await api.post(`/features/${selectedGroup.id}/pin/${message.id}`);
                    }
                    const resPin = await api.get(`/groups/${selectedGroup.id}/messages`);
                    setMessages(Array.isArray(resPin.data) ? resPin.data : []);
                    break;

                case 'delete-all':
                    if (confirm('Delete this message for everyone?')) {
                        await api.delete(`/messages/${message.id}/delete-all`);
                        // Remove from local state
                        setMessages(prev => prev.filter(m => m.id !== message.id));
                        // Notify others via socket
                        socket.emit('message_deleted', { messageId: message.id, groupId: selectedGroup.id });
                    }
                    break;

                case 'delete-me':
                    await api.delete(`/messages/${message.id}/delete-me`);
                    // Remove from local state
                    setMessages(prev => prev.filter(m => m.id !== message.id));
                    break;
            }
        } catch (err) {
            console.error('Message action failed:', err);
            alert(err.response?.data?.error || 'Action failed');
        }
    };

    const handleTextSubmit = async (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        if (editingMessage) {
            // Edit message
            try {
                await api.put(`/messages/${editingMessage.id}/edit`, { content: inputText });
                // Refresh messages
                const res = await api.get(`/groups/${selectedGroup.id}/messages`);
                setMessages(Array.isArray(res.data) ? res.data : []);
                setEditingMessage(null);
                setInputText('');
                // Notify others via socket
                socket.emit('message_edited', { messageId: editingMessage.id, groupId: selectedGroup.id });
            } catch (err) {
                alert(err.response?.data?.error || 'Failed to edit message');
            }
        } else {
            // Send new message
            sendMessage('text', inputText);
            setInputText('');
        }
    };

    const cancelEdit = () => {
        setEditingMessage(null);
        setInputText('');
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // Determine type based on mime type
            let type = 'file';
            if (file.type.startsWith('image/')) type = 'image';
            if (file.type.startsWith('video/')) type = 'video';

            // Send message with metadata
            if (!selectedGroup) return;
            socket.emit('send_message', {
                groupId: selectedGroup.id,
                userId: user.id,
                type,
                content: res.data.url,
                filename: res.data.originalName,
                filesize: res.data.size
            });

            setShowAttachments(false);
        } catch (err) {
            console.error("Upload failed", err);
            alert("Failed to upload file");
        }
    };

    const shareLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const locationString = `${latitude},${longitude}`;
                sendMessage('location', locationString);
                setShowAttachments(false);
            },
            (error) => {
                console.error("Error getting location", error);
                alert("Unable to retrieve your location");
            }
        );
    };

    const handleProfilePicUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.put('/users/profile-pic', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // Update local user object (in a real app, use context or global state)
            user.profile_pic = res.data.url;
            alert("Profile picture updated!");
        } catch (err) {
            console.error("Profile pic upload failed", err);
            alert("Failed to update profile picture");
        }
    };

    const handleSaveStatus = async () => {
        try {
            await api.put('/users/profile-settings', { status: userStatus });
            user.status = userStatus;
            setShowStatusModal(false);
            alert("Status updated!");
        } catch (err) {
            console.error("Failed to update status:", err);
            alert(err.response?.data?.error || "Failed to update status");
        }
    };

    const handleSaveEmail = async () => {
        try {
            await api.put('/users/profile-settings', { email: userEmail });
            user.email = userEmail;
            setShowEmailModal(false);
            alert("Email updated!");
        } catch (err) {
            console.error("Failed to update email:", err);
            alert(err.response?.data?.error || "Failed to update email");
        }
    };

    const handleDeleteAccount = async () => {
        if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            try {
                await api.delete('/users/me');
                alert('Account deleted successfully.');
                window.location.reload();
            } catch (err) {
                console.error('Failed to delete account:', err);
                alert('Failed to delete account');
            }
        }
    };

    if (activeCall) {
        return <CallWindow callId={activeCall.callId} isVideo={activeCall.isVideo} onEnd={endCall} participants={activeCall.participants} />;
    }

    return (
        <div style={{ display: 'flex', height: '100vh', gap: '1rem', padding: '1rem', boxSizing: 'border-box' }}>
            {/* Sidebar */}
            <div className="card" style={{ width: '250px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            flexShrink: 0
                        }}
                        onClick={() => setShowProfilePicUpload(true)}
                        title="Change Profile Picture"
                    >
                        {user.profile_pic ? (
                            <img src={user.profile_pic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span style={{ fontWeight: 'bold', color: 'white' }}>{user.full_name ? user.full_name[0].toUpperCase() : user.username[0].toUpperCase()}</span>
                        )}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.full_name || user.username}</div>
                        {user.status && (
                            <div style={{ fontSize: '0.7rem', opacity: 0.7, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                "{user.status}"
                            </div>
                        )}
                        {!user.status && <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Online</div>}
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}
                            title="Settings"
                        >
                            ⚙️
                        </button>
                        {showSettingsDropdown && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '0.5rem',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                boxShadow: 'var(--shadow-lg)',
                                zIndex: 10,
                                minWidth: '200px'
                            }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setUserStatus(user.status || '');
                                        setShowStatusModal(true);
                                        setShowSettingsDropdown(false);
                                    }}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    Add/Update Quote
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setUserEmail(user.email || '');
                                        setShowEmailModal(true);
                                        setShowSettingsDropdown(false);
                                    }}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    Edit Email Address
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowProfilePicUpload(true);
                                        setShowSettingsDropdown(false);
                                    }}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    Update Profile Picture
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => {
                                        handleDeleteAccount();
                                        setShowSettingsDropdown(false);
                                    }}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    Delete Account
                                </button>
                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={profilePicInputRef}
                        style={{ display: 'none' }}
                        onChange={handleProfilePicUpload}
                        accept="image/*"
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>Groups</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => { setShowJoinGroup(!showJoinGroup); setShowCreateGroup(false); }}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1.2rem' }}
                            title="Join by Code"
                        >
                            🔑
                        </button>
                        <button
                            onClick={() => { setShowCreateGroup(!showCreateGroup); setShowJoinGroup(false); }}
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1.2rem' }}
                            title="Create Group"
                        >
                            +
                        </button>
                    </div>
                </div>

                {showCreateGroup && (
                    <form onSubmit={createGroup} style={{ marginBottom: '1rem' }}>
                        <input
                            className="input"
                            placeholder="Group name"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            style={{ marginBottom: '0.5rem' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.4rem' }}>Create</button>
                            <button type="button" onClick={() => { setShowCreateGroup(false); setNewGroupName(''); }} className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem' }}>Cancel</button>
                        </div>
                    </form>
                )}

                {showJoinGroup && (
                    <form onSubmit={handleJoinByCode} style={{ marginBottom: '1rem' }}>
                        <input
                            className="input"
                            placeholder="Invite Code"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                            style={{ marginBottom: '0.5rem' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.4rem' }}>Join</button>
                            <button type="button" onClick={() => { setShowJoinGroup(false); setJoinCode(''); }} className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem' }}>Cancel</button>
                        </div>
                    </form>
                )}

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {groups.map(g => (
                        <div
                            key={g.id}
                            onClick={() => joinGroup(g)}
                            className="animate-fade-in"
                            style={{
                                padding: '0.75rem',
                                cursor: 'pointer',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: selectedGroup?.id === g.id ? 'var(--bg-tertiary)' : 'transparent',
                                marginBottom: '0.5rem',
                                transition: 'all 0.2s ease',
                                transform: selectedGroup?.id === g.id ? 'translateX(5px)' : 'translateX(0)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => {
                                if (selectedGroup?.id !== g.id) {
                                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                    e.currentTarget.style.transform = 'translateX(3px)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (selectedGroup?.id !== g.id) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.transform = 'translateX(0)';
                                }
                            }}
                        >
                            <span style={{ fontWeight: 'bold' }}># {g.name}</span>
                            {(user.is_admin === 1 || user.id === g.created_by) && (
                                <button
                                    onClick={(e) => deleteGroup(e, g.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--danger)',
                                        cursor: 'pointer',
                                        padding: '0.2rem',
                                        fontSize: '1rem',
                                        opacity: 0.7
                                    }}
                                    title="Delete Group"
                                    onMouseEnter={(e) => e.target.style.opacity = '1'}
                                    onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                                >
                                    🗑️
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Chat Area */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {selectedGroup ? (
                    <>
                        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--bg-tertiary)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>#{selectedGroup.name}</h3>
                                {selectedGroup.created_by === user.id && selectedGroup.invite_code && (
                                    <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.2rem', userSelect: 'all', cursor: 'pointer' }} title="Click to copy" onClick={() => { navigator.clipboard.writeText(selectedGroup.invite_code); alert('Code copied!'); }}>
                                        Invite Code: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{selectedGroup.invite_code}</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={fetchPinnedMessages} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} title="Pinned Messages">
                                    📌 Pinned
                                </button>
                                <button onClick={() => startGroupCall(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} title="Audio Call">
                                    🎤 Audio Call
                                </button>
                                <button onClick={() => startGroupCall(true)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} title="Video Call">
                                    📹 Video Call
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {messages.filter(m => m.type === 'message' ? !m.is_deleted : true).map((m, i) => (
                                m.type === 'call_history' ? (
                                    // Render call history
                                    <div key={i} style={{
                                        padding: '0.75rem',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-md)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        opacity: 0.8
                                    }}>
                                        <div style={{ fontSize: '1.5rem' }}>
                                            {m.call_type === 'video' ? '📹' : '🎤'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                {m.call_type === 'video' ? 'Video Call' : 'Audio Call'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                {m.full_name || m.username}
                                                {m.duration ? ` • ${Math.floor(m.duration / 60)}m ${m.duration % 60}s` : ' • Ongoing'}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                                            {new Date(m.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                        </div>
                                    </div>
                                ) : (
                                    // Render message
                                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {m.user_id !== user.id && (
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                backgroundColor: 'var(--bg-tertiary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                                marginTop: '0.5rem'
                                            }}>
                                                {m.profile_pic ? (
                                                    <img src={m.profile_pic} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                                        {(m.full_name || m.username)[0].toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div
                                            className={`message-bubble ${m.user_id === user.id ? 'own' : ''}`}
                                            onContextMenu={(e) => handleMessageRightClick(e, m)}
                                            style={{
                                                alignSelf: 'flex-start',
                                                maxWidth: '70%',
                                                backgroundColor: m.user_id === user.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                padding: '0.75rem',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'white',
                                                cursor: 'context-menu',
                                                marginLeft: m.user_id === user.id ? 'auto' : '0'
                                            }}>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.25rem' }}>
                                                {m.full_name || m.username}
                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
                                                    {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                </span>
                                                {m.is_pinned && (
                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                                                        📌 Pinned
                                                    </span>
                                                )}
                                                {m.edit_count > 0 && (
                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', opacity: 0.6, fontStyle: 'italic' }}>
                                                        (edited)
                                                    </span>
                                                )}
                                            </div>
                                            {m.type === 'text' && <div>{m.content}</div>}
                                            {m.type === 'image' && (
                                                <img
                                                    src={m.content}
                                                    alt={m.filename || 'Image'}
                                                    style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                                    onClick={() => window.open(m.content, '_blank')}
                                                />
                                            )}
                                            {m.type === 'video' && <video controls src={m.content} style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />}
                                            {m.type === 'audio' && <audio controls src={m.content} style={{ maxWidth: '100%' }} />}
                                            {m.type === 'file' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                                                    <span style={{ fontSize: '1.5rem' }}>📄</span>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold' }}>
                                                            {m.filename || 'Document'}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                                            {m.filesize ? `${(m.filesize / 1024).toFixed(1)} KB` : 'File'}
                                                        </div>
                                                    </div>
                                                    <a href={m.content} download target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: '0.25rem 0.5rem' }}>
                                                        ⬇️
                                                    </a>
                                                </div>
                                            )}
                                            {m.type === 'location' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '1.5rem' }}>📍</span>
                                                    <div>
                                                        <div>Shared Location</div>
                                                        <a
                                                            href={`https://www.google.com/maps?q=${m.content}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ color: 'white', textDecoration: 'underline', fontSize: '0.9rem' }}
                                                        >
                                                            Open in Maps
                                                        </a>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Reactions */}
                                            {m.reactions && m.reactions.length > 0 && (
                                                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                    {m.reactions.map((reaction, idx) => (
                                                        <span
                                                            key={idx}
                                                            style={{
                                                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                                                padding: '0.2rem 0.4rem',
                                                                borderRadius: '1rem',
                                                                fontSize: '0.85rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.2rem'
                                                            }}
                                                        >
                                                            {reaction.emoji} {reaction.count}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div>
                            {replyingToMessage && <ReplyPreview message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />}
                            {editingMessage && (
                                <div style={{
                                    padding: '0.5rem',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: '0.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '0.875rem' }}>
                                        ✏️ Editing message ({editingMessage.edit_count + 1}/5)
                                    </span>
                                    <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                                        Cancel
                                    </button>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {!isRecording ? (
                                    <>
                                        <form onSubmit={handleTextSubmit} style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                                            {/* Attachment Menu */}
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => setShowAttachments(!showAttachments)}
                                                    title="Add Attachment"
                                                >
                                                    📎
                                                </button>
                                                {showAttachments && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: '100%',
                                                        left: 0,
                                                        marginBottom: '0.5rem',
                                                        backgroundColor: 'var(--bg-secondary)',
                                                        border: '1px solid var(--bg-tertiary)',
                                                        borderRadius: 'var(--radius-md)',
                                                        padding: '0.5rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem',
                                                        boxShadow: 'var(--shadow-lg)',
                                                        zIndex: 10
                                                    }}>
                                                        <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current.click()} style={{ justifyContent: 'flex-start' }}>
                                                            📄 File / Image
                                                        </button>
                                                        <button type="button" className="btn btn-secondary" onClick={shareLocation} style={{ justifyContent: 'flex-start' }}>
                                                            📍 Location
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                style={{ display: 'none' }}
                                                onChange={handleFileUpload}
                                            />

                                            <input
                                                className="input"
                                                value={inputText}
                                                onChange={(e) => setInputText(e.target.value)}
                                                placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                                            />
                                            <button type="submit" className="btn btn-primary">{editingMessage ? 'Save' : 'Send'}</button>
                                        </form>
                                        <button onClick={() => startRecording('audio')} className="btn btn-secondary" title="Record Audio">🎤</button>
                                        <button onClick={() => startRecording('video')} className="btn btn-secondary" title="Record Video">📹</button>
                                    </>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {mediaType === 'video' && (
                                            <video
                                                ref={videoPreviewRef}
                                                autoPlay
                                                muted
                                                style={{
                                                    width: '100%',
                                                    maxHeight: '300px',
                                                    borderRadius: 'var(--radius-md)',
                                                    backgroundColor: '#000'
                                                }}
                                            />
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--danger)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
                                            <span className="animate-pulse">🔴 Recording {mediaType}...</span>
                                            <button onClick={stopRecording} className="btn" style={{ backgroundColor: 'white', color: 'var(--danger)' }}>Stop & Send</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                        Select a group to start chatting
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <MessageContextMenu
                    message={contextMenu.message}
                    position={contextMenu.position}
                    onClose={() => setContextMenu(null)}
                    onAction={handleMessageAction}
                    isOwnMessage={contextMenu.message.user_id === user.id}
                />
            )}

            {/* Forward Modal */}
            {forwardingMessage && (
                <ForwardModal
                    message={forwardingMessage}
                    onClose={() => setForwardingMessage(null)}
                    groups={groups}
                />
            )}

            {/* Incoming Call Modal */}
            {incomingCall && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div className="card animate-scale-in" style={{ padding: '2rem', textAlign: 'center', maxWidth: '400px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                            {incomingCall.isVideo ? '📹' : '🎤'}
                        </div>
                        <h2 style={{ marginBottom: '0.5rem' }}>{incomingCall.callerName}</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                            Incoming {incomingCall.isVideo ? 'video' : 'audio'} call
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={acceptCall} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                                Accept
                            </button>
                            <button onClick={rejectCall} className="btn btn-danger" style={{ padding: '0.75rem 2rem' }}>
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Picture Upload Modal */}
            {showProfilePicUpload && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div className="card animate-scale-in" style={{ padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Upload Profile Picture</h2>

                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{
                                width: '120px',
                                height: '120px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--accent-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                margin: '0 auto 1.5rem'
                            }}>
                                {user.profile_pic ? (
                                    <img src={user.profile_pic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: '3rem', fontWeight: 'bold', color: 'white' }}>
                                        {user.full_name ? user.full_name[0].toUpperCase() : user.username[0].toUpperCase()}
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={() => profilePicInputRef.current.click()}
                                className="btn btn-primary"
                                style={{ padding: '0.75rem 2rem' }}
                            >
                                Choose Image
                            </button>
                            <input
                                type="file"
                                ref={profilePicInputRef}
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    handleProfilePicUpload(e);
                                    setShowProfilePicUpload(false);
                                }}
                                accept="image/*"
                            />
                        </div>

                        <button
                            onClick={() => setShowProfilePicUpload(false)}
                            className="btn btn-secondary"
                            style={{ padding: '0.75rem 2rem' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {showStatusModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ padding: '2rem', width: '300px' }}>
                        <h3>Update Status Quote</h3>
                        <input className="input" value={userStatus} onChange={e => setUserStatus(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }} placeholder="Enter your status..." />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleSaveStatus} className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                            <button onClick={() => setShowStatusModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showEmailModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ padding: '2rem', width: '300px' }}>
                        <h3>Update Email Address</h3>
                        <input className="input" type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }} placeholder="new.email@example.com" />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleSaveEmail} className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                            <button onClick={() => setShowEmailModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pinned Messages Modal */}
            {showPinnedModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000
                }}>
                    <div className="card animate-scale-in" style={{ padding: '2rem', maxWidth: '500px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>📌 Pinned Messages</h2>
                            <button onClick={() => setShowPinnedModal(false)} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {pinnedMessages.length === 0 ? (
                                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>No pinned messages in this group.</div>
                            ) : (
                                pinnedMessages.map((pm, i) => (
                                    <div key={i} style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', opacity: 0.8, fontSize: '0.8rem' }}>
                                            <span style={{ fontWeight: 'bold' }}>{pm.full_name || pm.username}</span>
                                            <span>{new Date(pm.created_at).toLocaleString()}</span>
                                        </div>
                                        <div>
                                            {pm.type === 'text' && pm.content}
                                            {pm.type === 'image' && <img src={pm.content} alt="Image" style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />}
                                            {pm.type === 'video' && <video src={pm.content} controls style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />}
                                            {pm.type === 'audio' && <audio src={pm.content} controls />}
                                            {pm.type === 'file' && <a href={pm.content} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>{pm.filename || 'View File'}</a>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ChatWindow;
