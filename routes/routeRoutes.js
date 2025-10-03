const express = require('express');
const router = express.Router();
const { planRoute } = require('../controllers/routeController');
const { protect } = require('../middleware/auth');

router.post('/plan-route', protect, planRoute);

module.exports = router;
