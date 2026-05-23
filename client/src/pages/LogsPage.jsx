import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText, Search, Filter, Trash2, ChevronLeft, ChevronRight,
  Loader2, Download, ExternalLink, AlertCircle,
} from 'lucide-react';
import api from '../api';

const STATUS_CONFIG = {
  applied: { label: 'Applied', cls: 'status-applied' },
  skipped: { label: 'Skipped', cls: 'status-skipped' },
  failed: { label: 'Failed', cls: 'status-failed' },
  duplicate: { label: 'Duplicate', cls: 'status-duplicate' },
};

const PLATFORM_OPTIONS = ['', 'naukri', 'indeed'];
const STATUS_OPTIONS = ['', 'applied', 'skipped', 'failed', 'duplicate'];

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [filters, setFilters] = useState({ platform: '', status: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...(filters.platform && { platform: filters.platform }),
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search }),
      });
      const res = await api.get(`/logs?${params}`);
      setLogs(res.data.logs || []);
      setPagination(res.data.pagination);
    } catch (err) {
      setError('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchLogs(1), 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/logs/${id}`);
      setLogs((prev) => prev.filter((l) => l._id !== id));
      setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
    } catch {
      setError('Failed to delete log');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all application logs? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.delete('/logs');
      setLogs([]);
      setPagination({ total: 0, page: 1, pages: 1, limit: 20 });
    } catch {
      setError('Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Job Title', 'Company', 'Location', 'Platform', 'Status', 'Applied At', 'Job URL'];
    const rows = logs.map((l) => [
      `"${l.jobTitle}"`, `"${l.company}"`, `"${l.location}"`,
      l.platform, l.status,
      new Date(l.appliedAt).toLocaleString(),
      l.jobUrl,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobbie-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 page-padding animate-in">
      <div className="page-header">
        <div className="flex items-start justify-between page-header-row">
          <div>
            <h1 className="page-title">Application Logs</h1>
            <p className="page-subtitle">
              {pagination.total} total entries across all automation sessions.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExportCSV} disabled={logs.length === 0} className="btn-secondary text-sm">
              <Download size={15} /> Export CSV
            </button>
            <button onClick={handleClearAll} disabled={clearing || logs.length === 0} className="btn-danger text-sm">
              {clearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search job title or company..."
            className="input-field pl-9"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            id="logs-search"
          />
        </div>
        <div className="relative">
          <select
            value={filters.platform}
            onChange={(e) => setFilters((prev) => ({ ...prev, platform: e.target.value }))}
            className="select-field w-36 pr-8"
            id="logs-platform-filter"
          >
            <option value="">All Platforms</option>
            <option value="naukri">Naukri</option>
            <option value="indeed">Indeed</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <div className="relative">
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="select-field w-36 pr-8"
            id="logs-status-filter"
          >
            <option value="">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="skipped">Skipped</option>
            <option value="failed">Failed</option>
            <option value="duplicate">Duplicate</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-text-muted text-xs font-medium uppercase tracking-wider">Job</th>
                <th className="text-left px-4 py-4 text-text-muted text-xs font-medium uppercase tracking-wider">Platform</th>
                <th className="text-left px-4 py-4 text-text-muted text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-4 text-text-muted text-xs font-medium uppercase tracking-wider">Applied At</th>
                <th className="text-right px-6 py-4 text-text-muted text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 size={24} className="animate-spin text-accent mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-surface-2 rounded-full">
                        <ScrollText size={24} className="text-text-muted" />
                      </div>
                      <p className="text-text-secondary font-medium">No logs found</p>
                      <p className="text-text-muted text-sm">Start an automation session to see logs here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-text-primary text-sm font-medium">{log.jobTitle}</p>
                      <p className="text-text-muted text-xs mt-0.5">
                        {log.company}{log.location ? ` · ${log.location}` : ''}
                      </p>
                      {log.errorMessage && (
                        <p className="text-red-400 text-xs mt-1 truncate max-w-xs">{log.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.platform === 'naukri'
                          ? 'bg-orange-500/15 text-orange-400'
                          : log.platform === 'linkedin'
                          ? 'bg-blue-600/15 text-blue-400'
                          : 'bg-sky-500/15 text-sky-400'
                      }`}>
                        {log.platform}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={STATUS_CONFIG[log.status]?.cls || 'status-badge'}>
                        {STATUS_CONFIG[log.status]?.label || log.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-text-secondary text-sm">
                        {new Date(log.appliedAt).toLocaleDateString()}
                      </p>
                      <p className="text-text-muted text-xs">
                        {new Date(log.appliedAt).toLocaleTimeString()}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={log.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-text-muted hover:text-accent rounded transition-colors"
                          title="View job"
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          onClick={() => handleDelete(log._id)}
                          disabled={deletingId === log._id}
                          className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                          title="Delete"
                        >
                          {deletingId === log._id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <p className="text-text-muted text-sm">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page === 1 || loading}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-text-secondary text-sm px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page === pagination.pages || loading}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LogsPage;
