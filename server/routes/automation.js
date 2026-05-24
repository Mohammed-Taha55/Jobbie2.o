const express = require('express');
const router = express.Router();
const { startSession, stopSession, getSessions, getStatus, submitOtp } = require('../controllers/automationController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/start', startSession);
router.post('/stop/:id', stopSession);
router.get('/sessions', getSessions);
router.get('/status', getStatus);
router.post('/otp/:id', submitOtp);

module.exports = router;
