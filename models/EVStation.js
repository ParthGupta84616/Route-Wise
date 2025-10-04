const mongoose = require('mongoose');

const EVStationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add station name'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'Please add city'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Please add address']
  },
  latitude: {
    type: Number,
    required: [true, 'Please add latitude']
  },
  longitude: {
    type: Number,
    required: [true, 'Please add longitude']
  },
  // GeoJSON location (keeps geospatial queries efficient)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0]
    }
  },
  type: {
    type: String,
    enum: ['fast', 'slow', 'rapid', 'ultra-fast'],
    default: 'fast'
  },
  amenities: [{
    type: String,
    enum: ['food', 'washroom', 'medical', 'hotel', 'wifi', 'parking', 'cafe', 'restaurant', 'fuel', 'atm']
  }],

  // NEW: detailed amenities array (pre-fetched), matches your requested format
  amenitiesDetail: [{
    type: {
      type: String,
      enum: ['food', 'washroom', 'medical', 'hotel', 'wifi', 'parking', 'cafe', 'restaurant', 'fuel', 'atm'],
      required: true
    },
    amenity: { type: String }, // raw OSM amenity tag like 'restaurant' or 'pharmacy'
    name: { type: String }, // amenity name if available
    distance: { type: Number }, // distance in meters
    lat: { type: Number },
    lng: { type: Number }
  }],

  powerKw: {
    type: Number,
    default: 50
  },
  numberOfChargers: {
    type: Number,
    default: 1
  },
  isOperational: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Populate GeoJSON location from latitude/longitude before save
EVStationSchema.pre('save', function(next) {
  if (this.latitude != null && this.longitude != null) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude] // [lng, lat] order!
    };
  }
  next();
});

// Geospatial 2dsphere index for location queries (critical for $near queries)
EVStationSchema.index({ location: '2dsphere' });
EVStationSchema.index({ isOperational: 1 });
EVStationSchema.index({ city: 1 });

module.exports = mongoose.model('EVStation', EVStationSchema);
