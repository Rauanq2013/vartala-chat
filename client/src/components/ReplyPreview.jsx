import React, { useState } from 'react';
import api from '../api';

const ReplyPreview = ({ message, onCancel }) => {
    if (!message) return null;

    return (
        <div style={{
            backgroundColor: 'var(--bg-tertiary)',
            padding: '0.75rem',
            borderLeft: '3px solid var(--accent-primary)',
            marginBottom: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                    Replying to {message.full_name || message.username}
                </div>
                <div style={{ fontSize: '0.875rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                    {message.content}
                </div>
            </div>
            <button
                onClick={onCancel}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1.2rem'
                }}
            >
                ×
            </button>
        </div>
    );
};

export default ReplyPreview;
