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

// ============================================================================
// PLUGGABLE ALGORITHMS - INLINE IMPLEMENTATION
// ============================================================================

const algorithmsConfig = {
  WEIGHTS: {
    travelTimeWeight: 1.0,
    chargingTimeWeight: 1.2,
    detourWeight: 2.0,
    trafficDelayWeight: 0.8,
    weatherPenaltyWeight: 0.5,
    stationReliabilityWeight: 0.3
  },
  PLANNER_TIMEOUT_MS: 5000,
  INFEASIBLE_PENALTY: 100000,
  DESTINATION_MISS_PENALTY: 50000
};

// Simple rule-based planner
async function simpleRuleBasedPlanner(segments, stations, maxBatteryKwh, initialBatteryKwh, minBatteryAtDestination, consumptionRate, criticalPoints) {
  const plannerName = 'SimpleRuleBased';
  console.log(`🔧 ${plannerName}: Starting...`);

  const chargingStops = [];
  let totalConsumption = 0;
  for (const seg of segments) {
    totalConsumption += seg.expectedConsumptionKwh;
  }

  if (initialBatteryKwh < totalConsumption + minBatteryAtDestination) {
    const midSegment = segments[Math.floor(segments.length / 2)];
    let nearestStation = null;
    let minDist = Infinity;

    for (const station of stations) {
      const dist = haversineMeters(midSegment.lat, midSegment.lng, station.latitude, station.longitude);
      if (dist < minDist) {
        minDist = dist;
        nearestStation = station;
      }
    }

    if (nearestStation) {
      const chargeNeeded = totalConsumption + minBatteryAtDestination - initialBatteryKwh;
      const chargeAmount = Math.min(maxBatteryKwh * 0.8, chargeNeeded + maxBatteryKwh * 0.1);

      chargingStops.push({
        nodeId: nearestStation._id.toString(),
        chargeTimeMin: (chargeAmount / (nearestStation.powerKw || 50)) * 60,
        chargeAddedKwh: chargeAmount,
        segmentIndex: Math.floor(segments.length / 2),
        station: nearestStation,
        batteryBefore: initialBatteryKwh - totalConsumption / 2,
        batteryAfter: initialBatteryKwh - totalConsumption / 2 + chargeAmount
      });
    }
  }

  const metrics = calculatePlanMetrics(segments, chargingStops, stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
  console.log(`✅ ${plannerName}: ${chargingStops.length} stops, cost=${metrics.rawScoreDetails.totalCost.toFixed(2)}`);
  return { chargingStops, metrics };
}

// Greedy planner
async function greedyPlanner(segments, stations, maxBatteryKwh, initialBatteryKwh, minBatteryAtDestination, consumptionRate, criticalPoints) {
  const plannerName = 'Greedy';
  console.log(`🔧 ${plannerName}: Starting...`);

  const stops = [];
  let currentBattery = initialBatteryKwh;
  let currentSegmentIndex = 0;
  const minSafeBattery = maxBatteryKwh * 0.05;

  let totalConsumptionNeeded = 0;
  for (const seg of segments) {
    totalConsumptionNeeded += seg.expectedConsumptionKwh;
  }

  const totalBatteryNeeded = totalConsumptionNeeded + minBatteryAtDestination;
  const needsCharging = (initialBatteryKwh - totalBatteryNeeded) < 0;

  if (!needsCharging) {
    const metrics = calculatePlanMetrics(segments, [], stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
    return { chargingStops: [], metrics };
  }

  let remainingDeficit = totalBatteryNeeded - initialBatteryKwh;
  let attemptCount = 0;
  const maxAttempts = 3;

  while (remainingDeficit > 0 && attemptCount < maxAttempts && stations.length > 0) {
    let bestStation = null;
    let bestScore = -Infinity;

    for (const station of stations) {
      // Skip if this exact station is already in stops (prevent exact duplicates only)
      if (stops.some(s => s.nodeId === station._id.toString())) {
        continue;
      }

      let closestSegmentIndex = currentSegmentIndex;
      let minDist = Infinity;

      for (let i = currentSegmentIndex; i < segments.length; i++) {
        const dist = haversineMeters(segments[i].lat, segments[i].lng, station.latitude, station.longitude);
        if (dist < minDist) {
          minDist = dist;
          closestSegmentIndex = i;
        }
      }

      let consumptionToStation = 0;
      for (let i = currentSegmentIndex; i < closestSegmentIndex; i++) {
        consumptionToStation += segments[i].expectedConsumptionKwh;
      }

      const detourKm = (minDist / 1000);
      const detourConsumption = detourKm * consumptionRate * 1.2;
      consumptionToStation += detourConsumption;

      const batteryAtStation = currentBattery - consumptionToStation;
      const isReachable = batteryAtStation >= minSafeBattery;

      if (!isReachable || detourKm > 20) continue;

      const routePosition = closestSegmentIndex / segments.length;
      const idealPosition = 0.4 + (attemptCount * 0.2);
      const positionScore = 100 - Math.abs(routePosition - idealPosition) * 200;
      const distanceScore = Math.max(0, 100 - detourKm * 5);
      const powerScore = (station.powerKw / 50) * 30;
      const batteryMargin = batteryAtStation - minSafeBattery;
      const batteryMarginScore = Math.min(50, (batteryMargin / maxBatteryKwh) * 100);

      const score = positionScore + distanceScore + powerScore + batteryMarginScore + (station.score || 0);

      if (score > bestScore) {
        bestScore = score;
        bestStation = { station, segmentIndex: closestSegmentIndex, distanceKm: detourKm, consumptionToStation, batteryAtStation, score };
      }
    }

    if (!bestStation) {
      console.log(`  ⚠️ No suitable station found at attempt ${attemptCount + 1}`);
      break;
    }

    const currentBatteryPercent = (bestStation.batteryAtStation / maxBatteryKwh) * 100;

    // Calculate optimal charge amount
    const targetBatteryPercent = 80; // Charge to 80% for optimal fast charging
    const chargePercentNeeded = Math.max(0, targetBatteryPercent - currentBatteryPercent);

    if (chargePercentNeeded <= 5) {
      console.log(`  ⚠️ Battery already at ${currentBatteryPercent.toFixed(1)}%, minimal charge needed - moving to next segment`);
      currentSegmentIndex = bestStation.segmentIndex + 1;
      attemptCount++;
      continue;
    }

    // Charge enough to cover remaining deficit OR reach 80%, whichever is less
    const chargeToMeetDeficit = remainingDeficit;
    const chargeToTarget = (chargePercentNeeded / 100) * maxBatteryKwh;
    const chargeAmount = Math.min(chargeToMeetDeficit, chargeToTarget);

    const batteryAfter = bestStation.batteryAtStation + chargeAmount;
    const batteryAfterPercent = (batteryAfter / maxBatteryKwh) * 100;

    // Final safety check - cap at 100%
    if (batteryAfterPercent > 100) {
      const adjustedChargeAmount = maxBatteryKwh - bestStation.batteryAtStation;
      if (adjustedChargeAmount <= 0) {
        console.log(`  ⚠️ Battery already full at ${currentBatteryPercent.toFixed(1)}%`);
        currentSegmentIndex = bestStation.segmentIndex + 1;
        attemptCount++;
        continue;
      }
    }

    console.log(`  ✅ Stop ${stops.length + 1}: ${bestStation.station.name}`);
    console.log(`     Battery: ${currentBatteryPercent.toFixed(1)}% → ${batteryAfterPercent.toFixed(1)}% (+${chargeAmount.toFixed(1)} kWh)`);
    console.log(`     Remaining deficit: ${remainingDeficit.toFixed(1)} kWh → ${(remainingDeficit - chargeAmount).toFixed(1)} kWh`);

    stops.push({
      nodeId: bestStation.station._id.toString(),
      chargeTimeMin: (chargeAmount / (bestStation.station.powerKw || 50)) * 60,
      chargeAddedKwh: chargeAmount,
      segmentIndex: bestStation.segmentIndex,
      station: bestStation.station,
      batteryBefore: bestStation.batteryAtStation,
      batteryAfter: batteryAfter
    });

    currentBattery = batteryAfter;
    remainingDeficit = totalBatteryNeeded - (initialBatteryKwh + stops.reduce((sum, s) => sum + s.chargeAddedKwh, 0));
    currentSegmentIndex = bestStation.segmentIndex + 1; // Move past this station
    attemptCount++;
  }

  const metrics = calculatePlanMetrics(segments, stops, stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
  console.log(`✅ ${plannerName}: ${stops.length} stops, deficit covered: ${(totalBatteryNeeded - remainingDeficit).toFixed(1)}/${totalBatteryNeeded.toFixed(1)} kWh`);
  return { chargingStops: stops, metrics };
}

// Dynamic programming planner
async function dpPlanner(segments, stations, maxBatteryKwh, initialBatteryKwh, minBatteryAtDestination, consumptionRate, criticalPoints) {
  const plannerName = 'DynamicProgramming';
  console.log(`🔧 ${plannerName}: Starting...`);

  const batterySteps = 10;
  const segmentSamples = Math.min(50, segments.length);
  const sampledSegments = [];
  const sampleInterval = Math.max(1, Math.floor(segments.length / segmentSamples));

  for (let i = 0; i < segments.length; i += sampleInterval) {
    sampledSegments.push({ ...segments[i], originalIndex: i });
  }

  const dp = Array(sampledSegments.length).fill(null).map(() =>
    Array(batterySteps + 1).fill(null).map(() => ({ cost: Infinity, path: [] }))
  );

  const startBatteryLevel = Math.round((initialBatteryKwh / maxBatteryKwh) * batterySteps);
  dp[0][startBatteryLevel] = { cost: 0, path: [] };

  for (let i = 0; i < sampledSegments.length - 1; i++) {
    for (let b = 0; b <= batterySteps; b++) {
      if (dp[i][b].cost === Infinity) continue;

      const currentBatteryKwh = (b / batterySteps) * maxBatteryKwh;
      const nextSegment = sampledSegments[i + 1];

      let consumption = 0;
      for (let j = sampledSegments[i].originalIndex; j < nextSegment.originalIndex && j < segments.length; j++) {
        consumption += segments[j].expectedConsumptionKwh;
      }

      const batteryAfterTravel = currentBatteryKwh - consumption;
      const nextBatteryLevel = Math.round((batteryAfterTravel / maxBatteryKwh) * batterySteps);

      if (nextBatteryLevel >= 0 && nextBatteryLevel <= batterySteps) {
        const travelCost = consumption * 0.1;
        const newCost = dp[i][b].cost + travelCost;

        if (newCost < dp[i + 1][nextBatteryLevel].cost) {
          dp[i + 1][nextBatteryLevel] = { cost: newCost, path: [...dp[i][b].path] };
        }
      }

      const nearbyStations = stations.filter(station => {
        const dist = haversineMeters(sampledSegments[i].lat, sampledSegments[i].lng, station.latitude, station.longitude);

        // Only prevent exact duplicate stations
        const alreadyUsed = dp[i][b].path.some(existingStop =>
          existingStop.nodeId === station._id.toString()
        );

        return dist / 1000 < 15 && !alreadyUsed;
      });

      for (const station of nearbyStations.slice(0, 3)) {
        // Target 80% battery after charging
        const maxTargetLevel = Math.round(0.8 * batterySteps);
        const targetChargeLevel = Math.min(maxTargetLevel, b + 5);

        for (let chargeLevel = b + 1; chargeLevel <= targetChargeLevel; chargeLevel++) {
          if (chargeLevel > batterySteps) continue;

          const chargedBatteryKwh = (chargeLevel / batterySteps) * maxBatteryKwh;
          const chargeAdded = chargedBatteryKwh - currentBatteryKwh;

          const chargingTime = (chargeAdded / (station.powerKw || 50)) * 60;
          const chargingCost = chargingTime * 1.5;

          const batteryAfterTravelFromCharge = chargedBatteryKwh - consumption;
          const nextBatteryLevelAfterCharge = Math.round((batteryAfterTravelFromCharge / maxBatteryKwh) * batterySteps);

          if (nextBatteryLevelAfterCharge >= 0 && nextBatteryLevelAfterCharge <= batterySteps) {
            const newCost = dp[i][b].cost + chargingCost + consumption * 0.1;

            if (newCost < dp[i + 1][nextBatteryLevelAfterCharge].cost) {
              dp[i + 1][nextBatteryLevelAfterCharge] = {
                cost: newCost,
                path: [...dp[i][b].path, {
                  nodeId: station._id.toString(), chargeTimeMin: chargingTime, chargeAddedKwh: chargeAdded,
                  segmentIndex: sampledSegments[i].originalIndex, station,
                  batteryBefore: currentBatteryKwh, batteryAfter: chargedBatteryKwh
                }]
              };
            }
          }
        }
      }
    }
  }

  const minFinalBatteryLevel = Math.ceil((minBatteryAtDestination / maxBatteryKwh) * batterySteps);
  let bestFinalCost = Infinity;
  let bestPath = [];

  for (let b = minFinalBatteryLevel; b <= batterySteps; b++) {
    if (dp[sampledSegments.length - 1][b].cost < bestFinalCost) {
      bestFinalCost = dp[sampledSegments.length - 1][b].cost;
      bestPath = dp[sampledSegments.length - 1][b].path;
    }
  }

  const metrics = calculatePlanMetrics(segments, bestPath, stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
  console.log(`✅ ${plannerName}: ${bestPath.length} stops, cost=${metrics.rawScoreDetails.totalCost.toFixed(2)}`);
  return { chargingStops: bestPath, metrics };
}

// A* graph search planner
async function graphAStarPlanner(segments, stations, maxBatteryKwh, initialBatteryKwh, minBatteryAtDestination, consumptionRate, criticalPoints) {
  const plannerName = 'GraphAStar';
  console.log(`🔧 ${plannerName}: Starting...`);

  const openSet = [];
  const closedSet = new Set();
  const batteryQuantization = maxBatteryKwh / 20;

  const estimateHeuristic = (segmentIndex, batteryKwh) => {
    let remainingConsumption = 0;
    for (let i = segmentIndex; i < segments.length; i++) {
      remainingConsumption += segments[i].expectedConsumptionKwh || 0;
    }
    const batteryDeficit = Math.max(0, remainingConsumption + minBatteryAtDestination - batteryKwh);
    return Math.ceil(batteryDeficit / (maxBatteryKwh * 0.5)) * 30;
  };

  const startState = {
    segmentIndex: 0, batteryKwh: initialBatteryKwh, cost: 0,
    heuristic: estimateHeuristic(0, initialBatteryKwh), path: []
  };
  openSet.push(startState);

  let iterations = 0;
  const maxIterations = 1000;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    openSet.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
    const current = openSet.shift();

    const stateKey = `${current.segmentIndex}_${Math.round(current.batteryKwh / batteryQuantization)}`;
    if (closedSet.has(stateKey)) continue;
    closedSet.add(stateKey);

    if (current.segmentIndex >= segments.length - 1 && current.batteryKwh >= minBatteryAtDestination) {
      const metrics = calculatePlanMetrics(segments, current.path, stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
      console.log(`✅ ${plannerName}: ${current.path.length} stops, iterations=${iterations}`);
      return { chargingStops: current.path, metrics };
    }

    const nextSegmentIndex = Math.min(current.segmentIndex + 1, segments.length - 1);
    if (nextSegmentIndex < segments.length) {
      const consumption = segments[current.segmentIndex].expectedConsumptionKwh || 0;
      const newBattery = current.batteryKwh - consumption;

      if (newBattery >= 0) {
        openSet.push({
          segmentIndex: nextSegmentIndex, batteryKwh: newBattery, cost: current.cost + 1,
          heuristic: estimateHeuristic(nextSegmentIndex, newBattery), path: [...current.path]
        });
      }

      const nearbyStations = stations.filter(station => {
        const dist = haversineMeters(segments[current.segmentIndex].lat, segments[current.segmentIndex].lng, station.latitude, station.longitude);
        return dist / 1000 < 10;
      }).slice(0, 2);

      for (const station of nearbyStations) {
        const chargeAmount = Math.min(maxBatteryKwh * 0.8 - current.batteryKwh, maxBatteryKwh * 0.5);
        if (chargeAmount > 0) {
          const chargedBattery = current.batteryKwh + chargeAmount;
          const chargingTime = (chargeAmount / (station.powerKw || 50)) * 60;
          const newBatteryAfterTravel = chargedBattery - consumption;

          if (newBatteryAfterTravel >= 0) {
            openSet.push({
              segmentIndex: nextSegmentIndex, batteryKwh: newBatteryAfterTravel, cost: current.cost + chargingTime * 0.5,
              heuristic: estimateHeuristic(nextSegmentIndex, newBatteryAfterTravel),
              path: [...current.path, {
                nodeId: station._id.toString(), chargeTimeMin: chargingTime, chargeAddedKwh: chargeAmount,
                segmentIndex: current.segmentIndex, station,
                batteryBefore: current.batteryKwh, batteryAfter: chargedBattery
              }]
            });
          }
        }
      }
    }
  }

  console.log(`⚠️ ${plannerName}: No solution after ${iterations} iterations`);
  const metrics = calculatePlanMetrics(segments, [], stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName);
  metrics.rawScoreDetails.totalCost += algorithmsConfig.INFEASIBLE_PENALTY;
  return { chargingStops: [], metrics };
}

// Calculate metrics for a plan
function calculatePlanMetrics(segments, chargingStops, stations, initialBatteryKwh, minBatteryAtDestination, maxBatteryKwh, plannerName) {
  let travelTimeMin = 0, chargingTimeMin = 0, detourKm = 0, trafficDelayMin = 0, weatherPenalty = 0;

  for (const seg of segments) {
    travelTimeMin += (seg.segmentDurationSec || 0) / 60;
    trafficDelayMin += seg.trafficDelayMin || 0;
    weatherPenalty += seg.weatherPenalty || 0;
  }

  for (const stop of chargingStops) {
    chargingTimeMin += stop.chargeTimeMin || 0;
    if (stop.segmentIndex < segments.length) {
      const seg = segments[stop.segmentIndex];
      const dist = haversineMeters(seg.lat, seg.lng, stop.station.latitude, stop.station.longitude);
      detourKm += (dist / 1000) * 2;
    }
  }

  let stationReliabilityScore = 0;
  for (const stop of chargingStops) {
    stationReliabilityScore += (stop.station.score || 50);
  }
  stationReliabilityScore = chargingStops.length > 0 ? stationReliabilityScore / chargingStops.length : 100;

  let totalConsumption = 0;
  for (const seg of segments) {
    totalConsumption += seg.expectedConsumptionKwh;
  }

  const totalChargeAdded = chargingStops.reduce((sum, s) => sum + (s.chargeAddedKwh || 0), 0);
  const batteryAtDestination = Math.min(maxBatteryKwh, initialBatteryKwh + totalChargeAdded - totalConsumption); // Cap at 100%
  const meetsDestinationRequirement = batteryAtDestination >= minBatteryAtDestination;

  return {
    travelTimeMin: Math.round(travelTimeMin * 10) / 10,
    chargingTimeMin: Math.round(chargingTimeMin * 10) / 10,
    detourKm: Math.round(detourKm * 10) / 10,
    trafficDelayMin: Math.round(trafficDelayMin * 10) / 10,
    weatherPenalty: Math.round(weatherPenalty * 100) / 100,
    stationReliabilityScore: Math.round(stationReliabilityScore * 10) / 10,
    meetsDestinationRequirement, plannerName,
    rawScoreDetails: {
      travelTimeMin, chargingTimeMin, detourKm, trafficDelayMin, weatherPenalty,
      stationReliabilityScore, batteryAtDestination: Math.round(batteryAtDestination * 10) / 10, totalCost: 0
    }
  };
}

// Evaluate plan and compute cost
function evaluatePlan(plan, segments, userConstraints, weights = algorithmsConfig.WEIGHTS) {
  const metrics = plan.metrics;
  let cost = 0;
  cost += metrics.travelTimeMin * weights.travelTimeWeight;
  cost += metrics.chargingTimeMin * weights.chargingTimeWeight;
  cost += metrics.detourKm * weights.detourWeight;
  cost += metrics.trafficDelayMin * weights.trafficDelayWeight;
  cost += metrics.weatherPenalty * 100 * weights.weatherPenaltyWeight;
  cost += (100 - metrics.stationReliabilityScore) * weights.stationReliabilityWeight;

  if (!metrics.meetsDestinationRequirement) {
    cost += algorithmsConfig.DESTINATION_MISS_PENALTY;
  }

  let batteryTracker = userConstraints.initialBatteryKwh;
  let isReachable = true;

  for (let i = 0; i < plan.chargingStops.length; i++) {
    const stop = plan.chargingStops[i];
    let consumption = 0;
    const startIdx = i === 0 ? 0 : plan.chargingStops[i - 1].segmentIndex;
    const endIdx = stop.segmentIndex;

    for (let j = startIdx; j < endIdx && j < segments.length; j++) {
      consumption += segments[j].expectedConsumptionKwh || 0;
    }

    batteryTracker -= consumption;
    if (batteryTracker < userConstraints.minSafeBattery) {
      isReachable = false;
      break;
    }
    batteryTracker += stop.chargeAddedKwh || 0;
  }

  if (!isReachable) {
    cost += algorithmsConfig.INFEASIBLE_PENALTY;
  }

  metrics.rawScoreDetails.totalCost = Math.round(cost * 100) / 100;

  return {
    cost,
    details: {
      travelCost: metrics.travelTimeMin * weights.travelTimeWeight,
      chargingCost: metrics.chargingTimeMin * weights.chargingTimeWeight,
      detourCost: metrics.detourKm * weights.detourWeight,
      trafficCost: metrics.trafficDelayMin * weights.trafficDelayWeight,
      weatherCost: metrics.weatherPenalty * 100 * weights.weatherPenaltyWeight,
      reliabilityCost: (100 - metrics.stationReliabilityScore) * weights.stationReliabilityWeight,
      infeasibilityPenalty: (!metrics.meetsDestinationRequirement ? algorithmsConfig.DESTINATION_MISS_PENALTY : 0) +
        (!isReachable ? algorithmsConfig.INFEASIBLE_PENALTY : 0),
      totalCost: cost
    }
  };
}

// ============================================================================
// MAIN ROUTE CONTROLLER
// ============================================================================

// @desc Plan route with charging stops using optimized DSA algorithms
// @route POST /api/plan-route
// @access Private
exports.planRoute = asyncHandler(async (req, res) => {
  const {
    source, destination, vehicleId,
    currentChargePercent = 100,
    currentChargedKwh = null,
    consumption_kWh_per_km = null,
    preferredMaxDetourKm = 5,
    segmentDistanceMeters = 200,
    amenitiesFilter = [],
    preferredChargingSpeedKw = null,
    optimizationStrategy = 'hybrid',
    minimumBatteryAtDestinationPercent = 20
  } = req.body;

  // return res.json(require("../output.json"));  


  if (!source || !destination || !vehicleId) {
    return res.status(400).json({ success: false, message: 'Please provide source, destination, and vehicleId' });
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle || vehicle.userId.toString() !== req.user.id) {
    return res.status(404).json({ success: false, message: 'Vehicle not found or not authorized' });
  }

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
    return res.status(400).json({ success: false, message: 'Invalid coordinate format' });
  }

  console.log(`🚗 Planning optimized route: ${srcCoords.lat},${srcCoords.lng} → ${destCoords.lat},${destCoords.lng}`);

  try {
    const maxBatteryKwh = vehicle.batteryCapacity * (1 - vehicle.degradationPercent / 100);
    const initialBatteryKwh = currentChargedKwh || (maxBatteryKwh * currentChargePercent / 100);
    const consumptionRate = consumption_kWh_per_km || vehicle.consumption_kWh_per_km || (vehicle.batteryCapacity / 300);
    const minBatteryBuffer = maxBatteryKwh * 0.15;
    const minBatteryAtDestination = (minimumBatteryAtDestinationPercent / 100) * maxBatteryKwh;

    console.log(`🔋 Battery: ${initialBatteryKwh.toFixed(1)}/${maxBatteryKwh.toFixed(1)} kWh, Consumption: ${consumptionRate.toFixed(3)} kWh/km`);
    console.log(`🎯 Target: ${minimumBatteryAtDestinationPercent}% (${minBatteryAtDestination.toFixed(1)} kWh) at destination`);

    const routeData = await getOSRMRoute([srcCoords.lng, srcCoords.lat], [destCoords.lng, destCoords.lat],
      { steps: true, overview: 'full', geometries: 'geojson' });
    const totalDistanceKm = routeData.distanceMeters / 1000;
    const baseDurationMin = routeData.durationSeconds / 60;

    const segments = await createOptimizedSegments(routeData.coordinates, segmentDistanceMeters, consumptionRate,
      vehicle.degradationPercent, totalDistanceKm);
    console.log(`📍 Route optimized into ${segments.length} segments (~${segmentDistanceMeters}m each)`);

    let enrichedSegments = await enrichSegmentsWithConditions(segments, new Date(), consumptionRate,
      vehicle.degradationPercent, totalDistanceKm);

    // Initial consumption calculation
    const consumptionData = calculateCumulativeConsumption(enrichedSegments, maxBatteryKwh, initialBatteryKwh);
    const chargingAnalysis = analyzeChargingNeeds(consumptionData.totalConsumptionKwh, initialBatteryKwh,
      minBatteryBuffer, totalDistanceKm, minBatteryAtDestination);

    let chargingStations = [];
    const errors = [];
    let dynamicChargingStations = [];

    if (chargingAnalysis.chargingRequired) {
      console.log('🔌 Charging required - running multi-algorithm comparison...');

      const criticalPoints = findCriticalChargingPoints(enrichedSegments, initialBatteryKwh, minBatteryBuffer,
        consumptionData.cumulativeConsumption);
      const stationSearchResults = await findOptimalStations(enrichedSegments, criticalPoints, preferredMaxDetourKm,
        amenitiesFilter, optimizationStrategy);

      if (stationSearchResults.stations.length === 0) {
        errors.push(`No charging stations found within ${preferredMaxDetourKm}km detour radius`);
      } else {
        console.log(`📍 Found ${stationSearchResults.stations.length} candidate stations using ${stationSearchResults.algorithm}`);

        // ============================================================================
        // RUN ALL PLANNERS AND SELECT BEST
        // ============================================================================

        const planners = [
          { name: 'SimpleRuleBased', fn: simpleRuleBasedPlanner },
          { name: 'Greedy', fn: greedyPlanner },
          { name: 'DynamicProgramming', fn: dpPlanner },
          { name: 'GraphAStar', fn: graphAStarPlanner }
        ];

        const plannerParams = [
          enrichedSegments, stationSearchResults.stations, maxBatteryKwh, initialBatteryKwh,
          minBatteryAtDestination, consumptionRate, criticalPoints
        ];

        const plannerPromises = planners.map(planner =>
          Promise.race([
            planner.fn(...plannerParams).catch(err => {
              console.error(`❌ ${planner.name} failed:`, err.message);
              return null;
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Planner timeout')), algorithmsConfig.PLANNER_TIMEOUT_MS)
            )
          ]).catch(err => {
            console.error(`⏱️ ${planner.name} timeout:`, err.message);
            return null;
          })
        );

        const plannerResults = await Promise.all(plannerPromises);

        const evaluatedPlans = [];
        for (let i = 0; i < plannerResults.length; i++) {
          const result = plannerResults[i];
          if (result && result.chargingStops) {
            const evaluation = evaluatePlan(result, enrichedSegments, {
              initialBatteryKwh, minBatteryAtDestination, minSafeBattery: maxBatteryKwh * 0.05
            }, algorithmsConfig.WEIGHTS);

            evaluatedPlans.push({
              plannerName: planners[i].name,
              chargingStops: result.chargingStops,
              metrics: result.metrics,
              cost: evaluation.cost,
              costDetails: evaluation.details
            });
          }
        }

        console.log('\n📊 Planner Comparison Results:');
        evaluatedPlans.forEach(plan => {
          console.log(`  ${plan.plannerName}: ${plan.chargingStops.length} stops, cost=${plan.cost.toFixed(2)}, feasible=${plan.metrics.meetsDestinationRequirement}`);
        });

        // FIXED: Always prefer feasible plans, even if they have higher cost
        const feasiblePlans = evaluatedPlans.filter(p => p.metrics.meetsDestinationRequirement && p.chargingStops.length > 0);
        
        let bestPlan;
        if (feasiblePlans.length > 0) {
          // Choose best feasible plan
          bestPlan = feasiblePlans.reduce((best, current) => (current.cost < best.cost ? current : best));
          console.log(`  ✅ Found ${feasiblePlans.length} feasible plans, selecting best`);
        } else {
          // No feasible plans - choose plan with most charging stops (most likely to help)
          const plansWithStops = evaluatedPlans.filter(p => p.chargingStops.length > 0);
          if (plansWithStops.length > 0) {
            bestPlan = plansWithStops.reduce((best, current) => {
              // Prefer more stops, then lower cost
              if (current.chargingStops.length > best.chargingStops.length) return current;
              if (current.chargingStops.length === best.chargingStops.length && current.cost < best.cost) return current;
              return best;
            });
            console.log(`  ⚠️ No feasible plans, selecting plan with most stops: ${bestPlan.chargingStops.length} stops`);
          } else {
            // Absolute fallback - all plans have 0 stops
            bestPlan = evaluatedPlans.reduce((best, current) => (current.cost < best.cost ? current : best));
            console.log(`  ❌ No plans with charging stops at all`);
          }
        }

        if (!bestPlan) {
          errors.push('All charging planners failed to generate a plan');
          console.error('❌ No valid plans generated');
        } else {
          console.log(`\n✅ Selected: ${bestPlan.plannerName} (cost=${bestPlan.cost.toFixed(2)})`);

          const optimalPath = {
            chargingStops: bestPlan.chargingStops,
            metrics: bestPlan.metrics,
            error: null
          };

          // ============================================================================
          // END ALGORITHM SELECTION - CONTINUE WITH EXISTING LOGIC
          // ============================================================================

          if (optimalPath && optimalPath.chargingStops && optimalPath.chargingStops.length > 0) {
            if (optimalPath.error) {
              console.error('❌ Charging algorithm error:', optimalPath.error.message);
              return res.status(400).json({
                success: false, message: optimalPath.error.message, errorCode: optimalPath.error.code,
                errorDetails: optimalPath.error.details, chargingStations: [], errors: [optimalPath.error.message]
              });
            }

            console.log(`✅ Found ${optimalPath.chargingStops.length} charging stops`);

            const chargingSpeedKw = preferredChargingSpeedKw || vehicle.maxChargePower || 50;
            chargingStations = await formatEnhancedChargingStations(optimalPath.chargingStops,
              stationSearchResults.stations, chargingSpeedKw, maxBatteryKwh, enrichedSegments);

            enrichedSegments = insertChargingStopsIntoRoute(enrichedSegments, chargingStations,
              initialBatteryKwh, maxBatteryKwh, consumptionRate);

            // RECALCULATE consumption with charging stops included
            const updatedConsumptionData = calculateCumulativeConsumption(enrichedSegments, maxBatteryKwh, initialBatteryKwh);
            consumptionData.totalConsumptionKwh = updatedConsumptionData.totalConsumptionKwh;
            consumptionData.minBatteryPercent = updatedConsumptionData.minBatteryPercent;
            consumptionData.finalBatteryKwh = updatedConsumptionData.finalBatteryKwh;
            consumptionData.finalBatteryPercent = updatedConsumptionData.finalBatteryPercent;

            console.log(`\n🔋 Updated Battery Tracking:`);
            console.log(`  Final battery: ${consumptionData.finalBatteryKwh} kWh (${consumptionData.finalBatteryPercent}%)`);
            console.log(`  Min during trip: ${consumptionData.minBatteryPercent}%`);

            dynamicChargingStations = [];
          } else if (optimalPath && optimalPath.error) {
            console.error('❌ Cannot complete trip:', optimalPath.error.message);
            return res.status(400).json({
              success: false, message: optimalPath.error.message, errorCode: optimalPath.error.code,
              errorDetails: optimalPath.error.details, chargingStations: [], errors: [optimalPath.error.message]
            });
          } else {
            errors.push('Cannot complete trip - insufficient battery and no reachable charging stations');
          }
        }
      }
    } else {
      console.log('✅ No charging required - sufficient battery for trip');
    }

    const finalMetrics = await calculateFinalMetrics(enrichedSegments, totalDistanceKm, chargingStations, new Date(),
      initialBatteryKwh, consumptionData.totalConsumptionKwh, maxBatteryKwh, minBatteryAtDestination);

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
        lat: s.lat, lng: s.lng,
        weatherColor: s.weatherColor, weatherCondition: s.weatherCondition,
        trafficColor: s.trafficColor, trafficLevel: s.trafficLevel,
        predictedSpeedKmh: s.predictedSpeedKmh,
        segmentDistanceM: Math.round(s.distanceM),
        segmentDurationSec: Math.round(s.segmentDurationSec),
        trafficDelayMin: s.trafficDelayMin || 0,
        segmentEtaIso: s.segmentEtaIso,
        expectedConsumptionKwh: Math.round(s.expectedConsumptionKwh * 1000) / 1000,
        batteryLevelPercent: s.batteryLevelPercent || 0,
        batteryLevelKwh: s.batteryLevelKwh || 0,
        isChargingStop: s.isChargingStop || false,
        stationName: s.stationName || null,
        chargingTimeMin: s.chargingTimeMin || null,
        chargeAddedPercent: s.chargeAddedPercent || null
      })),
      navigationSteps: routeData.steps.map(step => ({
        instruction: step.instruction, distance: Math.round(step.distance),
        duration: Math.round(step.duration),
        type: step.type, direction: step.direction, modifier: step.modifier || ''
      })),
      chargingStations: chargingStations.map(station => ({
        ...station, highlighted: true,
        markerData: {
          stationId: station.stationId, lat: station.lat, lng: station.lng,
          label: `${station.name} (${station.estimatedChargingTimeMin}min)`,
          color: station.isOptimal ? '#00FF00' : '#FFA500',
          size: station.isOptimal ? 'large' : 'medium'
        }
      })),
      dynamicChargingRecommendations: dynamicChargingStations,
      errors,
      trafficSummary: finalMetrics.trafficSummary,
      batteryAnalysis: {
        initialPercent: Math.round((initialBatteryKwh / maxBatteryKwh) * 100),
        initialKwh: Math.round(initialBatteryKwh * 10) / 10,
        finalPercent: finalMetrics.finalBatteryPercent,
        finalKwh: finalMetrics.finalBatteryKwh,
        minPercent: consumptionData.minBatteryPercent,
        criticalPoints: consumptionData.criticalPoints,
        totalConsumedKwh: Math.round(consumptionData.totalConsumptionKwh * 10) / 10,
        totalChargedKwh: finalMetrics.totalChargeAddedKwh,
        chargingNeeded: chargingAnalysis.chargingRequired,
        minimumBatteryAtDestinationPercent: Math.round(((minBatteryAtDestination / maxBatteryKwh) * 100) * 10) / 10,
        minimumBatteryAtDestinationKwh: Math.round(minBatteryAtDestination * 10) / 10,
        userRequestedMinimumPercent: minimumBatteryAtDestinationPercent,
        willMeetRequirement: finalMetrics.meetsDestinationRequirement,
        shortfallKwh: finalMetrics.recommendedChargeAtDestination?.shortfallKwh || 0,
        shortfallPercent: finalMetrics.recommendedChargeAtDestination?.shortfallPercent || 0,
        surplusKwh: finalMetrics.recommendedChargeAtDestination?.surplusKwh || 0,
        surplusPercent: finalMetrics.recommendedChargeAtDestination?.surplusPercent || 0,
        recommendedChargeAtDestination: finalMetrics.recommendedChargeAtDestination
      },
      meta: {
        routeProvider: 'OSRM', weatherProvider: 'OpenWeatherMap',
        trafficProvider: process.env.TOMTOM_API_KEY && process.env.TOMTOM_API_KEY !== 'your_tomtom_api_key_here'
          ? 'TomTom Live Traffic' : 'Time-based prediction',
        amenitiesProvider: 'LocalDB',
        optimizationAlgorithm: chargingStations.length > 0 ? 'Multi-Algorithm Comparison' : 'N/A',
        computedAtIso: new Date().toISOString()
      }
    };

    require("fs").writeFileSync("output.json", JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('❌ Route planning error:', error);
    res.status(500).json({ success: false, message: 'Error planning route', error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS (ORIGINAL IMPLEMENTATION)
// ============================================================================

async function createOptimizedSegments(coordinates, targetDistanceM, consumptionRate, degradationPercent, totalDistanceKm) {
  const segments = [];
  let cumulative = 0;
  const adaptiveDistance = totalDistanceKm > 100 ? Math.min(targetDistanceM * 2, 500) : targetDistanceM;
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
        index: segments.length, lat: lat2, lng: lng2, distanceM: cumulative,
        segmentDurationSec: (cumulative / 1000 / 60) * 3600,
        expectedConsumptionKwh: adjustedConsumption,
        weatherPenalty: 0, trafficPenalty: 0,
        cumulativeDistanceKm: 0, batteryLevelPercent: 0
      });
      cumulative = 0;
    }
  }

  let totalDist = 0;
  for (const segment of segments) {
    totalDist += segment.distanceM / 1000;
    segment.cumulativeDistanceKm = totalDist;
  }

  return segments;
}

// fix signature to match calls: (segments, startTime, consumptionRate, degradationPercent, totalDistanceKm)
async function enrichSegmentsWithConditions(segments, startTime, consumptionRate, degradationPercent, totalDistanceKm) {
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
      const trafficDelay = calculateTrafficDelay(enriched.trafficData, segmentDistanceKm, trafficAdjustedDurationMin);

      enriched.segmentDurationSec = (trafficAdjustedDurationMin + trafficDelay) * 60;
      enriched.trafficDelayMin = Math.round(trafficDelay * 10) / 10;

      const baseConsumption = enriched.expectedConsumptionKwh;
      enriched.expectedConsumptionKwh = calculateTrafficBatteryImpact(enriched.trafficData,
        baseConsumption * (1 + enriched.weatherPenalty));

      cumulativeTimeMin += enriched.segmentDurationSec / 60;
      enriched.cumulativeTimeMin = cumulativeTimeMin;
      enriched.segmentEtaIso = new Date(startTime.getTime() + cumulativeTimeMin * 60000).toISOString();
      enrichedSegments.push(enriched);
    }
  }

  return enrichedSegments;
}

function calculateCumulativeConsumption(segments, maxBatteryKwh, initialBatteryKwh) {
  const cumulativeConsumption = [];
  let totalConsumption = 0;
  let minBatteryPercent = 100;
  const criticalPoints = [];
  let currentBattery = initialBatteryKwh;

  for (let i = 0; i < segments.length; i++) {
    // Check if this is a charging stop
    if (segments[i].isChargingStop) {
      // Add charge at this stop
      const chargeAdded = (segments[i].chargeAddedPercent / 100) * maxBatteryKwh;
      currentBattery = Math.min(maxBatteryKwh, currentBattery + chargeAdded);
      segments[i].batteryLevelPercent = Math.round((currentBattery / maxBatteryKwh) * 100 * 10) / 10;
      segments[i].batteryLevelKwh = Math.round(currentBattery * 10) / 10;
      console.log(`  🔌 Charging at segment ${i}: +${chargeAdded.toFixed(1)} kWh -> ${currentBattery.toFixed(1)} kWh (${segments[i].batteryLevelPercent}%)`);
    } else {
      // Normal segment - consume battery
      const segmentConsumption = segments[i].expectedConsumptionKwh || 0;
      currentBattery -= segmentConsumption;
      totalConsumption += segmentConsumption;

      const batteryPercent = Math.max(0, (currentBattery / maxBatteryKwh) * 100);
      segments[i].batteryLevelPercent = Math.round(batteryPercent * 10) / 10;
      segments[i].batteryLevelKwh = Math.round(currentBattery * 10) / 10;

      if (batteryPercent < minBatteryPercent) {
        minBatteryPercent = batteryPercent;
      }

      if (batteryPercent < 30 && criticalPoints.length < 5) {
        criticalPoints.push({
          index: i, lat: segments[i].lat, lng: segments[i].lng,
          batteryPercent: Math.round(batteryPercent * 10) / 10,
          batteryKwh: Math.round(currentBattery * 10) / 10,
          distanceFromStart: segments[i].cumulativeDistanceKm
        });
      }
    }

    cumulativeConsumption.push(totalConsumption);
  }

  return {
    totalConsumptionKwh: totalConsumption,
    usagePercent: (totalConsumption / maxBatteryKwh) * 100,
    cumulativeConsumption,
    minBatteryPercent: Math.round(minBatteryPercent * 10) / 10,
    finalBatteryKwh: Math.round(currentBattery * 10) / 10,
    finalBatteryPercent: Math.round((currentBattery / maxBatteryKwh) * 100 * 10) / 10,
    criticalPoints
  };
}

function analyzeChargingNeeds(totalConsumption, initialBattery, minBuffer, totalDistance, minBatteryAtDestination) {
  const batteryNeededForTrip = totalConsumption + minBuffer;
  const batteryNeededForDestination = totalConsumption + minBatteryAtDestination;
  const totalBatteryNeeded = Math.max(batteryNeededForTrip, batteryNeededForDestination);
  const netBattery = initialBattery - totalBatteryNeeded;
  const chargingRequired = netBattery < 0;

  let urgency = 'none';
  if (chargingRequired) {
    if (netBattery < -initialBattery * 0.5) urgency = 'critical';
    else if (netBattery < -initialBattery * 0.25) urgency = 'high';
    else urgency = 'moderate';
  }

  console.log(`⚡ Charging Analysis:`);
  console.log(`  Total consumption: ${totalConsumption.toFixed(1)} kWh`);
  console.log(`  Required at destination: ${minBatteryAtDestination.toFixed(1)} kWh`);
  console.log(`  Total needed: ${totalBatteryNeeded.toFixed(1)} kWh`);
  console.log(`  Current battery: ${initialBattery.toFixed(1)} kWh`);
  console.log(`  Deficit: ${Math.abs(Math.min(0, netBattery)).toFixed(1)} kWh`);
  console.log(`  Charging required: ${chargingRequired ? 'YES' : 'NO'} (${urgency})`);

  return {
    chargingRequired, urgency, deficitKwh: Math.abs(Math.min(0, netBattery)),
    estimatedStops: chargingRequired ? Math.ceil(Math.abs(netBattery) / (initialBattery * 0.7)) : 0,
    requiredBatteryAtDestination: minBatteryAtDestination
  };
}

function findCriticalChargingPoints(segments, initialBattery, minBuffer, cumulativeConsumption) {
  const criticalPoints = [];
  let currentBattery = initialBattery;

  for (let i = 0; i < segments.length; i++) {
    currentBattery = initialBattery - cumulativeConsumption[i];
    if (currentBattery <= minBuffer) {
      criticalPoints.push({
        segmentIndex: i, lat: segments[i].lat, lng: segments[i].lng,
        batteryAtPoint: currentBattery, distanceFromStart: segments[i].cumulativeDistanceKm,
        priority: currentBattery < 0 ? 'critical' : 'high'
      });
    }
  }

  return criticalPoints;
}

async function findOptimalStations(segments, criticalPoints, maxDetourKm, amenitiesFilter, strategy) {
  const cacheKey = `stations_${JSON.stringify(criticalPoints)}_${maxDetourKm}`;

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

  const totalStations = await EVStation.countDocuments({ isOperational: true });
  console.log(`📊 Total operational stations in DB: ${totalStations}`);

  if (criticalPoints.length > 0) {
    console.log('📍 Searching around critical points...');
    for (const critical of criticalPoints) {
      try {
        console.log(`  Searching near [${critical.lng}, ${critical.lat}] with radius ${maxDetourKm * 1000 * 2}m`);
        const nearbyStations = await EVStation.find({
          isOperational: true,
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [critical.lng, critical.lat] },
              $maxDistance: maxDetourKm * 1000 * 2
            }
          }
        }).limit(15);
        console.log(`  Found ${nearbyStations.length} stations near critical point ${critical.index}`);
        if (nearbyStations.length > 0) {
          console.log(`  Sample: ${nearbyStations[0].name} at [${nearbyStations[0].longitude}, ${nearbyStations[0].latitude}]`);
        }
        stations = stations.concat(nearbyStations);
      } catch (error) {
        console.error(`❌ Error searching near critical point:`, error.message);
        console.error(`  Coordinates: [${critical.lng}, ${critical.lat}]`);
      }
    }
  }

  if (criticalPoints.length === 0 || stations.length < 5) {
    console.log('📍 Searching along route segments...');
    const sampleSegments = [segments[0], segments[Math.floor(segments.length / 2)], segments[segments.length - 1]];

    for (const seg of sampleSegments) {
      try {
        console.log(`  Searching near segment [${seg.lng}, ${seg.lat}]`);
        const nearbyStations = await EVStation.find({
          isOperational: true,
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [seg.lng, seg.lat] },
              $maxDistance: maxDetourKm * 1000 * 3
            }
          }
        }).limit(10);
        console.log(`  Found ${nearbyStations.length} stations`);
        stations = stations.concat(nearbyStations);
      } catch (error) {
        console.error(`❌ Error in segment search:`, error.message);
      }
    }
  }

  if (stations.length === 0) {
    console.log('⚠️ No stations found with geospatial queries, trying simple distance calculation...');
    try {
      const allStations = await EVStation.find({ isOperational: true }).limit(100);
      console.log(`  Loaded ${allStations.length} stations for manual distance check`);

      const startPoint = segments[0];
      stations = allStations.map(station => {
        const dist = haversineMeters(startPoint.lat, startPoint.lng, station.latitude, station.longitude) / 1000;
        return { ...station.toObject(), manualDistance: dist };
      })
        .filter(s => s.manualDistance <= maxDetourKm * 3)
        .sort((a, b) => a.manualDistance - b.manualDistance)
        .slice(0, 30);

      console.log(`  Found ${stations.length} stations within ${maxDetourKm * 3}km using manual calculation`);
    } catch (error) {
      console.error('❌ Error in fallback station search:', error.message);
    }
  }

  if (amenitiesFilter.length > 0) {
    const beforeFilter = stations.length;
    stations = stations.filter(s => amenitiesFilter.some(amenity => s.amenities.includes(amenity)));
    console.log(`  Filtered by amenities: ${beforeFilter} -> ${stations.length} stations`);
  }

  stations = rankStations(stations, segments, criticalPoints, strategy);

  const result = { stations: stations.slice(0, 30), algorithm, totalFound: stations.length };

  stationCache.set(cacheKey, { data: result, timestamp: Date.now() });

  console.log(`✅ Final station search result: ${result.stations.length} stations (${result.totalFound} total found)`);
  return result;
}

function getOptimizedWeatherPenalty(condition) {
  const penalties = { cold: 0.15, hot: 0.15, rain: 0.12, snow: 0.20, fog: 0.08, wind: 0.05 };
  return penalties[condition] || 0;
}

async function calculateFinalMetrics(segments, totalDistanceKm, chargingStations, startTime, initialBatteryKwh,
  totalConsumptionKwh, maxBatteryKwh, minBatteryAtDestination) {
  const totalTimeMin = segments[segments.length - 1]?.cumulativeTimeMin || 0;
  const chargingTimeMin = chargingStations.reduce((sum, s) => sum + (s.estimatedChargingTimeMin || 0), 0);
  const totalTrafficDelayMin = segments.reduce((sum, s) => sum + (s.trafficDelayMin || 0), 0);

  // Calculate actual battery at destination from segments
  const lastSegment = segments[segments.length - 1];
  const batteryAtDestination = lastSegment.batteryLevelKwh || 0;
  const batteryPercentAtDestination = lastSegment.batteryLevelPercent || 0;

  const totalChargeAdded = chargingStations.reduce((sum, s) => {
    return sum + ((s.estimatedChargeAddedPercent / 100) * maxBatteryKwh);
  }, 0);

  console.log(`\n🏁 Final Destination Battery:`);
  console.log(`  Initial: ${initialBatteryKwh.toFixed(1)} kWh (${((initialBatteryKwh / maxBatteryKwh) * 100).toFixed(1)}%)`);
  console.log(`  Charged during trip: ${totalChargeAdded.toFixed(1)} kWh at ${chargingStations.length} stops`);
  console.log(`  Total consumed: ${totalConsumptionKwh.toFixed(1)} kWh`);
  console.log(`  Final at destination: ${batteryAtDestination.toFixed(1)} kWh (${batteryPercentAtDestination.toFixed(1)}%)`);
  console.log(`  User requirement: ${minBatteryAtDestination.toFixed(1)} kWh (${((minBatteryAtDestination / maxBatteryKwh) * 100).toFixed(1)}%)`);

  let recommendedCharge = null;
  const meetsRequirement = batteryAtDestination >= minBatteryAtDestination;

  if (!meetsRequirement) {
    const additionalChargeNeeded = minBatteryAtDestination - batteryAtDestination;
    const destSegment = segments[segments.length - 1];

    // Find up to 3 nearest stations to destination
    let nearbyStations = [];

    try {
      const stationsNearDest = await EVStation.find({
        isOperational: true,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [destSegment.lng, destSegment.lat] },
            $maxDistance: 25000 // 25km radius
          }
        }
      }).limit(3);

      nearbyStations = stationsNearDest.map(station => {
        const distKm = haversineMeters(destSegment.lat, destSegment.lng,
          station.latitude, station.longitude) / 1000;
        const chargingTime = Math.round((additionalChargeNeeded / (station.powerKw || 50)) * 60);

        return {
          stationId: station._id,
          name: station.name,
          lat: station.latitude,
          lng: station.longitude,
          distanceKm: Math.round(distKm * 10) / 10,
          powerKw: station.powerKw,
          type: station.type,
          estimatedChargingTimeMin: chargingTime,
          amenities: station.amenities
        };
      });

      console.log(`  📍 Found ${nearbyStations.length} stations near destination (within 25km)`);
    } catch (error) {
      console.error('  ❌ Error finding stations near destination:', error.message);
    }

    recommendedCharge = {
      needed: true,
      shortfallKwh: Math.round(additionalChargeNeeded * 10) / 10,
      shortfallPercent: Math.round(((additionalChargeNeeded / maxBatteryKwh) * 100) * 10) / 10,
      currentAtDestination: Math.round(batteryAtDestination * 10) / 10,
      requiredAtDestination: Math.round(minBatteryAtDestination * 10) / 10,
      chargeToPercent: Math.round(((minBatteryAtDestination / maxBatteryKwh) * 100)),
      estimatedTimeMin: Math.round((additionalChargeNeeded / 50) * 60),
      reason: `Battery at destination (${batteryPercentAtDestination.toFixed(1)}%) is below requirement (${((minBatteryAtDestination / maxBatteryKwh) * 100).toFixed(1)}%). Need ${additionalChargeNeeded.toFixed(1)} kWh more.`,
      nearbyStations: nearbyStations,
      recommendation: nearbyStations.length > 0
        ? `Charge at ${nearbyStations[0].name} (${nearbyStations[0].distanceKm}km from destination) for about ${nearbyStations[0].estimatedChargingTimeMin} minutes`
        : 'Consider adding charging stops along the route or reducing minimum battery requirement'
    };

    console.log(`  ⚠️ INSUFFICIENT! Shortfall: ${additionalChargeNeeded.toFixed(1)} kWh (${recommendedCharge.shortfallPercent}%)`);
    if (nearbyStations.length > 0) {
      nearbyStations.forEach((station, idx) => {
        console.log(`    ${idx + 1}. ${station.name}: ${station.distanceKm}km away, ${station.powerKw}kW, ~${station.estimatedChargingTimeMin}min`);
      });
    }
  } else {
    const surplus = batteryAtDestination - minBatteryAtDestination;
    console.log(`  ✅ SUFFICIENT! Surplus: ${surplus.toFixed(1)} kWh (${((surplus / maxBatteryKwh) * 100).toFixed(1)}%)`);

    recommendedCharge = {
      needed: false,
      currentAtDestination: Math.round(batteryAtDestination * 10) / 10,
      requiredAtDestination: Math.round(minBatteryAtDestination * 10) / 10,
      surplusKwh: Math.round(surplus * 10) / 10,
      surplusPercent: Math.round(((surplus / maxBatteryKwh) * 100) * 10) / 10,
      message: `Battery at destination (${batteryPercentAtDestination.toFixed(1)}%) exceeds requirement (${((minBatteryAtDestination / maxBatteryKwh) * 100).toFixed(1)}%)`
    };
  }

  return {
    totalTimeMin: totalTimeMin + chargingTimeMin,
    trafficDelayMin: totalTrafficDelayMin,
    finalEtaIso: new Date(startTime.getTime() + (totalTimeMin + chargingTimeMin) * 60000).toISOString(),
    finalBatteryKwh: batteryAtDestination,
    finalBatteryPercent: batteryPercentAtDestination,
    minBatteryAtDestination: Math.round(batteryPercentAtDestination * 10) / 10,
    meetsDestinationRequirement: meetsRequirement,
    recommendedChargeAtDestination: recommendedCharge,
    totalChargeAddedKwh: Math.round(totalChargeAdded * 10) / 10,
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

async function formatEnhancedChargingStations(stops, candidateStations, chargingSpeedKw, maxBatteryKwh, segments) {
  return Promise.all(stops.map(async (stop, index) => {
    const station = candidateStations.find(s => s._id.toString() === stop.nodeId) || stop.station;
    if (!station) return null;

    let closestSegment = segments[0];
    let minDist = Infinity;
    let segmentIndex = 0;

    for (let i = 0; i < segments.length; i++) {
      const dist = haversineMeters(segments[i].lat, segments[i].lng, station.latitude, station.longitude);
      if (dist < minDist) {
        minDist = dist;
        closestSegment = segments[i];
        segmentIndex = i;
      }
    }

    return {
      stationId: station._id, name: station.name, lat: station.latitude, lng: station.longitude,
      distanceFromRouteM: Math.round(minDist),
      detourExtraTimeMin: Math.round((minDist / 1000 / 60) * 60 * 2),
      etaAtStationMin: Math.round(closestSegment.cumulativeTimeMin || 0),
      estimatedChargingTimeMin: Math.round(stop.chargeTimeMin),
      estimatedChargeAddedPercent: Math.round((stop.chargeAddedKwh / maxBatteryKwh) * 100),
      batteryOnArrivalPercent: Math.round(((stop.batteryBefore || 0) / maxBatteryKwh) * 100),
      batteryOnDeparturePercent: Math.round(((stop.batteryAfter || stop.batteryBefore + stop.chargeAddedKwh) / maxBatteryKwh) * 100),
      chargers: station.chargers || [{
        type: station.type === 'ultra-fast' ? 'CCS-350kW' : station.type === 'rapid' ? 'CCS-150kW' :
          station.type === 'fast' ? 'CCS-50kW' : 'Type2',
        powerKw: station.powerKw || 50, available: station.numberOfChargers || 1
      }],
      amenities: station.amenitiesDetail || station.amenities.map(a => ({ name: a, type: a, available: true })),
      isOptimal: index === 0, stopOrder: index + 1,
      notes: `Stop ${index + 1}: ${station.type || 'fast'} charging station with ${station.numberOfChargers || 1} chargers`,
      realTimeAvailability: station.numberOfChargers > 0 ? 'available' : 'unknown'
    };
  }).filter(Boolean));
}

function rankStations(stations, segments, criticalPoints, strategy) {
  return stations.map(station => {
    let score = 0;
    const stationObj = station.toObject ? station.toObject() : station;

    for (const critical of criticalPoints) {
      const dist = haversineMeters(stationObj.latitude, stationObj.longitude, critical.lat, critical.lng) / 1000;
      score += (10 - Math.min(10, dist)) * (critical.priority === 'critical' ? 2 : 1);
    }

    score += (stationObj.powerKw / 50) * 5;
    score += (stationObj.amenities?.length || 0) * 2;
    score += Math.min(5, stationObj.numberOfChargers || 0) * 3;

    if (strategy === 'time') {
      score += (stationObj.powerKw / 10);
    } else if (strategy === 'cost') {
      score += (stationObj.amenities?.includes('free') ? 20 : 0);
    }

    return { ...stationObj, score };
  }).sort((a, b) => b.score - a.score);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function insertChargingStopsIntoRoute(segments, chargingStations, initialBattery, maxBattery, consumptionRate) {
  if (chargingStations.length === 0) return segments;

  console.log(`\n🔌 Inserting ${chargingStations.length} charging stops into route...`);
  const newSegments = [...segments];
  let insertedCount = 0;

  // Sort stations by distance from start to maintain order
  const sortedStations = [...chargingStations].sort((a, b) =>
    (a.etaAtStationMin || 0) - (b.etaAtStationMin || 0)
  );

  for (const station of sortedStations) {
    let bestSegmentIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < newSegments.length; i++) {
      const dist = haversineMeters(newSegments[i].lat, newSegments[i].lng, station.lat, station.lng) / 1000;
      if (dist < minDistance) {
        minDistance = dist;
        bestSegmentIndex = i;
      }
    }

    // Cap charge addition at 100%
    const chargeAddedKwh = (station.estimatedChargeAddedPercent / 100) * maxBattery;
    const arrivalBattery = (station.batteryOnArrivalPercent / 100) * maxBattery;
    const departureBattery = Math.min(maxBattery, arrivalBattery + chargeAddedKwh); // Cap at 100%
    const actualChargeAddedPercent = ((departureBattery - arrivalBattery) / maxBattery) * 100;

    const chargingSegment = {
      ...newSegments[bestSegmentIndex], index: bestSegmentIndex + insertedCount,
      lat: station.lat, lng: station.lng, distanceM: minDistance * 1000,
      isChargingStop: true, stationId: station.stationId, stationName: station.name,
      chargingTimeMin: station.estimatedChargingTimeMin,
      chargeAddedPercent: Math.round(actualChargeAddedPercent * 10) / 10, // Use actual charge added
      batteryOnArrivalPercent: station.batteryOnArrivalPercent,
      batteryOnDeparturePercent: Math.round((departureBattery / maxBattery) * 100 * 10) / 10, // Cap at 100%
      expectedConsumptionKwh: 0,
      weatherColor: '#00FF00', weatherCondition: 'charging', trafficColor: '#00FF00', trafficLevel: 'charging',
      segmentDurationSec: station.estimatedChargingTimeMin * 60, trafficDelayMin: 0,
      batteryLevelPercent: Math.round((departureBattery / maxBattery) * 100 * 10) / 10,
      batteryLevelKwh: Math.round(departureBattery * 10) / 10
    };

    newSegments.splice(bestSegmentIndex + 1 + insertedCount, 0, chargingSegment);
    insertedCount++;
    console.log(`  ✅ Inserted ${station.name} at position ${bestSegmentIndex + insertedCount} (${minDistance.toFixed(2)}km from route)`);
    console.log(`     Battery: ${station.batteryOnArrivalPercent.toFixed(1)}% → ${chargingSegment.batteryOnDeparturePercent}% (+${actualChargeAddedPercent.toFixed(1)}%)`);
  }

  newSegments.forEach((seg, i) => seg.index = i);
  console.log(`✅ Route now has ${newSegments.length} segments (${segments.length} original + ${insertedCount} charging stops)`);
  return newSegments;
}


module.exports = exports;