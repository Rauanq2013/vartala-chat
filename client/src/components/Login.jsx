import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const Login = ({ setUser }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const trimmedInput = username.trim();
            let loginEmail = trimmedInput;

            // If input does not look like an email, find their email from public.users table
            if (!loginEmail.includes('@')) {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('email')
                    .ilike('username', trimmedInput)
                    .single();

                if (!userError && userData?.email) {
                    loginEmail = userData.email;
                } else {
                    throw new Error('No account found with this username. Please use your email or check the username.');
                }
            }

            let { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password: password,
            });

            if (signInError) {
                if (signInError.message.toLowerCase().includes('email not confirmed')) {
                    throw new Error('Please confirm your email before logging in. Check your inbox or spam folder for the confirmation link.');
                }
                throw signInError;
            }

            // Fetch public profile or create it if missing
            let { data: profileData } = await supabase
                .from('users')
                .select('*')
                .eq('auth_id', data.user.id)
                .single();

            if (!profileData) {
                const metaUsername = data.user.user_metadata?.username || loginEmail.split('@')[0];
                const metaFullName = data.user.user_metadata?.full_name || '';
                const { data: insertedProfile } = await supabase
                    .from('users')
                    .upsert({
                        auth_id: data.user.id,
                        email: data.user.email,
                        username: metaUsername,
                        full_name: metaFullName,
                        is_admin: 0
                    }, { onConflict: 'auth_id' })
                    .select()
                    .single();

                profileData = insertedProfile;
            }

            if (profileData) {
                setUser(profileData);
            } else {
                setUser({ id: data.user.id, email: data.user.email, username: trimmedInput, is_admin: 0 });
            }

            navigate('/');
        } catch (err) {
            setError(err.message || 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '1rem' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Log in to your Vartala account</p>
                </div>

                {error && (
                    <div style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                        borderLeft: '4px solid var(--danger)', 
                        padding: '0.75rem 1rem', 
                        marginBottom: '1.5rem', 
                        fontSize: '0.875rem',
                        color: 'var(--danger)',
                        borderRadius: '0.25rem',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Username or Email</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="username or email"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Password</label>
                            <Link to="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>Forgot password?</Link>
                        </div>
                        <input
                            type="password"
                            className="input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                
                <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Don't have an account? <Link to="/signup" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '600' }}>Sign up</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
