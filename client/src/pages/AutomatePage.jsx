import { useState, useEffect, useRef } from 'react';
import { Play, Square, ChevronDown, Loader2, AlertCircle, CheckCircle2, Settings2 } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../api';
import LiveConsole from '../components/LiveConsole';

const PLATFORMS = [
  { value: 'naukri', label: 'Naukri' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'linkedin', label: 'LinkedIn' },
];
const EXPERIENCE = [
  { value: 'any', label: 'Any Experience' },
  { value: 'fresher', label: 'Fresher (0 years)' },
  { value: '1-3', label: '1–3 Years' },
  { value: '3-5', label: '3–5 Years' },
  { value: '5-10', label: '5–10 Years' },
  { value: '10+', label: '10+ Years' },
];
const JOB_TYPES = [
  { value: 'any', label: 'Any Type' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

const AutomatePage = () => {
  const [form, setForm] = useState({
    platform: 'naukri',
    credentialId: '',
    resumeId: '',
    keywords: '',
    location: '',
    experience: 'any',
    jobType: 'any',
    maxApplications: 10,
  });

  const [credentials, setCredentials] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [status, setStatus] = useState(null); // null | { session }
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentJob, setCurrentJob] = useState(null);
  const [progress, setProgress] = useState({ applied: 0, max: 10 });
  const [otpPrompt, setOtpPrompt] = useState(null); // { searchId: string, message: string }
  const [otpValue, setOtpValue] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchPrereqs = async () => {
      try {
        const [credRes, resumeRes, statusRes] = await Promise.all([
          api.get('/credentials'),
          api.get('/resume'),
          api.get('/automation/status'),
        ]);
        setCredentials(credRes.data.credentials || []);
        setResumes(resumeRes.data.resumes || []);
        setStatus(statusRes.data);

        if (statusRes.data.session) {
          setProgress({ applied: statusRes.data.session.stats?.applied || 0, max: statusRes.data.session.maxApplications });
        }

        // Pre-fill form from running session
        const s = statusRes.data.session;
        if (s) {
          setForm((prev) => ({
            ...prev,
            platform: s.platform,
            credentialId: s.credentialId?._id || s.credentialId || '',
            resumeId: s.resumeId?._id || s.resumeId || '',
            keywords: s.keywords || '',
            location: s.location || '',
            experience: s.experience || 'any',
            jobType: s.jobType || 'any',
            maxApplications: s.maxApplications || 10,
          }));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchPrereqs();

    // Socket.io — connect to Express server (Railway in prod, localhost:5000 in dev)
    const PROD_URL = 'https://server-production-4f35.up.railway.app';
    const socketUrl = import.meta.env.PROD ? PROD_URL : 'http://localhost:5000';
    socketRef.current = io(socketUrl, { transports: ['websocket', 'polling'] });
    const socket = socketRef.current;

    const addLog = (message, type = 'info') => {
      setConsoleLogs((prev) => [...prev.slice(-199), { message, type, timestamp: new Date() }]);
    };

    socket.on('automation:log', ({ message, type }) => addLog(message, type));
    socket.on('automation:started', ({ platform, keywords }) => {
      addLog(`Session started on ${platform} for "${keywords}"`, 'info');
    });
    socket.on('automation:applying', ({ jobTitle, company }) => {
      setCurrentJob({ jobTitle, company });
      addLog(`Applying: ${jobTitle} @ ${company}`, 'info');
    });
    socket.on('automation:applied', ({ jobTitle, company, appliedCount, maxApplications }) => {
      setCurrentJob(null);
      setProgress({ applied: appliedCount, max: maxApplications });
      addLog(`Applied: ${jobTitle} @ ${company}`, 'success');
    });
    socket.on('automation:completed', ({ stats }) => {
      addLog(`Session complete — Applied: ${stats?.applied}, Skipped: ${stats?.skipped}, Failed: ${stats?.failed}`, 'success');
      setStatus((prev) => ({ ...prev, running: false, session: null }));
      setCurrentJob(null);
    });
    socket.on('automation:error', ({ message }) => {
      addLog(`Error: ${message}`, 'error');
    });
    socket.on('automation:otp_required', (data) => {
      setOtpPrompt({ searchId: data.searchId, message: data.message });
      addLog(`OTP Required: ${data.message}`, 'warning');
    });

    return () => socket.disconnect();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleStart = async (e) => {
    e.preventDefault();
    if (!form.credentialId) return setError('Please select a platform credential');
    if (!form.resumeId) return setError('Please select a resume');
    if (!form.keywords.trim()) return setError('Please enter job keywords');

    setLoading(true);
    setError('');
    setSuccess('');
    setConsoleLogs([]);
    setCurrentJob(null);
    setProgress({ applied: 0, max: form.maxApplications });

    try {
      const res = await api.post('/automation/start', form);
      setSuccess('Automation started successfully!');
      setStatus({ running: true, session: { ...form, _id: res.data.searchId } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start automation');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!status?.session?._id) return;
    setStopping(true);
    try {
      await api.post(`/automation/stop/${status.session._id}`);
      setStatus((prev) => ({ ...prev, running: false, session: null }));
      setConsoleLogs((prev) => [...prev, { message: 'Automation stopped by user.', type: 'warning', timestamp: new Date() }]);
      setOtpPrompt(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to stop session');
    } finally {
      setStopping(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    if (!otpValue || !otpPrompt) return;
    setSubmittingOtp(true);
    try {
      await api.post(`/automation/otp/${otpPrompt.searchId}`, { otp: otpValue });
      setOtpPrompt(null);
      setOtpValue('');
      setConsoleLogs((prev) => [...prev, { message: 'OTP submitted, resuming automation...', type: 'info', timestamp: new Date() }]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit OTP');
    } finally {
      setSubmittingOtp(false);
    }
  };

  const isRunning = status?.running;
  const pct = progress.max > 0 ? Math.min((progress.applied / progress.max) * 100, 100) : 0;

  const credForPlatform = credentials.filter((c) => c.platform === form.platform);

  return (
    <div className="p-8 page-padding animate-in">
      <div className="page-header">
        <h1 className="page-title">Automate</h1>
        <p className="page-subtitle">Configure and launch your automated job application session.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 automate-grid">
        {/* Config Panel */}
        <div className="lg:col-span-2">
          <form onSubmit={handleStart} className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 size={18} className="text-accent" />
              <h2 className="text-text-primary font-semibold">Session Configuration</h2>
            </div>

            {/* Platform */}
            <div>
              <label className="label">Platform</label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setForm((prev) => ({ ...prev, platform: p.value, credentialId: '' })); }}
                    className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all duration-200 ${
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

            {/* Credential */}
            <div>
              <label className="label" htmlFor="automate-credential">Platform Account</label>
              {credForPlatform.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-amber-400 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  No {form.platform} credentials saved. Add them in Credentials.
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="automate-credential"
                    name="credentialId"
                    value={form.credentialId}
                    onChange={handleChange}
                    className="select-field pr-8"
                    required
                  >
                    <option value="">Select account...</option>
                    {credForPlatform.map((c) => (
                      <option key={c._id} value={c._id}>{c.label || c.username}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              )}
            </div>

            {/* Resume */}
            <div>
              <label className="label" htmlFor="automate-resume">Resume</label>
              {resumes.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-amber-400 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  No resumes uploaded. Upload one in Resume.
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="automate-resume"
                    name="resumeId"
                    value={form.resumeId}
                    onChange={handleChange}
                    className="select-field pr-8"
                    required
                  >
                    <option value="">Select resume...</option>
                    {resumes.map((r) => (
                      <option key={r._id} value={r._id}>{r.originalName} {r.isDefault ? '(Default)' : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              )}
            </div>

            {/* Keywords */}
            <div>
              <label className="label" htmlFor="automate-keywords">Job Keywords</label>
              <input
                id="automate-keywords"
                name="keywords"
                type="text"
                className="input-field"
                placeholder="e.g. React Developer, Software Engineer"
                value={form.keywords}
                onChange={handleChange}
                required
              />
            </div>

            {/* Location */}
            <div>
              <label className="label" htmlFor="automate-location">Location (optional)</label>
              <input
                id="automate-location"
                name="location"
                type="text"
                className="input-field"
                placeholder="e.g. Bangalore, Mumbai, Remote"
                value={form.location}
                onChange={handleChange}
              />
            </div>

            {/* Experience + Job Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="automate-experience">Experience</label>
                <div className="relative">
                  <select id="automate-experience" name="experience" value={form.experience} onChange={handleChange} className="select-field pr-8">
                    {EXPERIENCE.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="automate-jobtype">Job Type</label>
                <div className="relative">
                  <select id="automate-jobtype" name="jobType" value={form.jobType} onChange={handleChange} className="select-field pr-8">
                    {JOB_TYPES.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Max Applications */}
            <div>
              <label className="label" htmlFor="automate-max">
                Max Applications — <span className="text-accent">{form.maxApplications}</span>
              </label>
              <input
                id="automate-max"
                name="maxApplications"
                type="range"
                min={1}
                max={50}
                value={form.maxApplications}
                onChange={handleChange}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-text-muted text-xs mt-1">
                <span>1</span><span>50</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-emerald-400 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} /> {success}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              {!isRunning ? (
                <button type="submit" id="automate-start-btn" disabled={loading} className="btn-primary flex-1 justify-center">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  {loading ? 'Starting...' : 'Start Automation'}
                </button>
              ) : (
                <button
                  type="button"
                  id="automate-stop-btn"
                  onClick={handleStop}
                  disabled={stopping}
                  className="btn-danger flex-1 justify-center"
                >
                  {stopping ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                  {stopping ? 'Stopping...' : 'Stop Session'}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Live Panel */}
        <div className="lg:col-span-3 space-y-4">
          {/* Progress */}
          {isRunning && (
            <div className="glass-card p-5 animate-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-text-secondary text-sm font-medium">Session Progress</span>
                <span className="text-accent font-semibold text-sm">{progress.applied} / {progress.max}</span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {currentJob && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="dot-pulse" />
                  <span className="text-text-secondary">Applying to </span>
                  <span className="text-text-primary font-medium">{currentJob.jobTitle}</span>
                  <span className="text-text-muted">at {currentJob.company}</span>
                </div>
              )}
            </div>
          )}

          {/* Live Console */}
          <LiveConsole logs={consoleLogs} isRunning={isRunning} />

          {/* Tips */}
          {!isRunning && consoleLogs.length === 0 && (
            <div className="glass-card p-5">
              <h3 className="text-text-primary font-medium mb-3 text-sm">Before you start</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                {[
                  'Add your Naukri, Indeed, or LinkedIn credentials in the Credentials page',
                  'Upload your resume (PDF) in the Resume page',
                  'LinkedIn Easy Apply only — jobs without Easy Apply are skipped',
                  'Use specific keywords for better job matches',
                  'Keep max applications reasonable to avoid account flags',
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full mt-1.5 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── OTP MODAL ────────────────────────────────────────── */}
      {otpPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in">
          <div className="bg-surface-1 border border-border shadow-2xl rounded-2xl w-full max-w-sm p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={24} className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">OTP Required</h3>
              <p className="text-text-secondary text-sm mt-2 leading-relaxed">
                {otpPrompt.message}
              </p>
            </div>

            <form onSubmit={submitOtp} className="space-y-4">
              <div>
                <input
                  type="text"
                  className="input-field text-center text-xl tracking-widest py-3 font-mono"
                  placeholder="123456"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOtpPrompt(null)}
                  className="btn-secondary flex-1 justify-center"
                  disabled={submittingOtp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 justify-center bg-amber-500 hover:bg-amber-600 border-amber-500"
                  disabled={submittingOtp}
                >
                  {submittingOtp ? <Loader2 size={18} className="animate-spin" /> : 'Submit OTP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AutomatePage;
