const axios = require('axios');

// In-memory cache for traffic data (60 seconds TTL)
const trafficCache = new Map();
const CACHE_TTL = 60 * 1000;

/**
 * Get LIVE traffic data for coordinates at a specific future time
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Date} arrivalTime - When the vehicle will reach this point
 * @returns {Object} { color, level, speedKmh, delayMinutes, congestionFactor }
 */
exports.getTrafficForCoordinates = async (lat, lng, arrivalTime = new Date()) => {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}_${Math.floor(arrivalTime.getTime() / 60000)}`;
  
  // Check cache
  const cached = trafficCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Try TomTom Traffic Flow API if key is available
    if (process.env.TOMTOM_API_KEY && process.env.TOMTOM_API_KEY !== 'your_tomtom_api_key_here') {
      const liveTraffic = await getLiveTrafficFromTomTom(lat, lng, arrivalTime);
      
      // Cache result
      trafficCache.set(cacheKey, {
        data: liveTraffic,
        timestamp: Date.now()
      });
      
      return liveTraffic;
    }
    
    // Fallback: Time-based prediction with historical patterns
    const predictedTraffic = predictTrafficByTimeAndDay(arrivalTime);
    
    trafficCache.set(cacheKey, {
      data: predictedTraffic,
      timestamp: Date.now()
    });
    
    return predictedTraffic;
    
  } catch (error) {
    console.error('Traffic Service Error:', error.message);
    
    // Emergency fallback: use time-based prediction
    return predictTrafficByTimeAndDay(arrivalTime);
  }
};

/**
 * Get LIVE traffic from TomTom Traffic Flow API
 * Returns current speed vs free-flow speed ratio
 */
async function getLiveTrafficFromTomTom(lat, lng, arrivalTime) {
  try {
    const response = await axios.get(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`,
      {
        params: {
          key: process.env.TOMTOM_API_KEY,
          point: `${lat},${lng}`,
          unit: 'KMPH'
        },
        timeout: 5000
      }
    );

    const flowData = response.data.flowSegmentData;
    const currentSpeed = flowData.currentSpeed || 50;
    const freeFlowSpeed = flowData.freeFlowSpeed || 60;
    const currentTravelTime = flowData.currentTravelTime || 0;
    const freeFlowTravelTime = flowData.freeFlowTravelTime || 0;
    
    // Calculate congestion factor (1.0 = free flow, >1.0 = congested)
    const congestionFactor = freeFlowSpeed > 0 
      ? freeFlowSpeed / currentSpeed 
      : 1.0;
    
    // Calculate delay in minutes per km
    const delaySeconds = currentTravelTime - freeFlowTravelTime;
    const delayMinutesPerKm = delaySeconds > 0 ? (delaySeconds / 60) : 0;
    
    // Determine traffic level and color
    let color, level, batteryPenalty;
    
    if (congestionFactor >= 1.5) {
      // Severe congestion
      color = '#8B0000'; // Dark red
      level = 'severe';
      batteryPenalty = 0.30; // +30% battery usage
    } else if (congestionFactor >= 1.2) {
      // Heavy traffic
      color = '#FF0000'; // Red
      level = 'heavy';
      batteryPenalty = 0.20; // +20% battery usage
    } else if (congestionFactor >= 1.1) {
      // Moderate traffic
      color = '#FFFF00'; // Yellow
      level = 'moderate';
      batteryPenalty = 0.10; // +10% battery usage
    } else {
      // Free flow
      color = '#00FF00'; // Green
      level = 'free';
      batteryPenalty = 0;
    }
    
    console.log(`  🚦 TomTom Traffic: ${level} (${currentSpeed}/${freeFlowSpeed} km/h, factor: ${congestionFactor.toFixed(2)})`);
    
    return {
      color,
      level,
      speedKmh: currentSpeed,
      freeFlowSpeedKmh: freeFlowSpeed,
      congestionFactor: Math.round(congestionFactor * 100) / 100,
      delayMinutesPerKm,
      batteryPenalty,
      source: 'TomTom Live Traffic',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    if (error.response?.status === 403) {
      console.error('🚫 TomTom API: Invalid API key');
    } else if (error.response?.status === 429) {
      console.error('🚫 TomTom API: Rate limit exceeded');
    } else {
      console.error('TomTom Traffic Error:', error.message);
    }
    
    // Fallback to time-based prediction
    return predictTrafficByTimeAndDay(arrivalTime);
  }
}

/**
 * Predict traffic based on time-of-day and day-of-week patterns (fallback)
 * Uses historical traffic patterns for Indian cities
 */
function predictTrafficByTimeAndDay(arrivalTime) {
  const hour = arrivalTime.getHours();
  const dayOfWeek = arrivalTime.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // Weekend traffic is generally lighter
  if (isWeekend) {
    if (hour >= 10 && hour <= 14) {
      // Weekend midday - moderate
      return {
        color: '#FFFF00',
        level: 'moderate',
        speedKmh: 45,
        freeFlowSpeedKmh: 60,
        congestionFactor: 1.15,
        delayMinutesPerKm: 0.5,
        batteryPenalty: 0.08,
        source: 'Time-based prediction (weekend)',
        timestamp: arrivalTime.toISOString()
      };
    } else {
      // Weekend off-peak - free flow
      return {
        color: '#00FF00',
        level: 'free',
        speedKmh: 55,
        freeFlowSpeedKmh: 60,
        congestionFactor: 1.05,
        delayMinutesPerKm: 0,
        batteryPenalty: 0,
        source: 'Time-based prediction (weekend)',
        timestamp: arrivalTime.toISOString()
      };
    }
  }
  
  // Weekday patterns (Indian metro cities)
  if (hour >= 7 && hour <= 10) {
    // Morning rush hour (7-10 AM)
    return {
      color: '#FF0000',
      level: 'heavy',
      speedKmh: 25,
      freeFlowSpeedKmh: 60,
      congestionFactor: 1.40,
      delayMinutesPerKm: 1.5,
      batteryPenalty: 0.22,
      source: 'Time-based prediction (morning rush)',
      timestamp: arrivalTime.toISOString()
    };
  } else if (hour >= 17 && hour <= 21) {
    // Evening rush hour (5-9 PM)
    return {
      color: '#FF0000',
      level: 'heavy',
      speedKmh: 22,
      freeFlowSpeedKmh: 60,
      congestionFactor: 1.50,
      delayMinutesPerKm: 2.0,
      batteryPenalty: 0.25,
      source: 'Time-based prediction (evening rush)',
      timestamp: arrivalTime.toISOString()
    };
  } else if (hour >= 11 && hour <= 16) {
    // Midday (11 AM - 4 PM)
    return {
      color: '#FFFF00',
      level: 'moderate',
      speedKmh: 40,
      freeFlowSpeedKmh: 60,
      congestionFactor: 1.20,
      delayMinutesPerKm: 0.8,
      batteryPenalty: 0.12,
      source: 'Time-based prediction (midday)',
      timestamp: arrivalTime.toISOString()
    };
  } else if (hour >= 22 || hour <= 6) {
    // Night time (10 PM - 6 AM)
    return {
      color: '#00FF00',
      level: 'free',
      speedKmh: 58,
      freeFlowSpeedKmh: 60,
      congestionFactor: 1.0,
      delayMinutesPerKm: 0,
      batteryPenalty: 0,
      source: 'Time-based prediction (night)',
      timestamp: arrivalTime.toISOString()
    };
  } else {
    // Off-peak (6-7 AM, 10-11 AM, 4-5 PM, 9-10 PM)
    return {
      color: '#90EE90', // Light green
      level: 'light',
      speedKmh: 50,
      freeFlowSpeedKmh: 60,
      congestionFactor: 1.10,
      delayMinutesPerKm: 0.3,
      batteryPenalty: 0.05,
      source: 'Time-based prediction (off-peak)',
      timestamp: arrivalTime.toISOString()
    };
  }
}

/**
 * Calculate traffic impact on battery consumption
 * Stop-and-go traffic (low speed) significantly increases EV battery usage
 */
exports.calculateTrafficBatteryImpact = (traffic, baseConsumptionKwh) => {
  // Low speed (<30 km/h) = frequent acceleration/braking = higher consumption
  const speedPenalty = traffic.speedKmh < 30 ? 0.15 : 0;
  
  // Total penalty = congestion factor penalty + speed penalty
  const totalPenalty = traffic.batteryPenalty + speedPenalty;
  
  return baseConsumptionKwh * (1 + totalPenalty);
};

/**
 * Calculate time delay caused by traffic for a segment
 */
exports.calculateTrafficDelay = (traffic, segmentDistanceKm, baseDurationMin) => {
  // If we have delay per km from API
  if (traffic.delayMinutesPerKm) {
    return traffic.delayMinutesPerKm * segmentDistanceKm;
  }
  
  // Otherwise calculate from congestion factor
  const delayFactor = traffic.congestionFactor - 1.0;
  return baseDurationMin * delayFactor;
};
