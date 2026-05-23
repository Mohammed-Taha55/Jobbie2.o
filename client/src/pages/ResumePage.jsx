import { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, Star, Loader2, FilePlus, AlertCircle } from 'lucide-react';
import api from '../api';

const formatSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const ResumePage = () => {
  const [resumes, setResumes] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchResumes = async () => {
    try {
      const res = await api.get('/resume');
      setResumes(res.data.resumes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchResumes(); }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      return setError('Only PDF files are supported');
    }
    if (file.size > 5 * 1024 * 1024) {
      return setError('File size must be less than 5MB');
    }

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('resume', file);

    try {
      await api.post('/resume/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Resume uploaded successfully');
      fetchResumes();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleUpload(file);
  };

  const handleSetDefault = async (id) => {
    try {
      await api.patch(`/resume/${id}/default`);
      setResumes((prev) => prev.map((r) => ({ ...r, isDefault: r._id === id })));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set default');
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/resume/${id}`);
      setResumes((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete resume');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 page-padding animate-in">
      <div className="page-header">
        <h1 className="page-title">Resume</h1>
        <p className="page-subtitle">Upload and manage your PDF resumes for automated applications.</p>
      </div>

      {/* Upload Zone */}
      <div className="glass-card p-6 mb-6">
        <div
          id="resume-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
            dragging
              ? 'border-accent bg-accent-muted'
              : 'border-border hover:border-accent/40 hover:bg-accent-muted/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files[0])}
            id="resume-file-input"
          />
          <div className="flex flex-col items-center gap-3">
            {uploading ? (
              <Loader2 size={32} className="text-accent animate-spin" />
            ) : (
              <div className="p-4 bg-accent-muted border border-accent/20 rounded-full">
                <Upload size={24} className="text-accent" />
              </div>
            )}
            <div>
              <p className="text-text-primary font-medium">
                {uploading ? 'Uploading...' : 'Drop your resume here, or click to browse'}
              </p>
              <p className="text-text-muted text-sm mt-1">PDF only, max 5MB</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2 animate-in">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-emerald-400 text-sm animate-in">
            {success}
          </div>
        )}
      </div>

      {/* Resume list */}
      <div className="glass-card p-6">
        <h2 className="text-text-primary font-semibold mb-5">Uploaded Resumes</h2>

        {fetching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : resumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 bg-surface-2 rounded-full mb-4">
              <FilePlus size={28} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">No resumes uploaded</p>
            <p className="text-text-muted text-sm mt-1">Upload your first resume above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resumes.map((resume) => (
              <div key={resume._id} className={`glass-card p-4 flex items-center justify-between ${resume.isDefault ? 'border-accent/30' : ''}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <FileText size={20} className="text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-text-primary text-sm font-medium truncate">{resume.originalName}</p>
                      {resume.isDefault && (
                        <span className="status-badge bg-accent-muted text-accent border-accent/20">Default</span>
                      )}
                    </div>
                    <p className="text-text-muted text-xs mt-0.5">
                      {formatSize(resume.size)} · Uploaded {new Date(resume.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {!resume.isDefault && (
                    <button
                      onClick={() => handleSetDefault(resume._id)}
                      className="p-2 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                      title="Set as default"
                    >
                      <Star size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(resume._id)}
                    disabled={deletingId === resume._id}
                    className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Delete resume"
                  >
                    {deletingId === resume._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumePage;
