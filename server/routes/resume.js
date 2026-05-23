const express = require('express');
const router = express.Router();
const { uploadResume, getResumes, deleteResume, setDefault } = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/upload', uploadResume);
router.get('/', getResumes);
router.patch('/:id/default', setDefault);
router.delete('/:id', deleteResume);

module.exports = router;
