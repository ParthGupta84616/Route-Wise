const axios = require('axios');

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || 'your_geoapify_key_here';
const BASE_URL = 'https://api.geoapify.com/v1/routing';

/**
 * Get detailed route from Geoapify with traffic and turn-by-turn steps
 * @param {[lng, lat]} start
 * @param {[lng, lat]} end
 * @param {Object} options - { traffic: true, mode: 'drive' }
 * @returns {Object} { coordinates: [[lng,lat],...], distanceMeters, durationSeconds, steps: [...] }
 */
async function getGeoapifyRoute(start, end, options = {}) {
  const { traffic = true, mode = 'drive' } = options;

  try {
    const url = `${BASE_URL}?waypoints=${start[1]},${start[0]}|${end[1]},${end[0]}&mode=${mode}&apiKey=${GEOAPIFY_API_KEY}`;
    const params = { details: 'instruction_details' };
    if (traffic) params.traffic = 'approximated'; // Use live/approximated traffic

    const response = await axios.get(url, { params, timeout: 15000 });

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error('No route found from Geoapify');
    }

    const feature = response.data.features[0];
    const geometry = feature.geometry.coordinates[0]; // LineString coords
    const props = feature.properties;

    // Extract turn-by-turn steps
    const legs = props.legs || [];
    const steps = [];
    legs.forEach(leg => {
      (leg.steps || []).forEach(step => {
        steps.push({
          instruction: step.instruction?.text || 'Continue',
          distance: step.distance || 0,
          duration: step.time || 0,
          type: step.type || 'continue',
          direction: step.instruction?.street_name || ''
        });
      });
    });

    return {
      coordinates: geometry, // [[lng, lat], ...]
      distanceMeters: props.distance || 0,
      durationSeconds: props.time || 0,
      steps
    };
  } catch (error) {
    console.error('❌ Geoapify routing error:', error.message);
    throw new Error(`Geoapify API error: ${error.message}`);
  }
}

module.exports = { getGeoapifyRoute };
