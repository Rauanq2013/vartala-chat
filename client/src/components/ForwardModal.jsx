import React, { useState } from 'react';
import api from '../api';

const ForwardModal = ({ message, onClose, groups }) => {
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [loading, setLoading] = useState(false);

    const toggleGroup = (groupId) => {
        setSelectedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    const handleForward = async () => {
        if (selectedGroups.length === 0) {
            alert('Please select at least one group');
            return;
        }

        setLoading(true);
        try {
            await api.post(`/features/${message.group_id}/forward`, {
                messageId: message.id,
                targetGroupIds: selectedGroups
            });
            alert(`Message forwarded to ${selectedGroups.length} group(s)`);
            onClose();
        } catch (err) {
            console.error('Forward error:', err);
            alert('Failed to forward message');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                maxWidth: '400px',
                width: '90%',
                maxHeight: '80vh',
                overflow: 'auto'
            }}>
                <h3 style={{ marginBottom: '1rem' }}>Forward Message</h3>

                <div style={{ marginBottom: '1rem', maxHeight: '300px', overflow: 'auto' }}>
                    {groups.map(group => (
                        <label key={group.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '0.5rem',
                            backgroundColor: selectedGroups.includes(group.id) ? 'var(--accent-primary)' : 'var(--bg-tertiary)'
                        }}>
                            <input
                                type="checkbox"
                                checked={selectedGroups.includes(group.id)}
                                onChange={() => toggleGroup(group.id)}
                                style={{ marginRight: '0.75rem' }}
                            />
                            <span>{group.name}</span>
                        </label>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={handleForward}
                        disabled={loading || selectedGroups.length === 0}
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                    >
                        {loading ? 'Forwarding...' : `Forward to ${selectedGroups.length} group(s)`}
                    </button>
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForwardModal;
