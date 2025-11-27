import React, { useState, useEffect } from 'react';
import api from '../api';

const JoinRequests = ({ user }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const res = await api.get('/groups/requests/pending');
            setRequests(res.data);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch requests');
            setLoading(false);
        }
    };

    const handleApprove = async (requestId) => {
        try {
            await api.post(`/groups/requests/${requestId}/approve`);
            fetchRequests(); // Refresh list
        } catch (err) {
            alert('Failed to approve request');
        }
    };

    const handleReject = async (requestId) => {
        try {
            await api.post(`/groups/requests/${requestId}/reject`);
            fetchRequests(); // Refresh list
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
