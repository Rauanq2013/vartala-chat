import { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../socket';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const useWebRTC = (callId, isInitiator) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map());
    const [participants, setParticipants] = useState([]);

    const peerConnections = useRef(new Map());
    const pendingCandidates = useRef(new Map());

    const createPeerConnection = useCallback((socketId, username) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Add local stream tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle incoming tracks
        pc.ontrack = (event) => {
            setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(socketId, event.streams[0]);
                return newMap;
            });
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('call:ice-candidate', {
                    callId,
                    targetSocketId: socketId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${username}:`, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                removePeer(socketId);
            }
        };

        peerConnections.current.set(socketId, pc);
        setParticipants(prev => [...prev, { socketId, username }]);

        return pc;
    }, [callId, localStream]);

    const removePeer = useCallback((socketId) => {
        const pc = peerConnections.current.get(socketId);
        if (pc) {
            pc.close();
            peerConnections.current.delete(socketId);
        }
        setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(socketId);
            return newMap;
        });
        setParticipants(prev => prev.filter(p => p.socketId !== socketId));
        pendingCandidates.current.delete(socketId);
    }, []);

    const startCall = useCallback(async (isVideo = true) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: isVideo,
                audio: true
            });
            setLocalStream(stream);
            return stream;
        } catch (err) {
            console.error('Error accessing media devices:', err);
            throw err;
        }
    }, []);

    const createOffer = useCallback(async (socketId, username) => {
        const pc = createPeerConnection(socketId, username);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call:offer', {
            callId,
            targetSocketId: socketId,
            offer
        });
    }, [callId, createPeerConnection]);

    const handleOffer = useCallback(async ({ offer, fromSocketId, fromUsername }) => {
        const pc = createPeerConnection(fromSocketId, fromUsername);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Add any pending candidates
        const candidates = pendingCandidates.current.get(fromSocketId) || [];
        for (const candidate of candidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates.current.delete(fromSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('call:answer', {
            callId,
            targetSocketId: fromSocketId,
            answer
        });
    }, [callId, createPeerConnection]);

    const handleAnswer = useCallback(async ({ answer, fromSocketId }) => {
        const pc = peerConnections.current.get(fromSocketId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Add any pending candidates
            const candidates = pendingCandidates.current.get(fromSocketId) || [];
            for (const candidate of candidates) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingCandidates.current.delete(fromSocketId);
        }
    }, []);

    const handleIceCandidate = useCallback(async ({ candidate, fromSocketId }) => {
        const pc = peerConnections.current.get(fromSocketId);
        if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            // Store candidate for later
            const candidates = pendingCandidates.current.get(fromSocketId) || [];
            candidates.push(candidate);
            pendingCandidates.current.set(fromSocketId, candidates);
        }
    }, []);

    const toggleAudio = useCallback(() => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return audioTrack.enabled;
            }
        }
        return false;
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return videoTrack.enabled;
            }
        }
        return false;
    }, [localStream]);

    const endCall = useCallback(() => {
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        // Close all peer connections
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();

        setRemoteStreams(new Map());
        setParticipants([]);
        pendingCandidates.current.clear();

        socket.emit('call:end', { callId });
    }, [callId, localStream]);

    useEffect(() => {
        socket.on('call:offer', handleOffer);
        socket.on('call:answer', handleAnswer);
        socket.on('call:ice-candidate', handleIceCandidate);
        socket.on('call:user-left', ({ userId }) => {
            // Find and remove peer by userId (we'd need to track this mapping)
            // For now, this is a simplified version
        });

        return () => {
            socket.off('call:offer', handleOffer);
            socket.off('call:answer', handleAnswer);
            socket.off('call:ice-candidate', handleIceCandidate);
            socket.off('call:user-left');
        };
    }, [handleOffer, handleAnswer, handleIceCandidate]);

    return {
        localStream,
        remoteStreams,
        participants,
        startCall,
        createOffer,
        toggleAudio,
        toggleVideo,
        endCall
    };
};
