const axios = require('axios');

const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get route from OpenRouteService with traffic-aware duration
 */
exports.getDetailedRoute = async (start, end, preferTraffic = true) => {
  const cacheKey = `${start.join(',')}-${end.join(',')}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const response = await axios.post(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        coordinates: [start, end],
        preference: preferTraffic ? 'recommended' : 'fastest',
        units: 'km',
        instructions: false,
        elevation: false
      },
      {
        headers: {
          'Authorization': process.env.OPENROUTE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    const route = response.data.features[0];
    const result = {
      distanceMeters: route.properties.segments[0].distance,
      durationSeconds: route.properties.segments[0].duration,
      coordinates: route.geometry.coordinates, // [lng, lat] pairs
      bbox: route.bbox
    };
    
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
    
  } catch (error) {
    console.error('ORS Error:', error.response?.data || error.message);
    
    // Fallback: haversine distance + estimated duration
    const distanceKm = calculateHaversine(start[1], start[0], end[1], end[0]);
    const fallback = {
      distanceMeters: distanceKm * 1000,
      durationSeconds: (distanceKm / 60) * 3600, // 60 km/h avg
      coordinates: generateStraightLine(start, end, 50),
      fallback: true
    };
    
    cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return fallback;
  }
};

function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function generateStraightLine(start, end, points) {
  const line = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    line.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t
    ]);
  }
  return line;
}
