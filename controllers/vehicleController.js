const asyncHandler = require('express-async-handler');
const Vehicle = require('../models/Vehicle');

// @desc    Get all vehicles for logged in user
// @route   GET /api/vehicles
// @access  Private
exports.getVehicles = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find({ userId: req.user.id });

  res.json({
    success: true,
    count: vehicles.length,
    data: vehicles
  });
});

// @desc    Get single vehicle
// @route   GET /api/vehicles/:id
// @access  Private
exports.getVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).json({
      success: false,
      message: 'Vehicle not found'
    });
  }

  // Make sure user owns vehicle
  if (vehicle.userId.toString() !== req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this vehicle'
    });
  }

  res.json({
    success: true,
    data: vehicle
  });
});

// @desc    Create new vehicle
// @route   POST /api/vehicles
// @access  Private
exports.createVehicle = asyncHandler(async (req, res) => {
  req.body.userId = req.user.id;

  const vehicle = await Vehicle.create(req.body);

  res.status(201).json({
    success: true,
    data: vehicle
  });
});

// @desc    Update vehicle
// @route   PUT /api/vehicles/:id
// @access  Private
exports.updateVehicle = asyncHandler(async (req, res) => {
  let vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).json({
      success: false,
      message: 'Vehicle not found'
    });
  }

  // Make sure user owns vehicle
  if (vehicle.userId.toString() !== req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to update this vehicle'
    });
  }

  vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.json({
    success: true,
    data: vehicle
  });
});

// @desc    Delete vehicle
// @route   DELETE /api/vehicles/:id
// @access  Private
exports.deleteVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).json({
      success: false,
      message: 'Vehicle not found'
    });
  }

  // Make sure user owns vehicle
  if (vehicle.userId.toString() !== req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to delete this vehicle'
    });
  }

  await vehicle.deleteOne();

  res.json({
    success: true,
    message: 'Vehicle deleted successfully'
  });
});
