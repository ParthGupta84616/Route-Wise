const asyncHandler = require('express-async-handler');
const Vehicle = require('../models/Vehicle');
const EVStation = require('../models/EVStation');
const { getOSRMRoute } = require('../utils/osrmClient');
const { getWeatherForCoordinates } = require('../utils/weatherService');
const {
  getTrafficForCoordinates,
  calculateTrafficBatteryImpact,
  calculateTrafficDelay
} = require('../utils/trafficService');
const { findOptimalChargingPath, greedyChargingStops } = require('../utils/graphAlgorithm');

// Cache for frequently accessed data
const stationCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// @desc    Plan route with charging stops using optimized DSA algorithms
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
    preferredChargingSpeedKw = null,
    optimizationStrategy = 'hybrid', // 'time', 'cost', 'hybrid'
    minimumBatteryAtDestinationPercent = 20 // NEW: User-defined minimum battery at destination
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

  console.log(`🚗 Planning optimized route: ${srcCoords.lat},${srcCoords.lng} → ${destCoords.lat},${destCoords.lng}`);

  try {
    // Calculate initial battery state
    const maxBatteryKwh = vehicle.batteryCapacity * (1 - vehicle.degradationPercent / 100);
    const initialBatteryKwh = currentChargedKwh || (maxBatteryKwh * currentChargePercent / 100);
    const consumptionRate = consumption_kWh_per_km || vehicle.consumption_kWh_per_km || (vehicle.batteryCapacity / 300);
    const minBatteryBuffer = maxBatteryKwh * 0.15; // 15% safety buffer for driving
    const minBatteryAtDestination = (minimumBatteryAtDestinationPercent / 100) * maxBatteryKwh; // User's desired battery at destination

    console.log(`🔋 Battery: ${initialBatteryKwh.toFixed(1)}/${maxBatteryKwh.toFixed(1)} kWh, Consumption: ${consumptionRate.toFixed(3)} kWh/km`);
    console.log(`🎯 Target: ${minimumBatteryAtDestinationPercent}% (${minBatteryAtDestination.toFixed(1)} kWh) at destination`);

    // Step 1: Get base route with optimizations
    const routeData = await getOSRMRoute(
      [srcCoords.lng, srcCoords.lat],
      [destCoords.lng, destCoords.lat],
      { steps: true, overview: 'full', geometries: 'geojson' }
    );

    const totalDistanceKm = routeData.distanceMeters / 1000;
    const baseDurationMin = routeData.durationSeconds / 60;

    // Step 2: Optimized segment creation using dynamic programming
    const segments = await createOptimizedSegments(
      routeData.coordinates,
      segmentDistanceMeters,
      consumptionRate,
      vehicle.degradationPercent,
      totalDistanceKm
    );

    console.log(`📍 Route optimized into ${segments.length} segments (~${segmentDistanceMeters}m each)`);

    // Step 3: Parallel processing for weather/traffic with batch optimization
    let enrichedSegments = await enrichSegmentsWithConditions(
      segments,
      new Date(),
      consumptionRate,
      maxBatteryKwh
    );

    // Step 4: Calculate cumulative consumption using prefix sum optimization
    const consumptionData = calculateCumulativeConsumption(
      enrichedSegments, 
      maxBatteryKwh,
      initialBatteryKwh // Pass actual initial battery
    );
    
    // Step 5: Advanced charging strategy determination - ACCOUNT FOR DESTINATION BATTERY
    const chargingAnalysis = analyzeChargingNeeds(
      consumptionData.totalConsumptionKwh,
      initialBatteryKwh,
      minBatteryBuffer,
      totalDistanceKm,
      minBatteryAtDestination // NEW: Pass destination requirement
    );

    let chargingStations = [];
    const errors = [];
    let dynamicChargingStations = [];

    if (chargingAnalysis.chargingRequired) {
      console.log('🔌 Charging required - applying multi-algorithm optimization...');

      // Find critical points where charging is needed
      const criticalPoints = findCriticalChargingPoints(
        enrichedSegments,
        initialBatteryKwh,
        minBatteryBuffer,
        consumptionData.cumulativeConsumption
      );

      // Get stations using multiple strategies
      const stationSearchResults = await findOptimalStations(
        enrichedSegments,
        criticalPoints,
        preferredMaxDetourKm,
        amenitiesFilter,
        optimizationStrategy
      );

      if (stationSearchResults.stations.length === 0) {
        errors.push(`No charging stations found within ${preferredMaxDetourKm}km detour radius`);
      } else {
        console.log(`📍 Found ${stationSearchResults.stations.length} candidate stations using ${stationSearchResults.algorithm}`);

        const chargingSpeedKw = preferredChargingSpeedKw || vehicle.maxChargePower || 50;

        // Use enhanced greedy algorithm (A* and DP removed as they don't work)
        console.log('🔌 Using enhanced greedy algorithm...');
        const optimalPath = enhancedGreedyChargingStops(
          enrichedSegments,
          stationSearchResults.stations,
          maxBatteryKwh,
          initialBatteryKwh,
          minBatteryAtDestination,
          consumptionRate,
          criticalPoints
        );

        if (optimalPath && optimalPath.chargingStops && optimalPath.chargingStops.length > 0) {
          // CHECK FOR ERRORS FROM ALGORITHM
          if (optimalPath.error) {
            console.error('❌ Charging algorithm error:', optimalPath.error.message);
            return res.status(400).json({
              success: false,
              message: optimalPath.error.message,
              errorCode: optimalPath.error.code,
              errorDetails: optimalPath.error.details,
              chargingStations: [],
              errors: [optimalPath.error.message]
            });
          }
          
          console.log(`✅ Found ${optimalPath.chargingStops.length} charging stops`);
          
          // Format charging stations with enhanced details
          chargingStations = await formatEnhancedChargingStations(
            optimalPath.chargingStops,
            stationSearchResults.stations,
            chargingSpeedKw,
            maxBatteryKwh,
            enrichedSegments
          );

          // INSERT CHARGING STOPS INTO ROUTE SEGMENTS (reassign enrichedSegments)
          enrichedSegments = insertChargingStopsIntoRoute(
            enrichedSegments,
            chargingStations,
            initialBatteryKwh,
            maxBatteryKwh,
            consumptionRate
          );

          // Recalculate consumption after adding charging stops - WITH INITIAL BATTERY
          const updatedConsumptionData = calculateCumulativeConsumption(
            enrichedSegments, 
            maxBatteryKwh,
            initialBatteryKwh
          );
          consumptionData.totalConsumptionKwh = updatedConsumptionData.totalConsumptionKwh;
          consumptionData.minBatteryPercent = updatedConsumptionData.minBatteryPercent;

          // Remove dynamic recommendations - we already have actual charging stops
          dynamicChargingStations = [];
        } else if (optimalPath && optimalPath.error) {
          // Handle error case
          console.error('❌ Cannot complete trip:', optimalPath.error.message);
          return res.status(400).json({
            success: false,
            message: optimalPath.error.message,
            errorCode: optimalPath.error.code,
            errorDetails: optimalPath.error.details,
            chargingStations: [],
            errors: [optimalPath.error.message]
          });
        } else {
          errors.push('Cannot complete trip - insufficient battery and no reachable charging stations');
        }
      }
    }

    // Calculate final metrics with MINIMUM BATTERY AT DESTINATION - NOW ASYNC
    const finalMetrics = await calculateFinalMetrics(
      enrichedSegments,
      totalDistanceKm,
      chargingStations,
      new Date(),
      initialBatteryKwh,
      consumptionData.totalConsumptionKwh,
      maxBatteryKwh,
      minBatteryAtDestination
    );

    // Prepare response with enhanced station data
    const response = {
      success: true,
      distanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalTimeMinutes: Math.round(finalMetrics.totalTimeMin),
      totalTrafficDelayMin: Math.round(finalMetrics.trafficDelayMin * 10) / 10,
      estimatedBatteryUsagePercent: Math.round(consumptionData.usagePercent * 100) / 100,
      chargingRequired: chargingAnalysis.chargingRequired,
      chargingUrgency: chargingAnalysis.urgency,
      finalEtaIso: finalMetrics.finalEtaIso,
      routeCoordinates: enrichedSegments.map(s => ({
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
        expectedConsumptionKwh: Math.round(s.expectedConsumptionKwh * 1000) / 1000,
        batteryLevelPercent: s.batteryLevelPercent || 0,
        // CHARGING STOP DATA
        isChargingStop: s.isChargingStop || false,
        stationName: s.stationName || null,
        chargingTimeMin: s.chargingTimeMin || null,
        chargeAddedPercent: s.chargeAddedPercent || null
      })),
      navigationSteps: routeData.steps.map(step => ({
        instruction: step.instruction,
        distance: Math.round(step.distance),
        duration: Math.round(step.duration),
        type: step.type,
        direction: step.direction,
        modifier: step.modifier || ''
      })),
      chargingStations: chargingStations.map(station => ({
        ...station,
        highlighted: true,
        markerData: {
          stationId: station.stationId,
          lat: station.lat,
          lng: station.lng,
          label: `${station.name} (${station.estimatedChargingTimeMin}min)`,
          color: station.isOptimal ? '#00FF00' : '#FFA500',
          size: station.isOptimal ? 'large' : 'medium'
        }
      })),
      dynamicChargingRecommendations: dynamicChargingStations, // Now empty when we have actual stops
      errors,
      trafficSummary: finalMetrics.trafficSummary,
      batteryAnalysis: {
        initialPercent: Math.round((initialBatteryKwh / maxBatteryKwh) * 100),
        finalPercent: Math.max(0, Math.round(((initialBatteryKwh - consumptionData.totalConsumptionKwh) / maxBatteryKwh) * 100)),
        minPercent: consumptionData.minBatteryPercent,
        criticalPoints: consumptionData.criticalPoints,
        deficitKwh: Math.max(0, consumptionData.totalConsumptionKwh - initialBatteryKwh),
        chargingNeeded: chargingAnalysis.chargingRequired,
        minimumBatteryAtDestinationPercent: finalMetrics.minBatteryAtDestination,
        userRequestedMinimumPercent: minimumBatteryAtDestinationPercent, // NEW: What user requested
        willMeetRequirement: finalMetrics.minBatteryAtDestination >= minimumBatteryAtDestinationPercent, // NEW: Will we meet it?
        recommendedChargeAtDestination: finalMetrics.recommendedChargeAtDestination
      },
      meta: {
        routeProvider: 'OSRM',
        weatherProvider: 'OpenWeatherMap',
        trafficProvider: process.env.TOMTOM_API_KEY && process.env.TOMTOM_API_KEY !== 'your_tomtom_api_key_here'
          ? 'TomTom Live Traffic'
          : 'Time-based prediction',
        amenitiesProvider: 'LocalDB',
        optimizationAlgorithm: chargingStations.length > 0 ? 'Multi-Algorithm Hybrid' : 'N/A',
        computedAtIso: new Date().toISOString()
      }
    };
    console.log(response)

    res.json(response);

  } catch (error) {
    console.error('❌ Route planning error:', error);
    res.status(500).json({
      success: false,
      message: 'Error planning route',
      error: error.message
    });
  }
});

// Optimized segment creation with dynamic programming
async function createOptimizedSegments(coordinates, targetDistanceM, consumptionRate, degradationPercent, totalDistanceKm) {
  const segments = [];
  let cumulative = 0;
  
  // Use adaptive segmentation based on route length
  const adaptiveDistance = totalDistanceKm > 100 
    ? Math.min(targetDistanceM * 2, 500) 
    : targetDistanceM;

  // Pre-calculate degradation factor
  const degradationFactor = 1 + degradationPercent / 100;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];

    const dist = haversineMeters(lat1, lng1, lat2, lng2);
    cumulative += dist;

    if (cumulative >= adaptiveDistance || i === coordinates.length - 2) {
      const distKm = cumulative / 1000;
      const baseConsumption = distKm * consumptionRate;
      const adjustedConsumption = baseConsumption * degradationFactor;

      segments.push({
        index: segments.length,
        lat: lat2,
        lng: lng2,
        distanceM: cumulative,
        segmentDurationSec: (cumulative / 1000 / 60) * 3600,
        expectedConsumptionKwh: adjustedConsumption,
        weatherPenalty: 0,
        trafficPenalty: 0,
        cumulativeDistanceKm: 0, // Will be calculated later
        batteryLevelPercent: 0 // Will be calculated later
      });

      cumulative = 0;
    }
  }

  // Calculate cumulative distances
  let totalDist = 0;
  for (const segment of segments) {
    totalDist += segment.distanceM / 1000;
    segment.cumulativeDistanceKm = totalDist;
  }

  return segments;
}

// Batch process weather and traffic data
async function enrichSegmentsWithConditions(segments, startTime, consumptionRate, maxBatteryKwh) {
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < segments.length; i += batchSize) {
    batches.push(segments.slice(i, i + batchSize));
  }

  let cumulativeTimeMin = 0;
  const enrichedSegments = [];

  for (const batch of batches) {
    const promises = batch.map(async (segment, idx) => {
      const segmentArrivalTime = new Date(startTime.getTime() + cumulativeTimeMin * 60000);
      
      const [weather, traffic] = await Promise.all([
        getWeatherForCoordinates(segment.lat, segment.lng, segmentArrivalTime),
        getTrafficForCoordinates(segment.lat, segment.lng, segmentArrivalTime)
      ]);

      return { ...segment, weather, traffic, arrivalTime: segmentArrivalTime };
    });

    const results = await Promise.all(promises);
    
    for (const enriched of results) {
      enriched.weatherColor = enriched.weather.color;
      enriched.weatherCondition = enriched.weather.condition;
      enriched.trafficColor = enriched.traffic.color;
      enriched.trafficLevel = enriched.traffic.level;
      enriched.trafficData = enriched.traffic;
      enriched.weatherPenalty = getOptimizedWeatherPenalty(enriched.weather.condition);
      enriched.trafficPenalty = enriched.traffic.batteryPenalty;
      enriched.predictedSpeedKmh = enriched.traffic.speedKmh || 60;

      const segmentDistanceKm = enriched.distanceM / 1000;
      const actualSpeedKmh = enriched.predictedSpeedKmh;
      const trafficAdjustedDurationMin = (segmentDistanceKm / actualSpeedKmh) * 60;

      const trafficDelay = calculateTrafficDelay(
        enriched.trafficData,
        segmentDistanceKm,
        trafficAdjustedDurationMin
      );

      enriched.segmentDurationSec = (trafficAdjustedDurationMin + trafficDelay) * 60;
      enriched.trafficDelayMin = Math.round(trafficDelay * 10) / 10;

      const baseConsumption = enriched.expectedConsumptionKwh;
      enriched.expectedConsumptionKwh = calculateTrafficBatteryImpact(
        enriched.trafficData,
        baseConsumption * (1 + enriched.weatherPenalty)
      );

      cumulativeTimeMin += enriched.segmentDurationSec / 60;
      enriched.cumulativeTimeMin = cumulativeTimeMin;
      enriched.segmentEtaIso = new Date(startTime.getTime() + cumulativeTimeMin * 60000).toISOString();

      enrichedSegments.push(enriched);
    }
  }

  return enrichedSegments;
}

// Calculate cumulative consumption with optimization - FIXED to use actual initial battery
function calculateCumulativeConsumption(segments, maxBatteryKwh, initialBatteryKwh) {
  const cumulativeConsumption = [];
  let totalConsumption = 0;
  let minBatteryPercent = 100;
  const criticalPoints = [];

  for (let i = 0; i < segments.length; i++) {
    totalConsumption += segments[i].expectedConsumptionKwh;
    cumulativeConsumption.push(totalConsumption);
    
    // Calculate ACTUAL battery remaining from initial battery
    const batteryRemaining = initialBatteryKwh - totalConsumption;
    const batteryPercent = Math.max(0, (batteryRemaining / maxBatteryKwh) * 100);
    segments[i].batteryLevelPercent = Math.round(batteryPercent * 10) / 10;
    
    if (batteryPercent < minBatteryPercent) {
      minBatteryPercent = batteryPercent;
    }
    
    if (batteryPercent < 30 && criticalPoints.length < 5) {
      criticalPoints.push({
        index: i,
        lat: segments[i].lat,
        lng: segments[i].lng,
        batteryPercent: Math.round(batteryPercent * 10) / 10,
        distanceFromStart: segments[i].cumulativeDistanceKm
      });
    }
  }

  return {
    totalConsumptionKwh: totalConsumption,
    usagePercent: (totalConsumption / maxBatteryKwh) * 100,
    cumulativeConsumption,
    minBatteryPercent: Math.round(minBatteryPercent * 10) / 10,
    criticalPoints
  };
}

// Analyze charging needs with urgency levels - UPDATED
function analyzeChargingNeeds(totalConsumption, initialBattery, minBuffer, totalDistance, minBatteryAtDestination) {
  // Calculate if we need charging to reach destination with desired battery level
  const batteryNeededForTrip = totalConsumption + minBuffer;
  const batteryNeededForDestination = totalConsumption + minBatteryAtDestination;
  
  // Use the higher requirement (either safe driving buffer or user's destination requirement)
  const totalBatteryNeeded = Math.max(batteryNeededForTrip, batteryNeededForDestination);
  const netBattery = initialBattery - totalBatteryNeeded;
  const chargingRequired = netBattery < 0;
  
  let urgency = 'none';
  if (chargingRequired) {
    if (netBattery < -initialBattery * 0.5) {
      urgency = 'critical';
    } else if (netBattery < -initialBattery * 0.25) {
      urgency = 'high';
    } else {
      urgency = 'moderate';
    }
  }

  console.log(`⚡ Charging Analysis:`);
  console.log(`   Total consumption: ${totalConsumption.toFixed(1)} kWh`);
  console.log(`   Required at destination: ${minBatteryAtDestination.toFixed(1)} kWh`);
  console.log(`   Total needed: ${totalBatteryNeeded.toFixed(1)} kWh`);
  console.log(`   Current battery: ${initialBattery.toFixed(1)} kWh`);
  console.log(`   Deficit: ${Math.abs(Math.min(0, netBattery)).toFixed(1)} kWh`);
  console.log(`   Charging required: ${chargingRequired ? 'YES' : 'NO'} (${urgency})`);

  return {
    chargingRequired,
    urgency,
    deficitKwh: Math.abs(Math.min(0, netBattery)),
    estimatedStops: chargingRequired ? Math.ceil(Math.abs(netBattery) / (initialBattery * 0.7)) : 0,
    requiredBatteryAtDestination: minBatteryAtDestination
  };
}

// Find critical points where charging is needed
function findCriticalChargingPoints(segments, initialBattery, minBuffer, cumulativeConsumption) {
  const criticalPoints = [];
  let currentBattery = initialBattery;

  for (let i = 0; i < segments.length; i++) {
    currentBattery = initialBattery - cumulativeConsumption[i];
    
    if (currentBattery <= minBuffer) {
      criticalPoints.push({
        segmentIndex: i,
        lat: segments[i].lat,
        lng: segments[i].lng,
        batteryAtPoint: currentBattery,
        distanceFromStart: segments[i].cumulativeDistanceKm,
        priority: currentBattery < 0 ? 'critical' : 'high'
      });
    }
  }

  return criticalPoints;
}

// Find optimal stations using multiple strategies
async function findOptimalStations(segments, criticalPoints, maxDetourKm, amenitiesFilter, strategy) {
  const cacheKey = `stations_${JSON.stringify(criticalPoints)}_${maxDetourKm}`;
  
  // Check cache
  if (stationCache.has(cacheKey)) {
    const cached = stationCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ Using cached stations');
      return cached.data;
    }
  }

  let stations = [];
  let algorithm = 'comprehensive-search';

  console.log(`🔍 Searching for stations with ${criticalPoints.length} critical points, maxDetour: ${maxDetourKm}km`);

  // DEBUG: Check what's in the database
  const totalStations = await EVStation.countDocuments({ isOperational: true });
  console.log(`📊 Total operational stations in DB: ${totalStations}`);

  // Strategy 1: Search around ALL critical points first
  if (criticalPoints.length > 0) {
    console.log('📍 Searching around critical points...');
    for (const critical of criticalPoints) {
      try {
        console.log(`   Searching near [${critical.lng}, ${critical.lat}] with radius ${maxDetourKm * 1000 * 2}m`);
        
        const nearbyStations = await EVStation.find({
          isOperational: true,
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [critical.lng, critical.lat]
              },
              $maxDistance: maxDetourKm * 1000 * 2 // Double the radius for critical points
            }
          }
        }).limit(15);
        
        console.log(`   Found ${nearbyStations.length} stations near critical point ${critical.index}`);
        if (nearbyStations.length > 0) {
          console.log(`   Sample: ${nearbyStations[0].name} at [${nearbyStations[0].longitude}, ${nearbyStations[0].latitude}]`);
        }
        stations = stations.concat(nearbyStations);
      } catch (error) {
        console.error(`❌ Error searching near critical point:`, error.message);
        console.error(`   Coordinates: [${critical.lng}, ${critical.lat}]`);
      }
    }
  }

  // Strategy 2: If no critical points, search along route segments
  if (criticalPoints.length === 0 || stations.length < 5) {
    console.log('📍 Searching along route segments...');
    const sampleSegments = [
      segments[0],
      segments[Math.floor(segments.length / 2)],
      segments[segments.length - 1]
    ];
    
    for (const seg of sampleSegments) {
      try {
        console.log(`   Searching near segment [${seg.lng}, ${seg.lat}]`);
        const nearbyStations = await EVStation.find({
          isOperational: true,
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [seg.lng, seg.lat]
              },
              $maxDistance: maxDetourKm * 1000 * 3
            }
          }
        }).limit(10);
        
        console.log(`   Found ${nearbyStations.length} stations`);
        stations = stations.concat(nearbyStations);
      } catch (error) {
        console.error(`❌ Error in segment search:`, error.message);
      }
    }
  }

  // Strategy 3: Fallback - just get closest stations to start/end
  if (stations.length === 0) {
    console.log('⚠️ No stations found with geospatial queries, trying simple distance calculation...');
    try {
      const allStations = await EVStation.find({ isOperational: true }).limit(100);
      console.log(`   Loaded ${allStations.length} stations for manual distance check`);
      
      // Calculate distances manually
      const startPoint = segments[0];
      stations = allStations.map(station => {
        const dist = haversineMeters(
          startPoint.lat, startPoint.lng,
          station.latitude, station.longitude
        ) / 1000;
        return { ...station.toObject(), manualDistance: dist };
      })
      .filter(s => s.manualDistance <= maxDetourKm * 3)
      .sort((a, b) => a.manualDistance - b.manualDistance)
      .slice(0, 30);
      
      console.log(`   Found ${stations.length} stations within ${maxDetourKm * 3}km using manual calculation`);
    } catch (error) {
      console.error('❌ Error in fallback station search:', error.message);
    }
  }

  // Filter by amenities if specified
  if (amenitiesFilter.length > 0) {
    const beforeFilter = stations.length;
    stations = stations.filter(s =>
      amenitiesFilter.some(amenity => s.amenities.includes(amenity))
    );
    console.log(`   Filtered by amenities: ${beforeFilter} -> ${stations.length} stations`);
  }

  // Rank stations by multiple factors
  stations = rankStations(stations, segments, criticalPoints, strategy);

  const result = {
    stations: stations.slice(0, 30),
    algorithm,
    totalFound: stations.length
  };

  // Cache result
  stationCache.set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });

  console.log(`✅ Final station search result: ${result.stations.length} stations (${result.totalFound} total found)`);
  return result;
}

// Optimized weather penalty calculation
function getOptimizedWeatherPenalty(condition) {
  const penalties = {
    cold: 0.15,
    hot: 0.15,
    rain: 0.12,
    snow: 0.20,
    fog: 0.08,
    wind: 0.05
  };
  return penalties[condition] || 0;
}

// Calculate final metrics - FIXED async issue
async function calculateFinalMetrics(segments, totalDistanceKm, chargingStations, startTime, initialBatteryKwh, totalConsumptionKwh, maxBatteryKwh, minBatteryAtDestination) {
  const totalTimeMin = segments[segments.length - 1]?.cumulativeTimeMin || 0;
  const chargingTimeMin = chargingStations.reduce((sum, s) => sum + (s.estimatedChargingTimeMin || 0), 0);
  const totalTrafficDelayMin = segments.reduce((sum, s) => sum + (s.trafficDelayMin || 0), 0);
  
  // Add up charging added during the trip
  const totalChargeAdded = chargingStations.reduce((sum, s) => {
    return sum + ((s.estimatedChargeAddedPercent / 100) * maxBatteryKwh);
  }, 0);
  
  // Calculate battery at destination WITH charging stops
  const batteryAtDestination = Math.max(0, initialBatteryKwh + totalChargeAdded - totalConsumptionKwh);
  const batteryPercentAtDestination = (batteryAtDestination / maxBatteryKwh) * 100;
  
  console.log(`\n🏁 Final Destination Battery:`);
  console.log(`   Initial: ${initialBatteryKwh.toFixed(1)} kWh`);
  console.log(`   Charged during trip: ${totalChargeAdded.toFixed(1)} kWh`);
  console.log(`   Consumed: ${totalConsumptionKwh.toFixed(1)} kWh`);
  console.log(`   Final at destination: ${batteryAtDestination.toFixed(1)} kWh (${batteryPercentAtDestination.toFixed(1)}%)`);
  console.log(`   User requirement: ${minBatteryAtDestination.toFixed(1)} kWh (${((minBatteryAtDestination/maxBatteryKwh)*100).toFixed(1)}%)`);
  
  // Recommend additional charging if below user's requirement
  let recommendedCharge = null;
  if (batteryAtDestination < minBatteryAtDestination) {
    const additionalChargeNeeded = minBatteryAtDestination - batteryAtDestination;
    
    // Find nearest station to destination
    const destSegment = segments[segments.length - 1];
    let nearestStation = null;
    let minDistToStation = Infinity;
    
    // Search for stations near destination
    try {
      const nearbyStations = await EVStation.find({
        isOperational: true,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [destSegment.lng, destSegment.lat]
            },
            $maxDistance: 10000 // 10km radius
          }
        }
      }).limit(1);
      
      if (nearbyStations.length > 0) {
        nearestStation = nearbyStations[0];
        minDistToStation = haversineMeters(
          destSegment.lat, destSegment.lng,
          nearestStation.latitude, nearestStation.longitude
        ) / 1000;
      }
    } catch (error) {
      console.error('Error finding station near destination:', error.message);
    }
    
    recommendedCharge = {
      needed: true,
      additionalKwh: Math.round(additionalChargeNeeded * 10) / 10,
      chargeToPercent: Math.round(((minBatteryAtDestination / maxBatteryKwh) * 100)),
      estimatedTimeMin: Math.round((additionalChargeNeeded / 50) * 60),
      reason: `Need ${additionalChargeNeeded.toFixed(1)} kWh more to reach ${((minBatteryAtDestination/maxBatteryKwh)*100).toFixed(0)}% at destination`,
      nearestStation: nearestStation ? {
        stationId: nearestStation._id,
        name: nearestStation.name,
        distanceKm: Math.round(minDistToStation * 10) / 10,
        powerKw: nearestStation.powerKw
      } : null
    };
    console.log(`   ⚠️ INSUFFICIENT! Need to add ${additionalChargeNeeded.toFixed(1)} kWh more`);
    if (nearestStation) {
      console.log(`   📍 Nearest station: ${nearestStation.name} (${minDistToStation.toFixed(1)}km away)`);
    }
  } else {
    console.log(`   ✅ SUFFICIENT! Will meet requirement.`);
  }
  
  return {
    totalTimeMin: totalTimeMin + chargingTimeMin,
    trafficDelayMin: totalTrafficDelayMin,
    finalEtaIso: new Date(startTime.getTime() + (totalTimeMin + chargingTimeMin) * 60000).toISOString(),
    finalBatteryKwh: batteryAtDestination,
    minBatteryAtDestination: Math.round(batteryPercentAtDestination * 10) / 10,
    recommendedChargeAtDestination: recommendedCharge,
    trafficSummary: {
      totalDelayMinutes: Math.round(totalTrafficDelayMin * 10) / 10,
      averageSpeedKmh: Math.round((totalDistanceKm / ((totalTimeMin - totalTrafficDelayMin) / 60)) * 10) / 10,
      severeSegments: segments.filter(s => s.trafficLevel === 'severe').length,
      heavySegments: segments.filter(s => s.trafficLevel === 'heavy').length,
      moderateSegments: segments.filter(s => s.trafficLevel === 'moderate').length,
      freeFlowSegments: segments.filter(s => s.trafficLevel === 'free').length
    }
  };
}

// Enhanced greedy algorithm with look-ahead - FIXED to check reachability
function enhancedGreedyChargingStops(segments, stations, maxBattery, initialBattery, minBatteryAtDestination, consumptionRate, criticalPoints) {
  const stops = [];
  let currentBattery = initialBattery;
  let currentSegmentIndex = 0;
  const minSafeBattery = maxBattery * 0.05; // 5% minimum safety buffer
  
  console.log(`\n🔋 Enhanced Greedy Algorithm Starting:`);
  console.log(`   Initial battery: ${currentBattery.toFixed(1)} kWh`);
  console.log(`   Required at destination: ${minBatteryAtDestination.toFixed(1)} kWh`);
  console.log(`   Minimum safe battery: ${minSafeBattery.toFixed(1)} kWh (5%)`);
  console.log(`   Stations available: ${stations.length}`);
  
  // Calculate total consumption needed
  let totalConsumptionNeeded = 0;
  for (const seg of segments) {
    totalConsumptionNeeded += seg.expectedConsumptionKwh;
  }
  
  const totalBatteryNeeded = totalConsumptionNeeded + minBatteryAtDestination;
  console.log(`   Total consumption: ${totalConsumptionNeeded.toFixed(1)} kWh`);
  console.log(`   Total battery needed: ${totalBatteryNeeded.toFixed(1)} kWh`);
  console.log(`   Deficit: ${Math.max(0, totalBatteryNeeded - initialBattery).toFixed(1)} kWh`);
  
  // If we need charging, force at least one stop
  const needsCharging = (initialBattery - totalBatteryNeeded) < 0;
  
  if (!needsCharging) {
    console.log(`   ✅ No charging needed!`);
    return { chargingStops: [] };
  }
  
  // Find optimal charging stop(s) - WITH REACHABILITY CHECK
  let remainingDeficit = totalBatteryNeeded - initialBattery;
  let attemptCount = 0;
  const maxAttempts = 3; // Maximum 3 charging stops
  
  while (remainingDeficit > 0 && attemptCount < maxAttempts && stations.length > 0) {
    console.log(`\n   🔍 Finding charging stop #${attemptCount + 1}...`);
    console.log(`   Current battery: ${currentBattery.toFixed(1)} kWh`);
    console.log(`   Current position: segment ${currentSegmentIndex}/${segments.length}`);
    console.log(`   Remaining deficit: ${remainingDeficit.toFixed(1)} kWh`);
    
    // Find best REACHABLE station
    let bestStation = null;
    let bestScore = -Infinity;
    const reachableStations = [];
    
    for (const station of stations) {
      // Calculate consumption to reach this station
      let closestSegmentIndex = currentSegmentIndex;
      let minDist = Infinity;
      
      for (let i = currentSegmentIndex; i < segments.length; i++) {
        const dist = haversineMeters(
          segments[i].lat, segments[i].lng,
          station.latitude, station.longitude
        );
        
        if (dist < minDist) {
          minDist = dist;
          closestSegmentIndex = i;
        }
      }
      
      // Calculate consumption to reach station
      let consumptionToStation = 0;
      for (let i = currentSegmentIndex; i < closestSegmentIndex; i++) {
        consumptionToStation += segments[i].expectedConsumptionKwh;
      }
      
      // Add detour consumption (to station and back to route)
      const detourKm = (minDist / 1000);
      const detourConsumption = detourKm * consumptionRate * 1.2; // 20% buffer for detour
      consumptionToStation += detourConsumption;
      
      // CHECK REACHABILITY - Can we reach this station with current battery?
      const batteryAtStation = currentBattery - consumptionToStation;
      const isReachable = batteryAtStation >= minSafeBattery;
      
      if (!isReachable) {
        console.log(`   ❌ UNREACHABLE: ${station.name} - need ${consumptionToStation.toFixed(1)} kWh, have ${currentBattery.toFixed(1)} kWh, would arrive with ${batteryAtStation.toFixed(1)} kWh`);
        continue;
      }
      
      reachableStations.push({
        station,
        segmentIndex: closestSegmentIndex,
        distanceKm: detourKm,
        consumptionToStation,
        batteryAtStation
      });
      
      // Calculate optimal position (around 1/3 to 2/3 of route is best)
      const routePosition = closestSegmentIndex / segments.length;
      const idealPosition = 0.4 + (attemptCount * 0.2); // 0.4, 0.6, 0.8 for stop 1, 2, 3
      const positionScore = 100 - Math.abs(routePosition - idealPosition) * 200;
      
      // Distance penalty (prefer closer stations)
      const distanceScore = Math.max(0, 100 - detourKm * 5);
      
      // Charging speed bonus
      const powerScore = (station.powerKw / 50) * 30;
      
      // Battery margin bonus (prefer stations we can reach comfortably)
      const batteryMargin = batteryAtStation - minSafeBattery;
      const batteryMarginScore = Math.min(50, (batteryMargin / maxBattery) * 100);
      
      // Calculate final score
      const score = positionScore + distanceScore + powerScore + batteryMarginScore + (station.score || 0);
      
      if (score > bestScore && detourKm < 20) { // Max 20km detour
        bestScore = score;
        bestStation = {
          station,
          segmentIndex: closestSegmentIndex,
          distanceKm: detourKm,
          consumptionToStation,
          batteryAtStation,
          score
        };
      }
    }
    
    console.log(`   📊 Found ${reachableStations.length} reachable stations out of ${stations.length} total`);
    
    if (!bestStation) {
      console.error(`\n   ❌ CRITICAL: No reachable charging station found!`);
      console.error(`   Current battery: ${currentBattery.toFixed(1)} kWh`);
      console.error(`   Position: segment ${currentSegmentIndex}/${segments.length}`);
      console.error(`   Remaining distance: ${((segments.length - currentSegmentIndex) * 0.2).toFixed(1)} km (approx)`);
      
      // Return error with details
      return {
        chargingStops: stops,
        error: {
          code: 'UNREACHABLE_CHARGING',
          message: 'Cannot reach any charging station with remaining battery',
          details: {
            currentBatteryKwh: Math.round(currentBattery * 10) / 10,
            currentBatteryPercent: Math.round((currentBattery / maxBattery) * 100),
            position: `${currentSegmentIndex}/${segments.length} segments`,
            nearestStations: reachableStations.length === 0 
              ? stations.slice(0, 3).map(s => ({
                  name: s.name,
                  distanceKm: Math.round(haversineMeters(segments[currentSegmentIndex].lat, segments[currentSegmentIndex].lng, s.latitude, s.longitude) / 100) / 10,
                  estimatedConsumptionKwh: 'UNREACHABLE'
                }))
              : reachableStations.slice(0, 3).map(s => ({
                  name: s.station.name,
                  distanceKm: Math.round(s.distanceKm * 10) / 10,
                  requiredBatteryKwh: Math.round(s.consumptionToStation * 10) / 10
                })),
            recommendation: currentBattery < maxBattery * 0.15 
              ? 'Charge vehicle now before starting trip'
              : 'Increase initial battery percentage or reduce destination battery requirement'
          }
        }
      };
    }
    
    // Calculate charging amount needed
    const chargeAmount = Math.min(
      maxBattery * 0.8, // Charge to 80% max
      maxBattery - bestStation.batteryAtStation + remainingDeficit + (maxBattery * 0.1) // Add 10% buffer
    );
    
    console.log(`   ✅ Selected: ${bestStation.station.name}`);
    console.log(`   Position: ${bestStation.segmentIndex}/${segments.length} (${((bestStation.segmentIndex/segments.length)*100).toFixed(0)}%)`);
    console.log(`   Distance: ${bestStation.distanceKm.toFixed(2)} km from route`);
    console.log(`   Consumption to reach: ${bestStation.consumptionToStation.toFixed(2)} kWh`);
    console.log(`   Battery on arrival: ${bestStation.batteryAtStation.toFixed(1)} kWh (${((bestStation.batteryAtStation/maxBattery)*100).toFixed(0)}%)`);
    console.log(`   Charging: ${chargeAmount.toFixed(1)} kWh`);
    
    stops.push({
      nodeId: bestStation.station._id.toString(),
      chargeTimeMin: (chargeAmount / (bestStation.station.powerKw || 50)) * 60,
      chargeAddedKwh: chargeAmount,
      segmentIndex: bestStation.segmentIndex,
      station: bestStation.station,
      batteryBefore: bestStation.batteryAtStation,
      batteryAfter: bestStation.batteryAtStation + chargeAmount
    });
    
    currentBattery = bestStation.batteryAtStation + chargeAmount;
    remainingDeficit = totalBatteryNeeded - (initialBattery + stops.reduce((sum, s) => sum + s.chargeAddedKwh, 0));
    currentSegmentIndex = bestStation.segmentIndex;
    attemptCount++;
  }
  
  console.log(`\n   📊 Final: ${stops.length} charging stops planned`);
  stops.forEach((stop, i) => {
    console.log(`      ${i+1}. ${stop.station.name} - ${stop.chargeAddedKwh.toFixed(1)} kWh (${stop.chargeTimeMin.toFixed(0)} min)`);
  });
  
  return { chargingStops: stops };
}

// Format enhanced charging stations with additional data
async function formatEnhancedChargingStations(stops, candidateStations, chargingSpeedKw, maxBatteryKwh, segments) {
  return Promise.all(stops.map(async (stop, index) => {
    const station = candidateStations.find(s => s._id.toString() === stop.nodeId) || stop.station;
    if (!station) return null;

    // Find closest segment for accurate positioning
    let closestSegment = segments[0];
    let minDist = Infinity;
    let segmentIndex = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const dist = haversineMeters(
        segments[i].lat, segments[i].lng,
        station.latitude, station.longitude
      );
      if (dist < minDist) {
        minDist = dist;
        closestSegment = segments[i];
        segmentIndex = i;
      }
    }

    return {
      stationId: station._id,
      name: station.name,
      lat: station.latitude,
      lng: station.longitude,
      distanceFromRouteM: Math.round(minDist),
      detourExtraTimeMin: Math.round((minDist / 1000 / 60) * 60 * 2), // Round trip
      etaAtStationMin: Math.round(closestSegment.cumulativeTimeMin || 0),
      estimatedChargingTimeMin: Math.round(stop.chargeTimeMin),
      estimatedChargeAddedPercent: Math.round((stop.chargeAddedKwh / maxBatteryKwh) * 100),
      batteryOnArrivalPercent: Math.round(((stop.batteryBefore || 0) / maxBatteryKwh) * 100),
      batteryOnDeparturePercent: Math.round(((stop.batteryAfter || stop.batteryBefore + stop.chargeAddedKwh) / maxBatteryKwh) * 100),
      chargers: station.chargers || [{ 
        type: station.type === 'ultra-fast' ? 'CCS-350kW' : 
              station.type === 'rapid' ? 'CCS-150kW' : 
              station.type === 'fast' ? 'CCS-50kW' : 'Type2',
        powerKw: station.powerKw || 50,
        available: station.numberOfChargers || 1
      }],
      amenities: station.amenitiesDetail || station.amenities.map(a => ({
        name: a,
        type: a,
        available: true
      })),
      isOptimal: index === 0, // First stop is most optimal
      stopOrder: index + 1,
      notes: `Stop ${index + 1}: ${station.type || 'fast'} charging station with ${station.numberOfChargers || 1} chargers`,
      realTimeAvailability: station.numberOfChargers > 0 ? 'available' : 'unknown'
    };
  }).filter(Boolean));
}

// Rank stations by multiple factors
function rankStations(stations, segments, criticalPoints, strategy) {
  return stations.map(station => {
    let score = 0;
    
    // Convert to plain object if it's a Mongoose document
    const stationObj = station.toObject ? station.toObject() : station;
    
    // Distance to critical points
    for (const critical of criticalPoints) {
      const dist = haversineMeters(
        stationObj.latitude, stationObj.longitude,
        critical.lat, critical.lng
      ) / 1000;
      score += (10 - Math.min(10, dist)) * (critical.priority === 'critical' ? 2 : 1);
    }
    
    // Power rating bonus
    score += (stationObj.powerKw / 50) * 5;
    
    // Amenities bonus
    score += (stationObj.amenities?.length || 0) * 2;
    
    // Number of chargers bonus
    score += Math.min(5, stationObj.numberOfChargers || 0) * 3;
    
    // Strategy-specific adjustments
    if (strategy === 'time') {
      score += (stationObj.powerKw / 10); // Prioritize faster charging
    } else if (strategy === 'cost') {
      score += (stationObj.amenities?.includes('free') ? 20 : 0);
    }
    
    return { ...stationObj, score };
  }).sort((a, b) => b.score - a.score);
}

// Haversine distance calculation
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

// Insert charging stops into route
function insertChargingStopsIntoRoute(segments, chargingStations, initialBattery, maxBattery, consumptionRate) {
  if (chargingStations.length === 0) return segments;
  
  console.log(`\n🔌 Inserting ${chargingStations.length} charging stops into route...`);
  
  const newSegments = [...segments];
  let insertedCount = 0;
  
  for (const station of chargingStations) {
    let bestSegmentIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < newSegments.length; i++) {
      const dist = haversineMeters(
        newSegments[i].lat, newSegments[i].lng,
        station.lat, station.lng
      ) / 1000;
      
      if (dist < minDistance) {
        minDistance = dist;
        bestSegmentIndex = i;
      }
    }
    
    const chargingSegment = {
      ...newSegments[bestSegmentIndex],
      index: bestSegmentIndex + insertedCount,
      lat: station.lat,
      lng: station.lng,
      distanceM: minDistance * 1000,
      isChargingStop: true,
      stationId: station.stationId,
      stationName: station.name,
      chargingTimeMin: station.estimatedChargingTimeMin,
      chargeAddedPercent: station.estimatedChargeAddedPercent,
      batteryOnArrivalPercent: station.batteryOnArrivalPercent,
      batteryOnDeparturePercent: station.batteryOnDeparturePercent,
      expectedConsumptionKwh: 0,
      weatherColor: '#00FF00',
      weatherCondition: 'charging',
      trafficColor: '#00FF00',
      trafficLevel: 'charging',
      segmentDurationSec: station.estimatedChargingTimeMin * 60,
      trafficDelayMin: 0,
      batteryLevelPercent: station.batteryOnDeparturePercent
    };
    
    newSegments.splice(bestSegmentIndex + 1 + insertedCount, 0, chargingSegment);
    insertedCount++;
    
    console.log(`   ✅ Inserted ${station.name} at position ${bestSegmentIndex + insertedCount} (${minDistance.toFixed(2)}km from route)`);
  }
  
  newSegments.forEach((seg, i) => seg.index = i);
  
  console.log(`✅ Route now has ${newSegments.length} segments (${segments.length} original + ${insertedCount} charging stops)`);
  return newSegments;
}

module.exports = exports;