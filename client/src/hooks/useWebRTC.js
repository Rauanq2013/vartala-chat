import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const useWebRTC = (callId, isInitiator, user) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map());
    const [participants, setParticipants] = useState([]);

    const peerConnections = useRef(new Map());
    const pendingCandidates = useRef(new Map());
    
    const myPeerId = useRef(Math.random().toString(36).substring(2, 9));
    const channelRef = useRef(null);

    const createPeerConnection = useCallback((peerId, username) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        pc.ontrack = (event) => {
            setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(peerId, event.streams[0]);
                return newMap;
            });
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'call:ice-candidate',
                    payload: {
                        targetPeerId: peerId,
                        fromPeerId: myPeerId.current,
                        candidate: event.candidate
                    }
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${username}:`, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                removePeer(peerId);
            }
        };

        peerConnections.current.set(peerId, pc);
        setParticipants(prev => {
            if (prev.some(p => p.socketId === peerId)) return prev;
            return [...prev, { socketId: peerId, username }];
        });

        return pc;
    }, [localStream]);

    const removePeer = useCallback((peerId) => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            pc.close();
            peerConnections.current.delete(peerId);
        }
        setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(peerId);
            return newMap;
        });
        setParticipants(prev => prev.filter(p => p.socketId !== peerId));
        pendingCandidates.current.delete(peerId);
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

    const createOffer = useCallback(async (peerId, username) => {
        const pc = createPeerConnection(peerId, username);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'call:offer',
                payload: {
                    targetPeerId: peerId,
                    fromPeerId: myPeerId.current,
                    fromUsername: user?.username || 'Unknown',
                    offer
                }
            });
        }
    }, [createPeerConnection, user]);

    const handleOffer = useCallback(async ({ offer, fromPeerId, fromUsername }) => {
        const pc = createPeerConnection(fromPeerId, fromUsername);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const candidates = pendingCandidates.current.get(fromPeerId) || [];
        for (const candidate of candidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates.current.delete(fromPeerId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'call:answer',
                payload: {
                    targetPeerId: fromPeerId,
                    fromPeerId: myPeerId.current,
                    answer
                }
            });
        }
    }, [createPeerConnection]);

    const handleAnswer = useCallback(async ({ answer, fromPeerId }) => {
        const pc = peerConnections.current.get(fromPeerId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            const candidates = pendingCandidates.current.get(fromPeerId) || [];
            for (const candidate of candidates) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingCandidates.current.delete(fromPeerId);
        }
    }, []);

    const handleIceCandidate = useCallback(async ({ candidate, fromPeerId }) => {
        const pc = peerConnections.current.get(fromPeerId);
        if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            const candidates = pendingCandidates.current.get(fromPeerId) || [];
            candidates.push(candidate);
            pendingCandidates.current.set(fromPeerId, candidates);
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
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();

        setRemoteStreams(new Map());
        setParticipants([]);
        pendingCandidates.current.clear();

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'call:ended',
                payload: { callId }
            });
        }
    }, [callId, localStream]);

    useEffect(() => {
        if (!localStream) return;

        const channel = supabase.channel(`call-${callId}`);
        channelRef.current = channel;

        channel
            .on('broadcast', { event: 'call:peer_joined' }, (payload) => {
                const { peerId, username } = payload.payload;
                createOffer(peerId, username);
            })
            .on('broadcast', { event: 'call:offer' }, (payload) => {
                const { offer, targetPeerId, fromPeerId, fromUsername } = payload.payload;
                if (targetPeerId === myPeerId.current) {
                    handleOffer({ offer, fromPeerId, fromUsername });
                }
            })
            .on('broadcast', { event: 'call:answer' }, (payload) => {
                const { answer, targetPeerId, fromPeerId } = payload.payload;
                if (targetPeerId === myPeerId.current) {
                    handleAnswer({ answer, fromPeerId });
                }
            })
            .on('broadcast', { event: 'call:ice-candidate' }, (payload) => {
                const { candidate, targetPeerId, fromPeerId } = payload.payload;
                if (targetPeerId === myPeerId.current) {
                    handleIceCandidate({ candidate, fromPeerId });
                }
            })
            .on('broadcast', { event: 'call:user-left' }, (payload) => {
                const { peerId } = payload.payload;
                removePeer(peerId);
            });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                channel.send({
                    type: 'broadcast',
                    event: 'call:peer_joined',
                    payload: {
                        peerId: myPeerId.current,
                        username: user?.username || 'Unknown'
                    }
                });
            }
        });

        return () => {
            if (channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'call:user-left',
                    payload: { peerId: myPeerId.current }
                });
            }
            supabase.removeChannel(channel);
        };
    }, [callId, localStream, createOffer, handleOffer, handleAnswer, handleIceCandidate, removePeer, user]);

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
