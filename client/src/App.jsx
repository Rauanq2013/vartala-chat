import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import ChatWindow from './components/ChatWindow';
import AdminPanel from './components/AdminPanel';
import JoinRequests from './components/JoinRequests';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Check for existing session with daily expiration
        const checkSession = () => {
            const token = localStorage.getItem('token');
            const userStr = localStorage.getItem('user');
            const loginDate = localStorage.getItem('loginDate');

            if (token && userStr && loginDate) {
                const today = new Date().toDateString();

                // Check if login is from today
                if (loginDate === today) {
                    // Session is still valid for today
                    const userData = JSON.parse(userStr);
                    setUser(userData);
                } else {
                    // Session expired (new day), clear storage
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('loginDate');
                }
            }
            setLoading(false);
        };

        checkSession();
    }, []); // Only run once on mount

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('loginDate');
        setUser(null);
        navigate('/login');
    };

    return (
        <div className="app-container">
            {loading ? (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    fontSize: '1.5rem',
                    color: 'var(--text-secondary)'
                }}>
                    <div className="loading-shimmer" style={{
                        width: '200px',
                        height: '40px',
                        borderRadius: 'var(--radius-md)'
                    }}></div>
                </div>
            ) : (
                <>
                    {user && (
                        <header style={{
                            padding: '1rem',
                            backgroundColor: 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--bg-tertiary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h1 style={{ margin: 0, fontSize: '1.25rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Vartala</h1>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <span>{user.full_name || user.username} {user.is_admin === 1 && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--accent-primary)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>Admin</span>}</span>
                                <button onClick={() => navigate('/')} className="btn btn-secondary">Chat</button>
                                <button onClick={() => navigate('/requests')} className="btn btn-secondary">Join Requests</button>
                                {user.is_admin && <button onClick={() => navigate('/admin')} className="btn btn-secondary">Admin Dashboard</button>}
                                <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>Logout</button>
                            </div>
                        </header>
                    )}

                    <main style={{ flex: 1, overflow: 'hidden' }}>
                        <Routes>
                            <Route path="/login" element={!user ? <Login setUser={setUser} /> : <Navigate to="/" />} />
                            <Route path="/signup" element={!user ? <Signup setUser={setUser} /> : <Navigate to="/" />} />
                            <Route path="/" element={user ? <ChatWindow user={user} /> : <Navigate to="/login" />} />
                            <Route path="/requests" element={user ? <JoinRequests user={user} /> : <Navigate to="/login" />} />
                            <Route path="/admin" element={user && user.is_admin ? <AdminPanel /> : <Navigate to="/" />} />
                        </Routes>
                    </main>
                </>
            )}
        </div>
    );
}

export default App;
