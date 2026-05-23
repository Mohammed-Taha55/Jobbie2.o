import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/;

const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signUpPrompt, setSignUpPrompt] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setSignUpPrompt(false);
    setForm({ name: '', email: '', password: '' });
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSignUpPrompt(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSignUpPrompt(false);

    // Client-side email validation
    if (!EMAIL_REGEX.test(form.email)) {
      return setError('Please enter a valid email address (e.g. name@example.com)');
    }

    if (form.password.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };

      const res = await api.post(endpoint, payload);
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      // If server says the email isn\'t registered, show sign-up prompt
      if (err.response?.status === 404 || msg.toLowerCase().includes('sign up')) {
        setSignUpPrompt(true);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-surface-1 border-r border-border p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
            <Briefcase size={20} className="text-white" />
          </div>
          <span className="text-text-primary font-semibold text-xl">Jobbie</span>
        </div>

        <div>
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-muted border border-accent/20 rounded-full mb-6">
              <span className="dot-pulse" />
              <span className="text-accent text-xs font-medium">Automation Active</span>
            </div>
            <h1 className="text-4xl font-bold text-text-primary leading-tight mb-4">
              Apply to hundreds<br />of jobs while you<br />
              <span className="text-accent">sleep.</span>
            </h1>
            <p className="text-text-secondary leading-relaxed">
              Jobbie automates your job search on Naukri and Indeed. Set your preferences once and let the bot handle the rest.
            </p>
          </div>

          <div className="space-y-3">
            {[
              'Automated login & job search',
              'Smart duplicate prevention',
              'Real-time progress tracking',
              'Full application history logs',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-emerald-500/15 border border-emerald-500/20 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                </div>
                <span className="text-text-secondary text-sm">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-text-muted text-sm">
          &copy; {new Date().getFullYear()} Jobbie. All rights reserved.
        </p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
              <Briefcase size={18} className="text-white" />
            </div>
            <span className="text-text-primary font-semibold text-lg">Jobbie</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-text-primary mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-text-secondary text-sm">
              {mode === 'login'
                ? 'Sign in to your Jobbie account'
                : 'Start automating your job applications'}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-surface-2 border border-border rounded-lg p-1 mb-8">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 capitalize ${
                  mode === m
                    ? 'bg-accent text-white shadow-glow'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="auth-name">Full Name</label>
                <input
                  id="auth-name"
                  name="name"
                  type="text"
                  className="input-field"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>
            )}

            <div>
              <label className="label" htmlFor="auth-email">Email Address</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                className="input-field"
                placeholder="john@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="auth-password">Password</label>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm animate-in">
                <p>{error}</p>
                {signUpPrompt && (
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="mt-2 underline text-accent hover:text-accent-light transition-colors font-medium"
                  >
                    → Create a free account
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              id="auth-submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 mt-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
