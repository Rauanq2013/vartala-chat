import React, { useState, useEffect, useRef } from 'react';

const MessageContextMenu = ({ message, position, onClose, onAction, isOwnMessage }) => {
    const menuRef = useRef(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleEmojiClick = (emoji) => {
        onAction('react', emoji);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.y,
                left: position.x,
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                minWidth: '200px',
                overflow: 'hidden'
            }}
            className="animate-scale-in"
        >
            {showEmojiPicker ? (
                <div style={{ padding: '0.5rem' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.5rem',
                        marginBottom: '0.5rem'
                    }}>
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleEmojiClick(emoji)}
                                style={{
                                    fontSize: '1.5rem',
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    borderRadius: 'var(--radius-sm)',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowEmojiPicker(false)}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem' }}
                    >
                        Back
                    </button>
                </div>
            ) : (
                <>
                    <MenuItem
                        icon="😊"
                        label="React with emoji"
                        onClick={() => setShowEmojiPicker(true)}
                    />

                    {isOwnMessage && message.type === 'text' && message.edit_count < 5 && (
                        <MenuItem
                            icon="✏️"
                            label={`Edit${message.edit_count > 0 ? ` (${message.edit_count}/5)` : ''}`}
                            onClick={() => {
                                onAction('edit');
                                onClose();
                            }}
                        />
                    )}

                    {isOwnMessage && (
                        <MenuItem
                            icon="🗑️"
                            label="Delete for everyone"
                            onClick={() => {
                                onAction('delete-all');
                                onClose();
                            }}
                            danger
                        />
                    )}

                    <MenuItem
                        icon="👁️"
                        label="Delete for me"
                        onClick={() => {
                            onAction('delete-me');
                            onClose();
                        }}
                    />
                </>
            )}
        </div>
    );
};

const MenuItem = ({ icon, label, onClick, danger }) => (
    <button
        onClick={onClick}
        style={{
            width: '100%',
            padding: '0.75rem 1rem',
            border: 'none',
            background: 'transparent',
            color: danger ? 'var(--danger)' : 'white',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <span>{label}</span>
    </button>
);

export default MessageContextMenu;
