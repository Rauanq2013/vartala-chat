import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const Signup = ({ setUser }) => {
    const [formData, setFormData] = useState({
        fullName: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        consent: false
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        // Clean username and email: only lowercase
        let val = type === 'checkbox' ? checked : value;
        if (name === 'email') {
            val = value.toLowerCase();
        } else if (name === 'username') {
            val = value.replace(/[^a-zA-Z0-9_]/g, '');
        }
        setFormData(prev => ({
            ...prev,
            [name]: val
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.username.length < 3) {
            setError("Username must be at least 3 characters");
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords don't match");
            return;
        }

        if (formData.password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        if (!formData.consent) {
            setError("You must agree to the Terms of Use");
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/auth/signup', {
                fullName: formData.fullName,
                username: formData.username,
                email: formData.email,
                password: formData.password
            });

            const today = new Date().toDateString();
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            localStorage.setItem('loginDate', today);

            setUser(res.data.user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem 1rem' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Create Account</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Join the Vartala community today</p>
                </div>

                {error && (
                    <div style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                        borderLeft: '4px solid var(--danger)', 
                        padding: '0.75rem 1rem', 
                        marginBottom: '1.5rem', 
                        fontSize: '0.875rem',
                        color: 'var(--danger)',
                        borderRadius: '0.25rem'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Full Name</label>
                        <input
                            type="text"
                            name="fullName"
                            className="input"
                            placeholder="John Doe"
                            value={formData.fullName}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Username</label>
                        <input
                            type="text"
                            name="username"
                            className="input"
                            placeholder="johndoe_24"
                            value={formData.username}
                            onChange={handleChange}
                            required
                        />
                        <small style={{ display: 'block', mt: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Min 3 chars, letters, numbers, underscores</small>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            className="input"
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Password</label>
                            <input
                                type="password"
                                name="password"
                                className="input"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Confirm</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                className="input"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <input
                            type="checkbox"
                            name="consent"
                            id="consent"
                            checked={formData.consent}
                            onChange={handleChange}
                            style={{ width: '1.25rem', height: '1.25rem', marginTop: '0.125rem', cursor: 'pointer' }}
                        />
                        <label htmlFor="consent" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.4', cursor: 'pointer' }}>
                            I agree to the <Link to="/terms" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Terms of Use</Link> and <Link to="/privacy" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Privacy Policy</Link>.
                        </label>
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Creating Account...' : 'Create account'}
                    </button>
                </form>

                <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '600' }}>Log in</Link>
                </div>
            </div>
        </div>
    );
};

export default Signup;
