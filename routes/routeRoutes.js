const express = require('express');
const router = express.Router();
const { planRoute } = require('../controllers/routeController');
const { protect } = require('../middleware/auth');
const { mapWay } = require('../controllers/mapController');

router.post('/plan-route', protect, planRoute);
router.post('/get-routes', protect, mapWay);

module.exports = router;
