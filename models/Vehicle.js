const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a vehicle name'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Please add a vehicle model'],
    trim: true
  },
  size: {
    type: String,
    enum: ['small', 'medium', 'large', 'suv'],
    default: 'medium'
  },
  batteryCapacity: {
    type: Number,
    required: [true, 'Please add battery capacity in kWh'],
    min: 10,
    max: 200
  },
  // NEW: Consumption rate (kWh per km)
  consumption_kWh_per_km: {
    type: Number,
    default: function() {
      // Default: assume ~300km range
      return this.batteryCapacity / 300;
    },
    min: 0.05,
    max: 1.0
  },
  kmRun: {
    type: Number,
    default: 0,
    min: 0
  },
  degradationPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // DEPRECATED: use consumption_kWh_per_km instead
  efficiencyKmPerKwh: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  // NEW: Charging specifications
  chargingPortType: {
    type: String,
    enum: ['CCS', 'CHAdeMO', 'Type2', 'GB/T'],
    default: 'CCS'
  },
  maxChargePower: {
    type: Number, // kW
    default: 50,
    min: 3.3,
    max: 350
  },
  topSpeed: {
    type: Number, // km/h
    default: 120
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Vehicle', VehicleSchema);
