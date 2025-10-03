/**
 * Resource-Constrained Dijkstra for EV Charging Station Selection
 * Finds optimal charging stops minimizing total trip time (drive + charge + detour)
 */

class PriorityQueue {
  constructor() {
    this.items = [];
  }
  
  enqueue(item, priority) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }
  
  dequeue() {
    return this.items.shift()?.item;
  }
  
  isEmpty() {
    return this.items.length === 0;
  }
}

/**
 * Run resource-constrained shortest path
 * @param {Object} graph - { nodes: [], edges: Map<nodeId, [{to, time, distance}]> }
 * @param {string} startNodeId
 * @param {string} endNodeId
 * @param {number} maxBatteryKwh - Vehicle battery capacity
 * @param {number} initialBatteryKwh - Starting charge
 * @param {Function} getChargingTime - (stationNode, neededKwh) => minutes
 * @returns {Object} { path: [nodeIds], totalTime, chargingStops: [{nodeId, chargeTime, chargeAdded}] }
 */
exports.findOptimalChargingPath = (
  graph,
  startNodeId,
  endNodeId,
  maxBatteryKwh,
  initialBatteryKwh,
  getChargingTime
) => {
  const { nodes, edges } = graph;
  
  // State: (nodeId, batteryKwh) -> { time, prev, prevBattery, chargedHere }
  const visited = new Map();
  const pq = new PriorityQueue();
  
  // Initial state
  pq.enqueue(
    { nodeId: startNodeId, battery: initialBatteryKwh },
    0
  );
  
  visited.set(`${startNodeId}_${initialBatteryKwh.toFixed(1)}`, {
    time: 0,
    prev: null,
    prevBattery: null,
    chargedHere: 0
  });
  
  let bestEndState = null;
  let bestEndTime = Infinity;
  
  while (!pq.isEmpty()) {
    const current = pq.dequeue();
    const { nodeId, battery } = current;
    const stateKey = `${nodeId}_${battery.toFixed(1)}`;
    const currentState = visited.get(stateKey);
    
    if (!currentState) continue;
    
    // Reached destination?
    if (nodeId === endNodeId) {
      if (currentState.time < bestEndTime) {
        bestEndTime = currentState.time;
        bestEndState = { nodeId, battery, stateKey };
      }
      continue;
    }
    
    // Get outgoing edges
    const neighbors = edges.get(nodeId) || [];
    
    for (const edge of neighbors) {
      const { to, time: driveTime, consumptionKwh } = edge;
      
      // Can we reach this neighbor with current battery?
      if (battery < consumptionKwh) {
        // Need to charge at current node (if it's a station)
        const currentNode = nodes.find(n => n.id === nodeId);
        if (currentNode && currentNode.type === 'station') {
          // Charge enough to reach next node + buffer
          const neededKwh = Math.min(
            consumptionKwh - battery + 5, // +5kWh buffer
            maxBatteryKwh - battery
          );
          
          const chargingTimeMin = getChargingTime(currentNode, neededKwh);
          const newBattery = Math.min(battery + neededKwh, maxBatteryKwh);
          const newTime = currentState.time + chargingTimeMin;
          
          const newStateKey = `${nodeId}_${newBattery.toFixed(1)}`;
          
          if (!visited.has(newStateKey) || visited.get(newStateKey).time > newTime) {
            visited.set(newStateKey, {
              time: newTime,
              prev: stateKey,
              prevBattery: battery,
              chargedHere: neededKwh
            });
            
            pq.enqueue({ nodeId, battery: newBattery }, newTime);
          }
        }
        continue;
      }
      
      // Move to neighbor
      const newBattery = battery - consumptionKwh;
      const newTime = currentState.time + driveTime;
      const newStateKey = `${to}_${newBattery.toFixed(1)}`;
      
      if (!visited.has(newStateKey) || visited.get(newStateKey).time > newTime) {
        visited.set(newStateKey, {
          time: newTime,
          prev: stateKey,
          prevBattery: battery,
          chargedHere: 0
        });
        
        pq.enqueue({ nodeId: to, battery: newBattery }, newTime);
      }
    }
  }
  
  // Reconstruct path
  if (!bestEndState) {
    return null; // No feasible path
  }
  
  const path = [];
  const chargingStops = [];
  let currentStateKey = bestEndState.stateKey;
  
  while (currentStateKey) {
    const [nodeId] = currentStateKey.split('_');
    path.unshift(nodeId);
    
    const state = visited.get(currentStateKey);
    if (state.chargedHere > 0) {
      const node = nodes.find(n => n.id === nodeId);
      chargingStops.unshift({
        nodeId,
        stationName: node?.name,
        chargeAddedKwh: state.chargedHere,
        chargeTimeMin: getChargingTime(node, state.chargedHere)
      });
    }
    
    currentStateKey = state.prev;
  }
  
  return {
    path,
    totalTime: bestEndTime,
    chargingStops
  };
};

/**
 * Greedy fallback: select nearest reachable stations along route
 */
exports.greedyChargingStops = (
  routeSegments,
  stations,
  maxBatteryKwh,
  initialBatteryKwh,
  consumption_kWh_per_km
) => {
  let currentBattery = initialBatteryKwh;
  const selectedStations = [];
  let cumulativeDistance = 0;
  
  for (let i = 0; i < routeSegments.length; i++) {
    const segment = routeSegments[i];
    const segmentKwh = (segment.distanceM / 1000) * consumption_kWh_per_km;
    
    currentBattery -= segmentKwh;
    cumulativeDistance += segment.distanceM / 1000;
    
    // Need charging?
    if (currentBattery < 10) { // <10kWh reserve
      // Find nearest station ahead
      const nearbyStation = stations.find(s => 
        s.distanceFromRouteKm < 5 && 
        s.segmentIndex >= i
      );
      
      if (nearbyStation) {
        const chargeNeeded = maxBatteryKwh * 0.8 - currentBattery;
        selectedStations.push({
          ...nearbyStation,
          chargeAddedKwh: chargeNeeded,
          chargeTimeMin: Math.ceil((chargeNeeded / nearbyStation.powerKw) * 60)
        });
        currentBattery = maxBatteryKwh * 0.8; // Charge to 80%
      } else {
        return null; // Cannot complete trip
      }
    }
  }
  
  return selectedStations;
};
