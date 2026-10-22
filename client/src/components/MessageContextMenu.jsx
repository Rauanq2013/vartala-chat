import React, { useState, useEffect, useRef } from 'react';

const MessageContextMenu = ({ message, position, onClose, onAction, isOwnMessage }) => {
    const menuRef = useRef(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const emojis = [
        { emoji: '❤️', label: 'Love' },
        { emoji: '😂', label: 'Haha' },
        { emoji: '😮', label: 'Wow' },
        { emoji: '😢', label: 'Sad' },
        { emoji: '😡', label: 'Angry' },
        { emoji: '👍', label: 'Like' },
        { emoji: '👎', label: 'Dislike' },
        { emoji: '🔥', label: 'Fire' },
    ];

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Smart positioning: keep menu inside viewport
    const menuStyle = {
        position: 'fixed',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 9000,
        minWidth: '210px',
        overflow: 'hidden',
    };

    // Adjust X so it doesn't go off-screen right
    const adjustedX = position.x + 220 > window.innerWidth ? position.x - 220 : position.x;
    const adjustedY = position.y + 300 > window.innerHeight ? position.y - 280 : position.y;

    const handleEmojiClick = (emoji) => {
        onAction('react', emoji);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            style={{ ...menuStyle, top: adjustedY, left: adjustedX }}
            className="animate-scale-in"
        >
            {showEmojiPicker ? (
                <div style={{ padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        React with emoji
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.35rem',
                        marginBottom: '0.75rem'
                    }}>
                        {emojis.map(({ emoji, label }) => (
                            <button
                                key={emoji}
                                onClick={() => handleEmojiClick(emoji)}
                                title={label}
                                style={{
                                    fontSize: '1.6rem',
                                    padding: '0.4rem',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    borderRadius: 'var(--radius-sm)',
                                    transition: 'background 0.15s, transform 0.1s',
                                    lineHeight: 1
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                    e.currentTarget.style.transform = 'scale(1.25)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowEmojiPicker(false)}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }}
                    >
                        ← Back
                    </button>
                </div>
            ) : (
                <>
                    <MenuItem icon="😊" label="React with emoji" onClick={() => setShowEmojiPicker(true)} />
                    <div style={{ height: '1px', backgroundColor: 'var(--bg-tertiary)', margin: '0.25rem 0' }} />
                    <MenuItem icon="↩️" label="Reply" onClick={() => { onAction('reply'); onClose(); }} />
                    <MenuItem icon="↗️" label="Forward" onClick={() => { onAction('forward'); onClose(); }} />
                    <MenuItem icon="📌" label="Pin" onClick={() => { onAction('pin'); onClose(); }} />
                    {isOwnMessage && message.type === 'text' && message.edit_count < 5 && (
                        <MenuItem
                            icon="✏️"
                            label={`Edit${message.edit_count > 0 ? ` (${message.edit_count}/5)` : ''}`}
                            onClick={() => { onAction('edit'); onClose(); }}
                        />
                    )}
                    <div style={{ height: '1px', backgroundColor: 'var(--bg-tertiary)', margin: '0.25rem 0' }} />
                    {isOwnMessage && (
                        <MenuItem icon="🗑️" label="Delete for everyone" onClick={() => { onAction('delete-all'); onClose(); }} danger />
                    )}
                    <MenuItem icon="👁️" label="Delete for me" onClick={() => { onAction('delete-me'); onClose(); }} />
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
            padding: '0.7rem 1rem',
            border: 'none',
            background: 'transparent',
            color: danger ? 'var(--danger)' : 'var(--text-primary)',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
        <span style={{ fontSize: '1.1rem', width: '1.5rem', textAlign: 'center' }}>{icon}</span>
        <span>{label}</span>
    </button>
);

export default MessageContextMenu;
