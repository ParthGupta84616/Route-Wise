const express = require('express');
const router = express.Router();
const { geocode, reverseGeocode } = require('../controllers/geocodeController');
const { protect } = require('../middleware/auth');

router.get('/geocode', protect, geocode);
router.get('/geocode/reverse', protect, reverseGeocode);

module.exports = router;
