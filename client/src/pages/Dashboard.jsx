import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, XCircle, AlertCircle, Play, Clock, TrendingUp, Briefcase,
  ArrowRight, BarChart2, Activity,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';

const STATUS_MAP = {
  applied: { label: 'Applied', cls: 'status-applied' },
  skipped: { label: 'Skipped', cls: 'status-skipped' },
  failed: { label: 'Failed', cls: 'status-failed' },
  duplicate: { label: 'Duplicate', cls: 'status-duplicate' },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-xs">
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState({ applied: 0, skipped: 0, failed: 0, duplicate: 0, total: 0 });
  const [trend, setTrend] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [runningSession, setRunningSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, logsRes, statusRes] = await Promise.all([
          api.get('/logs/stats'),
          api.get('/logs?limit=8'),
          api.get('/automation/status'),
        ]);
        setStats(statsRes.data.stats);

        // Process trend data
        const trendRaw = statsRes.data.trend || [];
        const dateMap = {};
        trendRaw.forEach(({ _id, count }) => {
          const d = _id.date;
          if (!dateMap[d]) dateMap[d] = { date: d, applied: 0, failed: 0 };
          dateMap[d][_id.status] = count;
        });
        setTrend(Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)));
        setRecentLogs(logsRes.data.logs || []);
        setRunningSession(statusRes.data.session);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const successRate = stats.total > 0 ? Math.round((stats.applied / stats.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 page-padding animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between page-header-row">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {user?.name?.split(' ')[0]}. Here's your job application overview.</p>
          </div>
          <button
            id="dashboard-start-btn"
            onClick={() => navigate('/automate')}
            className="btn-primary"
          >
            <Play size={16} />
            Start Automation
          </button>
        </div>
      </div>

      {/* Running session banner */}
      {runningSession && (
        <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between animate-in">
          <div className="flex items-center gap-3">
            <span className="dot-pulse" style={{ background: '#3b82f6' }} />
            <div>
              <p className="text-blue-400 font-medium text-sm">Automation Running</p>
              <p className="text-text-secondary text-xs mt-0.5">
                Searching for "{runningSession.keywords}" on {runningSession.platform}
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/automate')} className="btn-secondary text-xs px-3 py-2">
            View Progress <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Applied" value={stats.applied} icon={CheckCircle} color="green" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon={TrendingUp} color="accent" />
        <StatCard label="Skipped" value={stats.skipped} icon={AlertCircle} color="yellow" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} color="red" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-text-primary font-semibold">Applications (7 days)</h2>
              <p className="text-text-secondary text-xs mt-0.5">Daily application activity</p>
            </div>
            <BarChart2 size={18} className="text-text-muted" />
          </div>
          {trend.length === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-text-muted text-sm">No data yet. Start automating to see trends.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="applied-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failed-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="applied" name="Applied" stroke="#10b981" fill="url(#applied-gradient)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="url(#failed-gradient)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Summary */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity size={18} className="text-accent" />
            <h2 className="text-text-primary font-semibold">Summary</h2>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Applied', value: stats.applied, color: 'bg-emerald-400', pct: stats.total > 0 ? (stats.applied / stats.total) * 100 : 0 },
              { label: 'Skipped', value: stats.skipped, color: 'bg-amber-400', pct: stats.total > 0 ? (stats.skipped / stats.total) * 100 : 0 },
              { label: 'Failed', value: stats.failed, color: 'bg-red-400', pct: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0 },
              { label: 'Duplicate', value: stats.duplicate, color: 'bg-violet-400', pct: stats.total > 0 ? (stats.duplicate / stats.total) * 100 : 0 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-text-secondary">{item.label}</span>
                  <span className="text-text-primary font-medium">{item.value}</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-700`}
                    style={{ width: `${item.pct.toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="section-divider" />
            <div className="flex justify-between">
              <span className="text-text-secondary text-sm">Total Processed</span>
              <span className="text-text-primary font-semibold">{stats.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
        <div className="mt-6 glass-card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-text-primary font-semibold">Recent Applications</h2>
            <button onClick={() => navigate('/logs')} className="text-accent text-sm hover:text-accent-light flex items-center gap-1">
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {recentLogs.map((log) => (
              <div key={log._id} className="flex items-center justify-between px-6 py-3 hover:bg-surface-2/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Briefcase size={16} className="text-text-muted shrink-0" />
                  <div className="min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate">{log.jobTitle}</p>
                    <p className="text-text-muted text-xs">{log.company} {log.location ? `· ${log.location}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-text-muted text-xs capitalize">{log.platform}</span>
                  <span className={STATUS_MAP[log.status]?.cls || 'status-badge bg-gray-500/15 text-gray-400'}>
                    {STATUS_MAP[log.status]?.label || log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
