const express = require('express');
const router = express.Router();
const { saveCredential, getCredentials, deleteCredential } = require('../controllers/credentialController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/', saveCredential);
router.get('/', getCredentials);
router.delete('/:id', deleteCredential);

module.exports = router;
