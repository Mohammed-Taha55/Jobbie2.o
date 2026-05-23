const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// @desc    Register user
// @route   POST /api/auth/register
const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide name, email and password' });
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
  }

  // Validate password strength
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'This email is already registered. Please sign in instead.' });
  }

  const user = await User.create({ name, email, password });
  const token = generateToken(user._id);

  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token,
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  // Validate email format before querying DB
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
  }

  // Check if user exists first — give a helpful sign-up prompt
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account found with this email. Please sign up first.',
    });
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
  }

  const token = generateToken(user._id);
  logger.info(`User logged in: ${email}`);

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  res.json({
    success: true,
    user: { id: req.user._id, name: req.user.name, email: req.user.email, createdAt: req.user.createdAt },
  });
};

module.exports = { register, login, getMe };
