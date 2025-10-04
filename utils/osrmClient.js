const axios = require('axios');

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'http://router.project-osrm.org';

/**
 * Get detailed route from OSRM with turn-by-turn steps
 * @param {[lng, lat]} start
 * @param {[lng, lat]} end
 * @param {Object} options - { steps: true, overview: 'full', geometries: 'geojson' }
 * @returns {Object} { coordinates: [[lng,lat],...], distanceMeters, durationSeconds, steps: [...] }
 */
async function getOSRMRoute(start, end, options = {}) {
  const { steps = true, overview = 'full', geometries = 'geojson', alternatives = false } = options;

  try {
    const url = `${OSRM_BASE_URL}/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}`;
    const params = {
      overview,
      geometries,
      steps: steps ? 'true' : 'false',
      alternatives: alternatives ? 'true' : 'false'
    };

    const response = await axios.get(url, { params, timeout: 15000 });

    if (!response.data.routes || response.data.routes.length === 0) {
      throw new Error('No route found from OSRM');
    }

    const route = response.data.routes[0];
    const geometry = route.geometry.coordinates; // [[lng, lat], ...]
    
    // Extract turn-by-turn steps from OSRM legs
    const allSteps = [];
    (route.legs || []).forEach(leg => {
      (leg.steps || []).forEach(step => {
        const maneuver = step.maneuver || {};
        allSteps.push({
          instruction: getManeuverInstruction(maneuver),
          distance: step.distance || 0,
          duration: step.duration || 0,
          type: maneuver.type || 'continue',
          direction: step.name || '',
          modifier: maneuver.modifier || ''
        });
      });
    });

    return {
      coordinates: geometry, // [[lng, lat], ...]
      distanceMeters: route.distance || 0,
      durationSeconds: route.duration || 0,
      steps: allSteps
    };
  } catch (error) {
    console.error('❌ OSRM routing error:', error.message);
    throw new Error(`OSRM API error: ${error.message}`);
  }
}

/**
 * Convert OSRM maneuver into human-readable instruction
 */
function getManeuverInstruction(maneuver) {
  const type = maneuver.type || 'continue';
  const modifier = maneuver.modifier || '';
  
  const instructions = {
    'depart': 'Depart',
    'turn': modifier ? `Turn ${modifier}` : 'Turn',
    'new name': 'Continue',
    'arrive': 'Arrive at destination',
    'merge': modifier ? `Merge ${modifier}` : 'Merge',
    'fork': modifier ? `Take ${modifier} fork` : 'Fork',
    'end of road': modifier ? `At end of road, turn ${modifier}` : 'End of road',
    'roundabout': 'Enter roundabout',
    'exit roundabout': 'Exit roundabout',
    'continue': 'Continue straight'
  };

  return instructions[type] || 'Continue';
}

module.exports = { getOSRMRoute };
