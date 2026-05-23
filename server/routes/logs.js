const express = require('express');
const router = express.Router();
const { getLogs, getStats, deleteLog, clearLogs } = require('../controllers/logController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', getLogs);
router.get('/stats', getStats);
router.delete('/', clearLogs);
router.delete('/:id', deleteLog);

module.exports = router;
