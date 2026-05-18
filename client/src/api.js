import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle expired tokens globally
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Prevent redirect loop if already on login or signup
            if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('loginDate');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
