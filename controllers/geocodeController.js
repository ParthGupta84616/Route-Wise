const asyncHandler = require('express-async-handler');
const { geocodeAddress, reverseGeocode } = require('../utils/geocodeService');

// @desc    Convert address to coordinates
// @route   GET /api/geocode?address=your+address&country=IN
// @access  Private
exports.geocode = asyncHandler(async (req, res) => {
  const { address, country } = req.query;

  if (!address) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an address parameter'
    });
  }

  try {
    const result = await geocodeAddress(address, country);

    // Warn if confidence is low
    if (result.confidence < 70) {
      result.warning = 'Low confidence match. Please verify the address or choose from suggestions.';
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Convert coordinates to address (reverse geocoding)
// @route   GET /api/geocode/reverse?lat=12.9716&lng=77.5946
// @access  Private
exports.reverseGeocode = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: 'Please provide lat and lng parameters'
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid coordinates format'
    });
  }

  try {
    const result = await reverseGeocode(latitude, longitude);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});
