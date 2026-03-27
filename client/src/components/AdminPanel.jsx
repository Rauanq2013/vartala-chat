import React, { useState, useEffect } from 'react';
import api from '../api';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const usersRes = await api.get('/auth/users');
            const groupsRes = await api.get('/groups');
            setUsers(usersRes.data);
            setGroups(groupsRes.data);
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        }
    };

    const createUser = async (e) => {
        e.preventDefault();
        try {
            await api.post('/auth/users', { username: newUsername, password: newPassword });
            setMessage('User created successfully');
            setNewUsername('');
            setNewPassword('');
            fetchData();
        } catch (err) {
            setMessage('Failed to create user');
        }
    };

    const createGroup = async (e) => {
        e.preventDefault();
        try {
            await api.post('/groups', { name: newGroupName });
            setMessage('Group created successfully');
            setNewGroupName('');
            fetchData();
        } catch (err) {
            setMessage('Failed to create group');
        }
    };

    const deleteGroup = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await api.delete(`/groups/${id}`);
            fetchData();
        } catch (err) {
            console.error("Failed to delete group");
        }
    };

    const deleteUser = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.delete(`/auth/users/${id}`);
            fetchData();
        } catch (err) {
            console.error("Failed to delete user", err);
            setMessage(err.response?.data?.error || 'Failed to delete user');
        }
    };

    const resetPassword = async (id, username) => {
        const newPassword = window.prompt(`Enter a new password for "${username}" (min 6 characters):`);
        if (!newPassword) return;
        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters.');
            return;
        }
        try {
            await api.put(`/auth/users/${id}/reset-password`, { newPassword });
            setMessage(`Password for "${username}" has been reset successfully.`);
        } catch (err) {
            console.error('Failed to reset password', err);
            setMessage(err.response?.data?.error || 'Failed to reset password');
        }
    };

    return (
        <div className="card animate-fade-in" style={{ height: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Admin Dashboard</h2>
            {message && <div style={{ marginBottom: '1rem', color: 'var(--accent-primary)' }}>{message}</div>}

            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
                {/* User Management */}
                <div>
                    <h3 style={{ borderBottom: '1px solid var(--bg-tertiary)', paddingBottom: '0.5rem' }}>Create User</h3>
                    <form onSubmit={createUser} style={{ marginTop: '1rem' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <input
                                placeholder="Username"
                                className="input"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                            />
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <input
                                placeholder="Password"
                                type="password"
                                className="input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">Create User</button>
                    </form>

                    <h4 style={{ marginTop: '1.5rem' }}>Existing Users</h4>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {users.map(u => (
                            <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                <span>{u.username} {u.is_admin ? '(Admin)' : ''}</span>
                                {!u.is_admin && (
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button onClick={() => resetPassword(u.id, u.username)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Reset Password</button>
                                        <button onClick={() => deleteUser(u.id)} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Delete</button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Group Management */}
                <div>
                    <h3 style={{ borderBottom: '1px solid var(--bg-tertiary)', paddingBottom: '0.5rem' }}>Manage Groups</h3>
                    <form onSubmit={createGroup} style={{ marginTop: '1rem' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <input
                                placeholder="Group Name"
                                className="input"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">Create Group</button>
                    </form>

                    <h4 style={{ marginTop: '1.5rem' }}>Existing Groups</h4>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {groups.map(g => (
                            <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                <span>{g.name}</span>
                                <button onClick={() => deleteGroup(g.id)} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Delete</button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
