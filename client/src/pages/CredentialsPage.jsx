import { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, Eye, EyeOff, Loader2, Shield, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../api';

const PLATFORMS = [
  { value: 'naukri',   label: 'Naukri.com',  color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  { value: 'indeed',   label: 'Indeed.com',  color: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  { value: 'linkedin', label: 'LinkedIn',    color: 'bg-blue-600/15 text-blue-400 border-blue-600/20' },
];

const platformMeta = (p) => PLATFORMS.find((pl) => pl.value === p) || { label: p, color: 'bg-gray-500/15 text-gray-400 border-gray-500/20' };

const CredentialsPage = () => {
  const [credentials, setCredentials] = useState([]);
  const [form, setForm] = useState({
    platform: 'naukri',
    label: '',
    username: '',
    password: '',
    cookies: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const fetchCredentials = async () => {
    try {
      const res = await api.get('/credentials');
      setCredentials(res.data.credentials || []);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchCredentials(); }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/credentials', form);
      setSuccess(`${platformMeta(form.platform).label} credentials saved!`);
      setForm({ platform: 'naukri', label: '', username: '', password: '', cookies: '' });
      fetchCredentials();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/credentials/${id}`);
      setCredentials((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete credential');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-in">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Credentials</h1>
        <p className="text-text-secondary text-sm mt-1">
          Manage platform login credentials. Passwords are encrypted with AES-256.
        </p>
      </div>

      {/* ── Two-column on lg, stacked on mobile ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* ── ADD FORM ──────────────────────────────────────── */}
        <div className="glass-card p-4 sm:p-6">

          {/* Card header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-accent-muted border border-accent/20 rounded-lg shrink-0">
              <KeyRound size={16} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-text-primary font-semibold text-sm sm:text-base leading-tight">
                Add / Update Credential
              </h2>
              <p className="text-text-muted text-xs mt-0.5 leading-tight">
                One credential per platform
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Platform selector — pill buttons on mobile */}
            <div>
              <label className="label">Platform</label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setForm((prev) => ({ ...prev, platform: p.value })); setError(''); setSuccess(''); }}
                    className={`py-2 px-1 rounded-lg border text-xs sm:text-sm font-medium transition-all duration-200 text-center ${
                      form.platform === p.value
                        ? 'bg-accent-muted border-accent/40 text-accent'
                        : 'bg-surface-2 border-border text-text-secondary hover:border-border-active'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Label */}
            <div>
              <label className="label" htmlFor="cred-label">Label <span className="text-text-muted font-normal">(optional)</span></label>
              <input
                id="cred-label"
                name="label"
                type="text"
                className="input-field"
                placeholder="e.g. Work account, Personal"
                value={form.label}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>

            {/* Email / Username */}
            <div>
              <label className="label" htmlFor="cred-username">Email / Username</label>
              <input
                id="cred-username"
                name="username"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                className="input-field"
                placeholder="your@email.com"
                value={form.username}
                onChange={handleChange}
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="label" htmlFor="cred-password">Password</label>
              <div className="relative">
                <input
                  id="cred-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-11"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
                {/* Touch-friendly toggle — 44×44 tap target */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors rounded-r-lg"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Cookies (Optional) */}
            <div>
              <label className="label" htmlFor="cred-cookies">
                Session Cookies <span className="text-text-muted font-normal">(optional bypass)</span>
              </label>
              <textarea
                id="cred-cookies"
                name="cookies"
                className="input-field min-h-[80px] font-mono text-xs"
                placeholder='Paste exported cookies JSON here to bypass OTP...'
                value={form.cookies}
                onChange={handleChange}
              />
            </div>

            {/* Feedback */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-emerald-400 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" />
                {success}
              </div>
            )}

            {/* Submit — full width, large tap target */}
            <button
              type="submit"
              id="cred-save-btn"
              disabled={loading}
              className="btn-primary w-full justify-center py-3"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {loading ? 'Saving...' : 'Save Credential'}
            </button>
          </form>

          {/* Security note */}
          <div className="mt-4 bg-surface-2 border border-border rounded-lg p-3 sm:p-4 flex items-start gap-3">
            <Shield size={15} className="text-accent shrink-0 mt-0.5" />
            <p className="text-text-muted text-xs leading-relaxed">
              Credentials are encrypted with AES-256 before storage and only decrypted in memory during automation.
            </p>
          </div>
        </div>

        {/* ── SAVED CREDENTIALS ─────────────────────────────── */}
        <div className="glass-card p-4 sm:p-6">
          <h2 className="text-text-primary font-semibold mb-4 sm:mb-6 text-sm sm:text-base">
            Saved Credentials
            {credentials.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-accent-muted text-accent text-xs rounded-full border border-accent/20 font-medium">
                {credentials.length}
              </span>
            )}
          </h2>

          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>

          ) : credentials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center">
              <div className="p-4 bg-surface-2 rounded-full mb-4">
                <KeyRound size={24} className="text-text-muted" />
              </div>
              <p className="text-text-secondary font-medium text-sm">No credentials saved</p>
              <p className="text-text-muted text-xs mt-1">Add your first platform credential using the form</p>
            </div>

          ) : (
            <div className="space-y-3">
              {credentials.map((cred) => {
                const meta = platformMeta(cred.platform);
                return (
                  <div
                    key={cred._id}
                    className="glass-card-hover p-3 sm:p-4 flex items-center justify-between gap-3"
                  >
                    {/* Left: badge + info */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Platform badge */}
                      <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium border ${meta.color}`}>
                        {meta.label}
                      </span>

                      {/* Name + email — truncate on narrow screens */}
                      <div className="min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate leading-tight">
                          {cred.label || cred.username}
                        </p>
                        {cred.label && (
                          <p className="text-text-muted text-xs truncate mt-0.5">{cred.username}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: delete button — 40×40 touch target */}
                    <button
                      onClick={() => handleDelete(cred._id)}
                      disabled={deletingId === cred._id}
                      className="shrink-0 w-9 h-9 flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Delete credential"
                      aria-label="Delete credential"
                    >
                      {deletingId === cred._id
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Trash2 size={15} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CredentialsPage;
