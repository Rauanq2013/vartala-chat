import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';

const CallWindow = ({ callId, isVideo, onEnd, participants: initialParticipants }) => {
    const {
        localStream,
        remoteStreams,
        participants,
        startCall,
        createOffer,
        toggleAudio,
        toggleVideo,
        endCall
    } = useWebRTC(callId, true);

    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(isVideo);
    const localVideoRef = useRef(null);

    useEffect(() => {
        // Start the call and get local stream
        startCall(isVideo).then(stream => {
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Create offers to all initial participants
            initialParticipants.forEach(p => {
                createOffer(p.socketId, p.username);
            });
        }).catch(err => {
            alert('Could not access camera/microphone: ' + err.message);
            onEnd();
        });

        return () => {
            endCall();
        };
    }, []);

    useEffect(() => {
        import('../socket').then(({ default: socket }) => {
            const handleEnded = () => {
                onEnd();
            };
            socket.on('call:ended', handleEnded);
            
            // Clean up
            return () => {
                socket.off('call:ended', handleEnded);
            };
        });
    }, [onEnd]);

    const handleToggleAudio = () => {
        const enabled = toggleAudio();
        setIsAudioEnabled(enabled);
    };

    const handleToggleVideo = () => {
        const enabled = toggleVideo();
        setIsVideoEnabled(enabled);
    };

    const handleEndCall = () => {
        endCall();
        onEnd();
    };

    // Limit displayed participants to 6 for performance
    const displayedStreams = Array.from(remoteStreams.entries()).slice(0, 6);
    const gridCols = displayedStreams.length === 1 ? 1 : displayedStreams.length <= 4 ? 2 : 3;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#000',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0 }}>
                    {isVideo ? '📹' : '🎤'} Call - {participants.length + 1} participant{participants.length !== 0 ? 's' : ''}
                </h3>
                {remoteStreams.size > 6 && (
                    <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                        Showing 6 of {remoteStreams.size} participants
                    </span>
                )}
            </div>

            {/* Video Grid */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gap: '0.5rem',
                padding: '0.5rem',
                overflow: 'auto'
            }}>
                {/* Local Video */}
                <div style={{
                    position: 'relative',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    aspectRatio: '16/9'
                }}>
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transform: 'scaleX(-1)' // Mirror local video
                        }}
                    />
                    <div style={{
                        position: 'absolute',
                        bottom: '0.5rem',
                        left: '0.5rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                    }}>
                        You {!isVideoEnabled && '(Video Off)'}
                    </div>
                </div>

                {/* Remote Videos */}
                {displayedStreams.map(([socketId, stream]) => {
                    const participant = participants.find(p => p.socketId === socketId);
                    return (
                        <RemoteVideo
                            key={socketId}
                            stream={stream}
                            username={participant?.username || 'Unknown'}
                        />
                    );
                })}
            </div>

            {/* Controls */}
            <div style={{
                padding: '1.5rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                justifyContent: 'center',
                gap: '1rem'
            }}>
                <button
                    onClick={handleToggleAudio}
                    className="btn"
                    style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        backgroundColor: isAudioEnabled ? 'var(--bg-tertiary)' : 'var(--danger)',
                        fontSize: '1.5rem'
                    }}
                    title={isAudioEnabled ? 'Mute' : 'Unmute'}
                >
                    {isAudioEnabled ? '🎤' : '🔇'}
                </button>

                {isVideo && (
                    <button
                        onClick={handleToggleVideo}
                        className="btn"
                        style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            backgroundColor: isVideoEnabled ? 'var(--bg-tertiary)' : 'var(--danger)',
                            fontSize: '1.5rem'
                        }}
                        title={isVideoEnabled ? 'Turn Off Video' : 'Turn On Video'}
                    >
                        {isVideoEnabled ? '📹' : '📵'}
                    </button>
                )}

                <button
                    onClick={handleEndCall}
                    className="btn btn-danger"
                    style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        fontSize: '1.5rem'
                    }}
                    title="End Call"
                >
                    📞
                </button>
            </div>
        </div>
    );
};

const RemoteVideo = ({ stream, username }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div style={{
            position: 'relative',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            overflow: 'hidden',
            aspectRatio: '16/9'
        }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />
            <div style={{
                position: 'absolute',
                bottom: '0.5rem',
                left: '0.5rem',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.875rem'
            }}>
                {username}
            </div>
        </div>
    );
};

export default CallWindow;
