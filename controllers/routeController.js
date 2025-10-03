const asyncHandler = require('express-async-handler');
const Vehicle = require('../models/Vehicle');
const EVStation = require('../models/EVStation');
const { getDetailedRoute } = require('../utils/orsClient');
const { getWeatherForCoordinates } = require('../utils/weatherService');
const { 
  getTrafficForCoordinates, 
  calculateTrafficBatteryImpact,
  calculateTrafficDelay 
} = require('../utils/trafficService');
const { findOptimalChargingPath, greedyChargingStops } = require('../utils/graphAlgorithm');

// @desc    Plan route with charging stops using DSA algorithm
// @route   POST /api/plan-route
// @access  Private
exports.planRoute = asyncHandler(async (req, res) => {
  const {
    source,
    destination,
    vehicleId,
    currentChargePercent = 100,
    currentChargedKwh = null,
    consumption_kWh_per_km = null,
    preferredMaxDetourKm = 5,
    segmentDistanceMeters = 200,
    amenitiesFilter = [],
    preferredChargingSpeedKw = null
  } = req.body;

  // Validation
  if (!source || !destination || !vehicleId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide source, destination, and vehicleId'
    });
  }

  // Get vehicle
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle || vehicle.userId.toString() !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Vehicle not found or not authorized'
    });
  }

  // Parse coordinates
  const parseCoords = (input) => {
    if (typeof input === 'string') {
      const [lat, lng] = input.split(',').map(Number);
      return { lat, lng };
    }
    return input;
  };

  const srcCoords = parseCoords(source);
  const destCoords = parseCoords(destination);

  if (!srcCoords.lat || !srcCoords.lng || !destCoords.lat || !destCoords.lng) {
    return res.status(400).json({
      success: false,
      message: 'Invalid coordinate format'
    });
  }

  console.log(`🚗 Planning route: ${srcCoords.lat},${srcCoords.lng} → ${destCoords.lat},${destCoords.lng}`);

  try {
    // Calculate initial battery state
    const maxBatteryKwh = vehicle.batteryCapacity * (1 - vehicle.degradationPercent / 100);
    const initialBatteryKwh = currentChargedKwh || (maxBatteryKwh * currentChargePercent / 100);
    const consumptionRate = consumption_kWh_per_km || vehicle.consumption_kWh_per_km || (vehicle.batteryCapacity / 300);

    console.log(`🔋 Battery: ${initialBatteryKwh.toFixed(1)}/${maxBatteryKwh.toFixed(1)} kWh, Consumption: ${consumptionRate.toFixed(3)} kWh/km`);

    // Step 1: Get base route from ORS
    const routeData = await getDetailedRoute(
      [srcCoords.lng, srcCoords.lat],
      [destCoords.lng, destCoords.lat],
      true
    );

    const totalDistanceKm = routeData.distanceMeters / 1000;
    const baseDurationMin = routeData.durationSeconds / 60;

    // Step 2: Split into fine-grained segments
    const segments = await splitIntoSegments(
      routeData.coordinates,
      segmentDistanceMeters,
      consumptionRate,
      vehicle.degradationPercent
    );

    console.log(`📍 Route split into ${segments.length} segments (~${segmentDistanceMeters}m each)`);

    // Step 3: Fetch weather/traffic with TIME-BASED PREDICTIONS
    const startTime = new Date(); // Trip start time
    let cumulativeTimeMin = 0;
    
    const sampleRate = Math.max(1, Math.floor(segments.length / 20));
    
    for (let i = 0; i < segments.length; i++) {
      // Calculate when vehicle will reach this segment
      const segmentArrivalTime = new Date(startTime.getTime() + cumulativeTimeMin * 60000);
      
      if (i % sampleRate === 0 || i === 0 || i === segments.length - 1) {
        // Fetch live weather and traffic for THIS FUTURE TIME
        const [weather, traffic] = await Promise.all([
          getWeatherForCoordinates(segments[i].lat, segments[i].lng, segmentArrivalTime),
          getTrafficForCoordinates(segments[i].lat, segments[i].lng, segmentArrivalTime)
        ]);
        
        segments[i].weatherColor = weather.color;
        segments[i].weatherCondition = weather.condition;
        segments[i].trafficColor = traffic.color;
        segments[i].trafficLevel = traffic.level;
        segments[i].trafficData = traffic;
        segments[i].weatherPenalty = getWeatherPenalty(weather.condition);
        segments[i].trafficPenalty = traffic.batteryPenalty;
        segments[i].predictedSpeedKmh = traffic.speedKmh;
        
        console.log(`  [${i}] ETA: ${segmentArrivalTime.toLocaleTimeString()}, Traffic: ${traffic.level} (${traffic.speedKmh}km/h, +${(traffic.batteryPenalty*100).toFixed(0)}% battery)`);
      } else {
        const prev = segments[i - 1];
        segments[i].weatherColor = prev.weatherColor;
        segments[i].weatherCondition = prev.weatherCondition;
        segments[i].trafficColor = prev.trafficColor;
        segments[i].trafficLevel = prev.trafficLevel;
        segments[i].trafficData = prev.trafficData;
        segments[i].weatherPenalty = prev.weatherPenalty;
        segments[i].trafficPenalty = prev.trafficPenalty;
        segments[i].predictedSpeedKmh = prev.predictedSpeedKmh;
      }
      
      // Recalculate segment duration based on LIVE traffic speed
      const segmentDistanceKm = segments[i].distanceM / 1000;
      const actualSpeedKmh = segments[i].predictedSpeedKmh || 60;
      const trafficAdjustedDurationMin = (segmentDistanceKm / actualSpeedKmh) * 60;
      
      const trafficDelay = calculateTrafficDelay(
        segments[i].trafficData,
        segmentDistanceKm,
        trafficAdjustedDurationMin
      );
      
      segments[i].segmentDurationSec = (trafficAdjustedDurationMin + trafficDelay) * 60;
      segments[i].trafficDelayMin = Math.round(trafficDelay * 10) / 10;
      
      // Apply penalties to battery consumption
      const baseConsumption = segments[i].expectedConsumptionKwh;
      segments[i].expectedConsumptionKwh = calculateTrafficBatteryImpact(
        segments[i].trafficData,
        baseConsumption * (1 + segments[i].weatherPenalty)
      );
      
      // Update cumulative time for next iteration
      cumulativeTimeMin += segments[i].segmentDurationSec / 60;
      segments[i].cumulativeTimeMin = cumulativeTimeMin;
      segments[i].segmentEtaIso = new Date(startTime.getTime() + cumulativeTimeMin * 60000).toISOString();
    }

    // Step 4: Calculate total consumption
    const totalConsumptionKwh = segments.reduce((sum, s) => sum + s.expectedConsumptionKwh, 0);
    const estimatedBatteryUsagePercent = (totalConsumptionKwh / maxBatteryKwh) * 100;
    const totalTrafficDelayMin = segments.reduce((sum, s) => sum + (s.trafficDelayMin || 0), 0);
    const finalDurationMinWithTraffic = cumulativeTimeMin;

    console.log(`⚡ Total consumption: ${totalConsumptionKwh.toFixed(1)} kWh (${estimatedBatteryUsagePercent.toFixed(1)}%)`);
    console.log(`🚦 Total traffic delay: ${totalTrafficDelayMin.toFixed(1)} minutes`);

    // Step 5: Check if charging needed
    const chargingRequired = totalConsumptionKwh > (initialBatteryKwh * 0.9);

    let chargingStations = [];
    const errors = [];

    if (chargingRequired) {
      console.log('🔌 Charging required - searching for stations...');
      
      const candidateStations = await findCandidateStations(
        segments,
        preferredMaxDetourKm,
        amenitiesFilter
      );

      if (candidateStations.length === 0) {
        errors.push(`No charging stations found within ${preferredMaxDetourKm}km detour radius`);
      } else {
        console.log(`📍 Found ${candidateStations.length} candidate stations`);
        
        const graph = buildGraph(segments, candidateStations, consumptionRate);
        const chargingSpeedKw = preferredChargingSpeedKw || vehicle.maxChargePower || 50;
        
        const optimalPath = findOptimalChargingPath(
          graph,
          'start',
          'end',
          maxBatteryKwh,
          initialBatteryKwh,
          (stationNode, neededKwh) => Math.ceil((neededKwh / chargingSpeedKw) * 60)
        );

        if (optimalPath) {
          console.log(`✅ Optimal path found with ${optimalPath.chargingStops.length} charging stops`);
          chargingStations = await formatChargingStations(
            optimalPath.chargingStops,
            candidateStations,
            chargingSpeedKw,
            maxBatteryKwh
          );
        } else {
          console.warn('⚠️  Dijkstra failed, using greedy fallback');
          const greedyStops = greedyChargingStops(
            segments,
            candidateStations,
            maxBatteryKwh,
            initialBatteryKwh,
            consumptionRate
          );
          
          if (greedyStops) {
            chargingStations = await formatChargingStations(
              greedyStops,
              candidateStations,
              chargingSpeedKw,
              maxBatteryKwh
            );
          } else {
            errors.push('Cannot complete trip - insufficient battery and no reachable charging stations');
          }
        }
      }
    }

    // Final response
    res.json({
      success: true,
      distanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalTimeMinutes: Math.round(finalDurationMinWithTraffic),
      totalTrafficDelayMin: Math.round(totalTrafficDelayMin * 10) / 10,
      estimatedBatteryUsagePercent: Math.round(estimatedBatteryUsagePercent * 100) / 100,
      chargingRequired,
      finalEtaIso: new Date(startTime.getTime() + finalDurationMinWithTraffic * 60000).toISOString(),
      routeCoordinates: segments.map(s => ({
        lat: s.lat,
        lng: s.lng,
        weatherColor: s.weatherColor,
        weatherCondition: s.weatherCondition,
        trafficColor: s.trafficColor,
        trafficLevel: s.trafficLevel,
        predictedSpeedKmh: s.predictedSpeedKmh,
        segmentDistanceM: Math.round(s.distanceM),
        segmentDurationSec: Math.round(s.segmentDurationSec),
        trafficDelayMin: s.trafficDelayMin || 0,
        segmentEtaIso: s.segmentEtaIso,
        expectedConsumptionKwh: Math.round(s.expectedConsumptionKwh * 1000) / 1000
      })),
      chargingStations,
      errors,
      trafficSummary: {
        totalDelayMinutes: Math.round(totalTrafficDelayMin * 10) / 10,
        averageSpeedKmh: Math.round((totalDistanceKm / (finalDurationMinWithTraffic / 60)) * 10) / 10,
        severeSegments: segments.filter(s => s.trafficLevel === 'severe').length,
        heavySegments: segments.filter(s => s.trafficLevel === 'heavy').length,
        moderateSegments: segments.filter(s => s.trafficLevel === 'moderate').length,
        freeFlowSegments: segments.filter(s => s.trafficLevel === 'free').length
      },
      meta: {
        routeProvider: 'OpenRouteService',
        weatherProvider: 'OpenWeatherMap',
        trafficProvider: process.env.TOMTOM_API_KEY && process.env.TOMTOM_API_KEY !== 'your_tomtom_api_key_here' 
          ? 'TomTom Live Traffic' 
          : 'Time-based prediction',
        amenitiesProvider: 'LocalDB',
        computedAtIso: startTime.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Route planning error:', error);
    res.status(500).json({
      success: false,
      message: 'Error planning route',
      error: error.message
    });
  }
});

// Helper: Split polyline into segments
async function splitIntoSegments(coordinates, targetDistanceM, consumptionRate, degradationPercent) {
  const segments = [];
  let cumulative = 0;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];
    
    const dist = haversineMeters(lat1, lng1, lat2, lng2);
    cumulative += dist;
    
    if (cumulative >= targetDistanceM || i === coordinates.length - 2) {
      const distKm = cumulative / 1000;
      const baseConsumption = distKm * consumptionRate;
      const adjustedConsumption = baseConsumption * (1 + degradationPercent / 100);
      
      segments.push({
        lat: lat2,
        lng: lng2,
        distanceM: cumulative,
        segmentDurationSec: (cumulative / 1000 / 60) * 3600,
        expectedConsumptionKwh: adjustedConsumption,
        weatherPenalty: 0,
        trafficPenalty: 0
      });
      
      cumulative = 0;
    }
  }
  
  return segments;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function getWeatherPenalty(condition) {
  const penalties = { cold: 0.15, hot: 0.15, rain: 0.12 };
  return penalties[condition] || 0;
}

async function findCandidateStations(segments, maxDetourKm, amenitiesFilter) {
  const midpoint = segments[Math.floor(segments.length / 2)];
  
  const stations = await EVStation.find({
    isOperational: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [midpoint.lng, midpoint.lat]
        },
        $maxDistance: maxDetourKm * 1000
      }
    }
  }).limit(20);

  if (amenitiesFilter.length > 0) {
    return stations.filter(s => 
      amenitiesFilter.every(amenity => s.amenities.includes(amenity))
    );
  }

  return stations;
}

function buildGraph(segments, stations, consumptionRate) {
  const nodes = [
    { id: 'start', type: 'waypoint', lat: segments[0].lat, lng: segments[0].lng },
    { id: 'end', type: 'waypoint', lat: segments[segments.length - 1].lat, lng: segments[segments.length - 1].lng },
    ...stations.map(s => ({
      id: s._id.toString(),
      type: 'station',
      name: s.name,
      lat: s.latitude,
      lng: s.longitude,
      powerKw: s.powerKw || 50
    }))
  ];

  const edges = new Map();
  
  for (const node of nodes) {
    if (node.id === 'start') continue;
    
    const dist = haversineMeters(segments[0].lat, segments[0].lng, node.lat, node.lng) / 1000;
    const time = (dist / 60) * 60;
    const consumption = dist * consumptionRate;
    
    if (!edges.has('start')) edges.set('start', []);
    edges.get('start').push({ to: node.id, time, consumptionKwh: consumption });
  }

  for (const fromStation of stations) {
    const fromId = fromStation._id.toString();
    if (!edges.has(fromId)) edges.set(fromId, []);
    
    for (const toStation of [...stations, { _id: 'end', latitude: segments[segments.length - 1].lat, longitude: segments[segments.length - 1].lng }]) {
      const toId = toStation._id ? toStation._id.toString() : 'end';
      if (fromId === toId) continue;
      
      const dist = haversineMeters(fromStation.latitude, fromStation.longitude, toStation.latitude, toStation.longitude) / 1000;
      const time = (dist / 60) * 60;
      const consumption = dist * consumptionRate;
      
      edges.get(fromId).push({ to: toId, time, consumptionKwh: consumption });
    }
  }

  return { nodes, edges };
}

async function formatChargingStations(stops, candidateStations, chargingSpeedKw, maxBatteryKwh) {
  return stops.map(stop => {
    const station = candidateStations.find(s => s._id.toString() === stop.nodeId);
    if (!station) return null;
    
    return {
      stationId: station._id,
      name: station.name,
      lat: station.latitude,
      lng: station.longitude,
      distanceFromRouteM: 0,
      detourExtraTimeMin: 0,
      etaAtStationMin: 0,
      estimatedChargingTimeMin: stop.chargeTimeMin,
      estimatedChargeAddedPercent: Math.round((stop.chargeAddedKwh / maxBatteryKwh) * 100),
      chargers: [{ type: 'CCS', powerKw: station.powerKw || 50 }],
      amenities: (station.amenitiesDetail || []).map(a => ({
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        type: a.type
      })),
      notes: 'Station from local DB with pre-fetched amenities'
    };
  }).filter(Boolean);
}