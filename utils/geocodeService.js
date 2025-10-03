const axios = require('axios');

const geocodeCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (addresses don't change often)

/**
 * Convert address to coordinates using OpenRouteService Geocoding API
 * Handles fuzzy/inaccurate addresses with confidence scoring
 * @param {string} address - Full or partial address
 * @param {string} country - Country code (default: IN for India)
 * @returns {Object} { lat, lng, formattedAddress, confidence, suggestions }
 */
exports.geocodeAddress = async (address, country = 'IN') => {
  if (!address || address.trim().length < 3) {
    throw new Error('Address must be at least 3 characters long');
  }

  const cacheKey = `${address.toLowerCase().trim()}_${country}`;
  const cached = geocodeCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📍 Geocode cache hit: ${address}`);
    return cached.data;
  }

  try {
    console.log(`🔍 Geocoding address: "${address}"`);
    
    const response = await axios.get(
      'https://api.openrouteservice.org/geocode/search',
      {
        params: {
          api_key: process.env.OPENROUTE_API_KEY,
          text: address,
          'boundary.country': country,
          size: 5 // Get top 5 results for suggestions
        },
        timeout: 10000
      }
    );

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error('No results found for this address');
    }

    // Parse results
    const results = response.data.features.map((feature, index) => {
      const coords = feature.geometry.coordinates;
      const props = feature.properties;
      
      return {
        lat: coords[1],
        lng: coords[0],
        formattedAddress: props.label || props.name,
        locality: props.locality,
        region: props.region,
        country: props.country,
        postalCode: props.postalcode,
        confidence: props.confidence || (1.0 - (index * 0.15)), // Assign confidence based on rank
        type: props.layer // e.g., 'address', 'street', 'locality', 'region'
      };
    });

    // Best match (highest confidence)
    const bestMatch = results[0];
    
    // Check if confidence is too low (might be inaccurate address)
    if (bestMatch.confidence < 0.5) {
      console.warn(`⚠️  Low confidence geocoding result for: ${address}`);
    }

    const result = {
      lat: bestMatch.lat,
      lng: bestMatch.lng,
      formattedAddress: bestMatch.formattedAddress,
      confidence: Math.round(bestMatch.confidence * 100), // Convert to percentage
      locality: bestMatch.locality,
      region: bestMatch.region,
      country: bestMatch.country,
      type: bestMatch.type,
      suggestions: results.slice(1).map(r => ({
        lat: r.lat,
        lng: r.lng,
        address: r.formattedAddress,
        confidence: Math.round(r.confidence * 100)
      }))
    };

    // Cache result
    geocodeCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log(`✅ Geocoded: ${bestMatch.formattedAddress} (${bestMatch.confidence*100}% confidence)`);
    
    return result;

  } catch (error) {
    if (error.response?.status === 400) {
      throw new Error('Invalid address format');
    } else if (error.response?.status === 403) {
      throw new Error('Geocoding API key invalid or rate limit exceeded');
    } else if (error.message.includes('No results found')) {
      throw error;
    } else {
      console.error('Geocoding Error:', error.message);
      throw new Error('Failed to geocode address. Please check your input and try again.');
    }
  }
};

/**
 * Reverse geocode: Convert coordinates to address
 * @param {number} lat
 * @param {number} lng
 * @returns {Object} { formattedAddress, locality, region, country }
 */
exports.reverseGeocode = async (lat, lng) => {
  try {
    console.log(`🔍 Reverse geocoding: ${lat},${lng}`);
    
    const response = await axios.get(
      'https://api.openrouteservice.org/geocode/reverse',
      {
        params: {
          api_key: process.env.OPENROUTE_API_KEY,
          'point.lat': lat,
          'point.lon': lng,
          size: 1
        },
        timeout: 10000
      }
    );

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error('No address found for these coordinates');
    }

    const feature = response.data.features[0];
    const props = feature.properties;

    return {
      formattedAddress: props.label || props.name,
      locality: props.locality,
      region: props.region,
      country: props.country,
      postalCode: props.postalcode
    };

  } catch (error) {
    console.error('Reverse Geocoding Error:', error.message);
    throw new Error('Failed to find address for coordinates');
  }
};
