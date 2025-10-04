const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os'); // added to detect LAN IPs

// Load env vars
dotenv.config();

// Route files
const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const routeRoutes = require('./routes/routeRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes'); // NEW

const app = express();

// Body parser - FIX: Changed from app.express.json() to app.use(express.json())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors());

// Build Mongo URI from env or use provided full MONGO_URI
const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.MONGO_HOST || '127.0.0.1'}:${process.env.MONGO_PORT || '27017'}/${process.env.MONGO_DB || 'routewise'}`;

// Connect to database
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected:', MONGO_URI))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api', routeRoutes);
app.use('/api', geocodeRoutes); // NEW

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // set to your server IP or domain if needed

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on ${HOST}:${PORT}`);

  // Log LAN-accessible addresses so mobile/native apps can use them
  try {
    const nets = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip over internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
    if (addresses.length > 0) {
      console.log('Accessible on your local network at:');
      addresses.forEach(addr => console.log(`  http://${addr}:${PORT}`));
    } else {
      console.log('No non-internal IPv4 address found. If you are on a LAN, ensure your machine has a network IP.');
    }
  } catch (e) {
    console.warn('Could not enumerate network interfaces:', e.message || e);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
