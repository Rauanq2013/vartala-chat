import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const { data: usersData } = await supabase.from('users').select('*');
            const { data: groupsData } = await supabase.from('groups').select('*');
            setUsers(usersData || []);
            setGroups(groupsData || []);
        } catch (err) {
            console.error('Failed to fetch admin data', err);
        }
    };

    const createGroup = async (e) => {
        e.preventDefault();
        try {
            const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data: session } = await supabase.auth.getSession();
            const { data: currentUser } = await supabase
                .from('users')
                .select('id')
                .eq('auth_id', session.session.user.id)
                .single();

            await supabase.from('groups').insert({
                name: newGroupName,
                created_by: currentUser.id,
                invite_code: inviteCode
            });
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
            await supabase.from('groups').delete().eq('id', id);
            fetchData();
        } catch (err) {
            console.error('Failed to delete group');
        }
    };

    const deleteUser = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await supabase.from('users').delete().eq('id', id);
            fetchData();
        } catch (err) {
            console.error('Failed to delete user', err);
            setMessage('Failed to delete user');
        }
    };

    return (
        <div className="card animate-fade-in" style={{ height: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Admin Dashboard</h2>
            {message && <div style={{ marginBottom: '1rem', color: 'var(--accent-primary)' }}>{message}</div>}

            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
                {/* User Management */}
                <div>
                    <h3 style={{ borderBottom: '1px solid var(--bg-tertiary)', paddingBottom: '0.5rem' }}>Users</h3>
                    <h4 style={{ marginTop: '1.5rem' }}>Existing Users</h4>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {users.map(u => (
                            <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                <span>{u.username} {u.is_admin ? '(Admin)' : ''}</span>
                                {!u.is_admin && (
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
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
