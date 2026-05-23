const JobSearch = require('../models/JobSearch');
const PlatformCredential = require('../models/PlatformCredential');
const Resume = require('../models/Resume');
const { decrypt } = require('../utils/encryption');
const { applyNaukri } = require('./platforms/naukri');
const { applyIndeed } = require('./platforms/indeed');
const { applyLinkedIn } = require('./platforms/linkedin');
const logger = require('../utils/logger');

// Active sessions map: searchId -> { status }
const activeSessions = new Map();

const startAutomation = async ({ searchDoc, io, userId }) => {
  const searchId = searchDoc._id.toString();

  if (activeSessions.has(searchId)) {
    throw new Error('A session is already running for this search');
  }

  activeSessions.set(searchId, { status: 'running' });

  // Update DB status
  await JobSearch.findByIdAndUpdate(searchId, { status: 'running', startedAt: new Date() });

  const emit = (event, data) => io.emit(`automation:${event}`, { searchId, ...data });

  try {
    // Load credential
    const credential = await PlatformCredential.findById(searchDoc.credentialId);
    if (!credential) throw new Error('Platform credential not found');

    const decryptedPassword = decrypt(credential.encryptedPassword);

    // Load resume
    const resume = await Resume.findById(searchDoc.resumeId);
    if (!resume) throw new Error('Resume not found');

    emit('started', { platform: searchDoc.platform, keywords: searchDoc.keywords });

    const opts = {
      searchDoc,
      credential: { username: credential.username, password: decryptedPassword },
      resumePath: resume.path,
      io,
      userId,
    };

    if (searchDoc.platform === 'naukri') {
      await applyNaukri(opts);
    } else if (searchDoc.platform === 'indeed') {
      await applyIndeed(opts);
    } else if (searchDoc.platform === 'linkedin') {
      await applyLinkedIn(opts);
    } else {
      throw new Error(`Unsupported platform: ${searchDoc.platform}`);
    }

    // Mark completed
    const final = await JobSearch.findByIdAndUpdate(
      searchId,
      { status: 'completed', completedAt: new Date() },
      { new: true }
    );

    emit('completed', { stats: final.stats });
    logger.info(`[Queue] Search ${searchId} completed`);

  } catch (err) {
    logger.error(`[Queue] Search ${searchId} failed: ${err.message}`);
    await JobSearch.findByIdAndUpdate(searchId, { status: 'failed', errorMessage: err.message, completedAt: new Date() });
    emit('error', { message: err.message });
  } finally {
    activeSessions.delete(searchId);
  }
};

const stopAutomation = async (searchId) => {
  await JobSearch.findByIdAndUpdate(searchId, { status: 'stopped', completedAt: new Date() });
  activeSessions.delete(searchId);
  logger.info(`[Queue] Search ${searchId} stopped`);
};

const getActiveSession = (searchId) => activeSessions.get(searchId) || null;
const getAllActiveSessions = () => [...activeSessions.keys()];

module.exports = { startAutomation, stopAutomation, getActiveSession, getAllActiveSessions };
