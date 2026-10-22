import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

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
    const [emailSent, setEmailSent] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
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
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: formData.email.trim(),
                password: formData.password,
                options: {
                    data: {
                        username: formData.username.trim(),
                        full_name: formData.fullName.trim(),
                    }
                }
            });

            if (signUpError) throw signUpError;

            // If email already exists, Supabase returns an empty identities array
            if (data?.user?.identities && data.user.identities.length === 0) {
                setError('This email is already registered. Please click "Log in" below to sign in.');
                return;
            }

            // If email confirmation is required, Supabase returns user without active session
            if (data?.user && !data.session) {
                setEmailSent(true);
                return;
            }

            // If session is immediately active (e.g., auto-confirm enabled)
            if (data?.user) {
                await new Promise(r => setTimeout(r, 500));

                let { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('auth_id', data.user.id)
                    .single();
                    
                if (!userData) {
                    const { data: insertedUser } = await supabase
                        .from('users')
                        .upsert({
                            auth_id: data.user.id,
                            email: data.user.email,
                            username: formData.username.trim(),
                            full_name: formData.fullName.trim(),
                            is_admin: 0
                        }, { onConflict: 'auth_id' })
                        .select()
                        .single();
                    userData = insertedUser;
                }

                if (userData) {
                    setUser(userData);
                } else {
                    setUser({ id: data.user.id, email: data.user.email, username: formData.username.trim(), full_name: formData.fullName.trim(), is_admin: 0 });
                }
                navigate('/');
            }
        } catch (err) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    if (emailSent) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem 1rem' }}>
                <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', textAlign: 'center' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        fontSize: '2rem'
                    }}>
                        ✉️
                    </div>
                    
                    <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.75rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Check Your Email
                    </h2>
                    
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                        We sent a verification link to <br />
                        <strong style={{ color: 'var(--text-primary)' }}>{formData.email}</strong>
                    </p>

                    <div style={{ 
                        backgroundColor: 'var(--bg-secondary)', 
                        border: '1px solid var(--bg-tertiary)', 
                        borderRadius: 'var(--radius-md)', 
                        padding: '1.25rem', 
                        marginBottom: '1.75rem',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.6'
                    }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Next steps:</div>
                        1. Open the email from <strong>Vartala</strong>.<br />
                        2. Click <strong>Confirm your mail</strong> to complete your sign up.<br />
                        3. Once confirmed, you can close this tab or log in.
                    </div>

                    <Link to="/login" className="btn btn-primary" style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', textDecoration: 'none', display: 'block', boxSizing: 'border-box', marginBottom: '1.25rem' }}>
                        Proceed to Login
                    </Link>

                    <button 
                        type="button"
                        onClick={() => setEmailSent(false)} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}
                    >
                        Entered the wrong email? <span style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Change email</span>
                    </button>
                </div>
            </div>
        );
    }

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
