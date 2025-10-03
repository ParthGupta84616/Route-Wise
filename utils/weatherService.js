const axios = require('axios');

// Simple in-memory cache to reduce API calls
const weatherCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Get weather for coordinates at specific time (for time-aware predictions)
 * @param {number} lat
 * @param {number} lng  
 * @param {Date} arrivalTime - When vehicle will reach this point (optional)
 */
exports.getWeatherForCoordinates = async (lat, lng, arrivalTime = new Date()) => {
  // Round coordinates to reduce cache misses
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  
  // Check cache
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather`,
      {
        params: {
          lat,
          lon: lng,
          appid: process.env.OPENWEATHER_API_KEY,
          units: 'metric'
        },
        timeout: 5000
      }
    );

    const temp = response.data.main.temp;
    const weather = response.data.weather[0].main.toLowerCase();

    // Determine color based on conditions
    let color, condition;

    if (temp < 10) {
      color = '#0000FF'; // Blue for cold
      condition = 'cold';
    } else if (temp > 40) {
      color = '#FF4500'; // Orange-red for hot
      condition = 'hot';
    } else if (weather.includes('rain') || weather.includes('snow')) {
      color = '#1E90FF'; // Rain blue
      condition = 'rain';
    } else {
      color = '#00FF00'; // Green for ideal
      condition = 'ideal';
    }

    const result = { color, condition, temp };
    
    // Cache the result
    weatherCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error('Weather API Error:', error.message);
    // Default to ideal conditions
    return { color: '#00FF00', condition: 'ideal', temp: 25 };
  }
};
