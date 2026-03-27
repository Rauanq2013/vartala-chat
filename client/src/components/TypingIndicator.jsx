import React from 'react';

const TypingIndicator = ({ typingUsers }) => {
    if (typingUsers.length === 0) return null;

    const names = typingUsers.map(u => u.username).join(', ');

    return (
        <div style={{
            padding: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            fontStyle: 'italic'
        }}>
            {names} {typingUsers.length === 1 ? 'is' : 'are'} typing
            <span className="typing-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
            </span>
        </div>
    );
};

export default TypingIndicator;
