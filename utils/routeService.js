const axios = require('axios');

exports.getRouteFromORS = async (start, end) => {
  try {
    const response = await axios.post(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        coordinates: [start, end],
        // India-optimized settings
        preference: 'recommended',
        units: 'km'
      },
      {
        headers: {
          'Authorization': process.env.OPENROUTE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const route = response.data.features[0];
    
    return {
      distance: route.properties.segments[0].distance, // meters
      duration: route.properties.segments[0].duration, // seconds
      coordinates: route.geometry.coordinates // [lng, lat] pairs
    };
  } catch (error) {
    console.error('OpenRouteService Error:', error.response?.data || error.message);
    
    // Fallback: return straight line with estimated distance
    const distance = calculateDistance(start[1], start[0], end[1], end[0]) * 1000;
    
    console.warn('Using fallback route calculation');
    
    return {
      distance,
      duration: (distance / 1000) * 60, // Assuming 60 km/h average
      coordinates: generateStraightLine(start, end, 30) // More points for smoother line
    };
  }
};

// Haversine formula for distance calculation
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

function generateStraightLine(start, end, points) {
  const line = [];
  for (let i = 0; i <= points; i++) {
    const fraction = i / points;
    line.push([
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ]);
  }
  return line;
}
