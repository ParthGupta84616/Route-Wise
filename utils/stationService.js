const EVStation = require('../models/EVStation');

// Fetch charging stations from LOCAL MongoDB with pre-fetched amenities
exports.getNearbyStations = async (lat, lng, radiusKm = 50) => {
  try {
    console.log(`🔍 Searching LOCAL DB for stations within ${radiusKm}km of ${lat},${lng}`);
    
    // Fetch all operational stations from MongoDB
    const allStations = await EVStation.find({ isOperational: true });
    
    if (allStations.length === 0) {
      console.warn('⚠️  No stations found in database. Run: python scripts/import_stations_with_amenities.py');
      return [];
    }
    
    // Calculate distance for each station and filter by radius
    const nearbyStations = allStations
      .map(station => {
        const distance = calculateDistance(
          lat, 
          lng, 
          station.latitude, 
          station.longitude
        );
        
        return {
          _id: station._id,
          name: station.name,
          city: station.city,
          address: station.address,
          latitude: station.latitude,
          longitude: station.longitude,
          type: station.type,
          powerKw: station.powerKw,
          numberOfChargers: station.numberOfChargers,
          amenities: station.amenities || [], // Pre-fetched from DB
          amenitiesDetail: station.amenitiesDetail || [], // Detailed info with distances
          distance: Math.round(distance * 100) / 100 // Round to 2 decimals
        };
      })
      .filter(station => station.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
    
    console.log(`✅ Found ${nearbyStations.length} stations in LOCAL DB within ${radiusKm}km`);
    
    if (nearbyStations.length > 0) {
      console.log(`📍 Closest station: ${nearbyStations[0].name} (${nearbyStations[0].distance}km away)`);
      console.log(`   Amenities: ${nearbyStations[0].amenities.join(', ')}`);
    }
    
    return nearbyStations;
    
  } catch (error) {
    console.error('❌ Station Service Error:', error.message);
    return [];
  }
};

// Haversine formula for accurate distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}
  try {
    const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
      params: {
        latitude: lat,
        longitude: lng,
        distance: radiusKm,
        distanceunit: 'KM',
        maxresults: 20,
        countrycode: 'IN'
      },
      timeout: 10000
    });

    const stations = response.data
      .filter(station => 
        station.AddressInfo?.Latitude && 
        station.AddressInfo?.Longitude
      )
      .map(station => {
        const distance = calculateDistance(
          lat, lng, 
          station.AddressInfo.Latitude, 
          station.AddressInfo.Longitude
        );
        
        return {
          name: station.AddressInfo.Title || 'EV Charging Station',
          address: station.AddressInfo.AddressLine1 || 'Address not available',
          city: station.AddressInfo.Town || 'Unknown',
          latitude: station.AddressInfo.Latitude,
          longitude: station.AddressInfo.Longitude,
          type: station.Connections?.[0]?.PowerKW > 100 ? 'ultra-fast' : 'fast',
          powerKw: station.Connections?.[0]?.PowerKW || 50,
          numberOfChargers: station.NumberOfPoints || 1,
          amenities: [],
          distance: Math.round(distance * 100) / 100
        };
      })
      .sort((a, b) => a.distance - b.distance);

    console.log(`✅ Fetched ${stations.length} stations from OpenChargeMap API`);
    return stations;
    
  } catch (error) {
    console.error('❌ OpenChargeMap API Error:', error.message);
    return [];
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}
