const JobSearch = require('../models/JobSearch');
const { startAutomation, stopAutomation, getActiveSession, getAllActiveSessions } = require('../automation/queue');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');

// @desc    Start automation session
// @route   POST /api/automation/start
const startSession = async (req, res) => {
  const { platform, credentialId, resumeId, keywords, location, experience, jobType, maxApplications } = req.body;

  if (!platform || !credentialId || !resumeId || !keywords) {
    return res.status(400).json({ success: false, message: 'platform, credentialId, resumeId and keywords are required' });
  }

  // Check for existing running session
  const running = await JobSearch.findOne({ userId: req.user._id, status: 'running' });
  if (running) {
    return res.status(409).json({ success: false, message: 'Another session is already running. Stop it first.' });
  }

  const searchDoc = await JobSearch.create({
    userId: req.user._id,
    platform,
    credentialId,
    resumeId,
    keywords,
    location: location || '',
    experience: experience || 'any',
    jobType: jobType || 'any',
    maxApplications: Math.min(maxApplications || 10, 50),
    status: 'pending',
  });

  const io = req.app.get('io');

  // Start in background (non-blocking)
  startAutomation({ searchDoc, io, userId: req.user._id }).catch((err) => {
    logger.error(`Background automation error: ${err.message}`);
  });

  res.status(201).json({
    success: true,
    message: 'Automation session started',
    searchId: searchDoc._id,
  });
};

// @desc    Stop automation session
// @route   POST /api/automation/stop/:id
const stopSession = async (req, res) => {
  const { id } = req.params;
  const search = await JobSearch.findOne({ _id: id, userId: req.user._id });

  if (!search) return res.status(404).json({ success: false, message: 'Session not found' });
  if (search.status !== 'running') {
    return res.status(400).json({ success: false, message: 'Session is not running' });
  }

  await stopAutomation(id);
  res.json({ success: true, message: 'Session stop requested' });
};

// @desc    Get automation sessions
// @route   GET /api/automation/sessions
const getSessions = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const total = await JobSearch.countDocuments({ userId: req.user._id });
  const sessions = await JobSearch.find({ userId: req.user._id })
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('credentialId', 'platform username')
    .populate('resumeId', 'originalName');

  res.json({
    success: true,
    sessions,
    pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) },
  });
};

// @desc    Get current running session status
// @route   GET /api/automation/status
const getStatus = async (req, res) => {
  const running = await JobSearch.findOne({ userId: req.user._id, status: 'running' });
  const active = getAllActiveSessions();

  res.json({
    success: true,
    running: !!running,
    session: running,
    activeSessions: active,
  });
};

// @desc    Submit OTP for automation
// @route   POST /api/automation/otp/:id
const submitOtp = async (req, res) => {
  const { id } = req.params;
  const { otp } = req.body;
  
  if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' });

  // Emit the OTP over the internal event bus. The Puppeteer script is listening for this exact event name.
  eventBus.emit(`otp:${id}`, otp);

  res.json({ success: true, message: 'OTP submitted successfully' });
};

module.exports = { startSession, stopSession, getSessions, getStatus, submitOtp };
