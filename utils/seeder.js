const mongoose = require('mongoose');
const dotenv = require('dotenv');
const axios = require('axios');
const EVStation = require('../models/EVStation');

dotenv.config();

// Fetch REAL Indian charging stations from OpenChargeMap API
async function fetchRealIndianStations() {
  try {
    console.log('🌍 Fetching REAL Indian EV charging stations from OpenChargeMap API...');
    
    const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
      params: {
        countrycode: 'IN', // India only
        maxresults: 100,
        compact: false,
        verbose: false
      },
      timeout: 10000
    });

    const stations = response.data
      .filter(station => 
        station.AddressInfo?.Latitude && 
        station.AddressInfo?.Longitude &&
        station.StatusType?.IsOperational !== false
      )
      .map(station => ({
        name: station.AddressInfo.Title || 'EV Charging Station',
        city: station.AddressInfo.Town || station.AddressInfo.StateOrProvince || 'Unknown',
        address: station.AddressInfo.AddressLine1 || 'Address not available',
        latitude: station.AddressInfo.Latitude,
        longitude: station.AddressInfo.Longitude,
        type: station.Connections?.[0]?.PowerKW > 100 ? 'ultra-fast' : 
              station.Connections?.[0]?.PowerKW > 50 ? 'rapid' : 'fast',
        amenities: [], // Will be fetched dynamically when needed
        powerKw: station.Connections?.[0]?.PowerKW || 50,
        numberOfChargers: station.NumberOfPoints || 1,
        isOperational: station.StatusType?.IsOperational !== false
      }));

    console.log(`✅ Fetched ${stations.length} REAL stations from API`);
    return stations;
    
  } catch (error) {
    console.error('❌ Failed to fetch from OpenChargeMap:', error.message);
    return [];
  }
}

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Fetch REAL stations from API
    const stations = await fetchRealIndianStations();
    
    if (stations.length === 0) {
      console.error('❌ No stations fetched. Cannot seed database.');
      process.exit(1);
    }

    await EVStation.deleteMany();
    console.log('🗑️  Existing stations deleted');

    await EVStation.insertMany(stations);
    console.log(`✅ ${stations.length} REAL Indian EV stations seeded from API`);
    
    console.log('\n📍 Sample seeded stations:');
    stations.slice(0, 5).forEach(s => console.log(`   - ${s.name} (${s.city})`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder Error:', error);
    process.exit(1);
  }
};

seedDatabase();
    amenities: [],
    powerKw: 50,
    numberOfChargers: 3
  },
  {
    name: 'Ahmedabad SG Highway Hub',
    city: 'Ahmedabad',
    address: 'SG Highway, Bodakdev, Ahmedabad',
    latitude: 23.0225,
    longitude: 72.5714,
    type: 'rapid',
    amenities: [],
    powerKw: 100,
    numberOfChargers: 5
  },
  {
    name: 'Jaipur Jaipur-Delhi Highway Station',
    city: 'Jaipur',
    address: 'NH-48, Shahpura, Jaipur',
    latitude: 26.9124,
    longitude: 75.7873,
    type: 'fast',
    amenities: [],
    powerKw: 50,
    numberOfChargers: 4
  },
  {
    name: 'Kolkata EM Bypass Charging Point',
    city: 'Kolkata',
    address: 'EM Bypass, Kasba, Kolkata',
    latitude: 22.5726,
    longitude: 88.3639,
    type: 'rapid',
    amenities: [],
    powerKw: 100,
    numberOfChargers: 5
  }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    await EVStation.deleteMany();
    console.log('🗑️  Existing stations deleted');

    await EVStation.insertMany(stations);
    console.log(`✅ ${stations.length} Indian EV stations seeded successfully`);
    
    console.log('\n📍 Seeded stations (amenities will be fetched dynamically):');
    stations.forEach(s => console.log(`   - ${s.name} (${s.city})`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder Error:', error);
    process.exit(1);
  }
};

seedDatabase();
