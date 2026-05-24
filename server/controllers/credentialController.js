const PlatformCredential = require('../models/PlatformCredential');
const { encrypt, decrypt } = require('../utils/encryption');

// @desc    Save platform credential
// @route   POST /api/credentials
const saveCredential = async (req, res) => {
  const { platform, username, password, label, cookies } = req.body;

  if (!platform || !username || !password) {
    return res.status(400).json({ success: false, message: 'Platform, username and password are required' });
  }

  const encryptedPassword = encrypt(password);

  const credential = await PlatformCredential.findOneAndUpdate(
    { userId: req.user._id, platform },
    { username, encryptedPassword, cookies: cookies || '', label: label || `${platform} account` },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({
    success: true,
    message: 'Credential saved successfully',
    credential: {
      id: credential._id,
      platform: credential.platform,
      username: credential.username,
      label: credential.label,
      updatedAt: credential.updatedAt,
    },
  });
};

// @desc    Get all credentials for user
// @route   GET /api/credentials
const getCredentials = async (req, res) => {
  const credentials = await PlatformCredential.find({ userId: req.user._id })
    .select('-encryptedPassword')
    .sort('-updatedAt');

  res.json({ success: true, credentials });
};

// @desc    Delete credential
// @route   DELETE /api/credentials/:id
const deleteCredential = async (req, res) => {
  const credential = await PlatformCredential.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!credential) {
    return res.status(404).json({ success: false, message: 'Credential not found' });
  }

  res.json({ success: true, message: 'Credential deleted' });
};

module.exports = { saveCredential, getCredentials, deleteCredential };
