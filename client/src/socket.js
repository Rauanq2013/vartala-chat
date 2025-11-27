import { io } from 'socket.io-client';

// Auto-connects to the same host/port as the page served from (due to proxy)
// or explicitly set URL if needed.
const socket = io(import.meta.env.VITE_API_URL || '/', {
    autoConnect: false
});

export default socket;
