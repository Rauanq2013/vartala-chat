import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const JoinRequests = ({ user }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            // Get groups owned by this user
            const { data: ownedGroups } = await supabase
                .from('groups')
                .select('id')
                .eq('created_by', user.id);

            const groupIds = (ownedGroups || []).map(g => g.id);
            if (groupIds.length === 0) {
                setRequests([]);
                setLoading(false);
                return;
            }

            const { data } = await supabase
                .from('join_requests')
                .select('*, users(username, full_name), groups(name)')
                .in('group_id', groupIds)
                .eq('status', 'pending');

            const formatted = (data || []).map(r => ({
                ...r,
                username: r.users?.username,
                full_name: r.users?.full_name,
                group_name: r.groups?.name
            }));
            setRequests(formatted);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch requests');
            setLoading(false);
        }
    };

    const handleApprove = async (requestId) => {
        try {
            const request = requests.find(r => r.id === requestId);
            await supabase.from('join_requests').update({ status: 'approved' }).eq('id', requestId);
            // Add user to group members
            if (request) {
                await supabase.from('group_members').insert({ group_id: request.group_id, user_id: request.user_id });
            }
            fetchRequests();
        } catch (err) {
            alert('Failed to approve request');
        }
    };

    const handleReject = async (requestId) => {
        try {
            await supabase.from('join_requests').update({ status: 'rejected' }).eq('id', requestId);
            fetchRequests();
        } catch (err) {
            alert('Failed to reject request');
        }
    };

    if (loading) {
        return <div style={{ padding: '1rem' }}>Loading...</div>;
    }

    return (
        <div className="card" style={{ margin: '1rem', padding: '1.5rem' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Pending Join Requests</h2>

            {requests.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                    No pending requests
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {requests.map(req => (
                        <div
                            key={req.id}
                            className="card animate-fade-in"
                            style={{
                                padding: '1rem',
                                backgroundColor: 'var(--bg-tertiary)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                    {req.full_name || req.username}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    wants to join <strong>#{req.group_name}</strong>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {new Date(req.created_at).toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleApprove(req.id)}
                                    className="btn btn-primary"
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => handleReject(req.id)}
                                    className="btn btn-danger"
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default JoinRequests;
