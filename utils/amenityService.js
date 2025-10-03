const axios = require('axios');

// Fetch REAL amenities from OpenStreetMap Overpass API - NO MOCK DATA
exports.getNearbyAmenities = async (lat, lng, radiusMeters = 1000) => {
  try {
    console.log(`🔍 Fetching REAL amenities near ${lat},${lng} (${radiusMeters}m radius) from OpenStreetMap...`);
    
    // Use Overpass API to get actual OSM data
    const amenities = await getAmenitiesFromOverpass(lat, lng, radiusMeters);
    
    console.log(`✅ Found ${amenities.length} amenities: ${amenities.join(', ')}`);
    
    return amenities;
  } catch (error) {
    console.error('❌ Amenity Service Error:', error.message);
    return []; // Return empty array if API fails - NO MOCK DATA
  }
};

async function getAmenitiesFromOverpass(lat, lng, radiusMeters) {
  try {
    // India-specific amenity query with timeout and proper formatting
    const query = `
      [out:json][timeout:15];
      (
        node["amenity"~"restaurant|cafe|fast_food|food_court|toilets|hospital|clinic|pharmacy|hotel|fuel|atm|bank|parking"](around:${radiusMeters},${lat},${lng});
        way["amenity"~"restaurant|cafe|fast_food|food_court|toilets|hospital|clinic|pharmacy|hotel|fuel|atm|bank|parking"](around:${radiusMeters},${lat},${lng});
        relation["amenity"~"restaurant|cafe|fast_food|food_court|toilets|hospital|clinic|pharmacy|hotel|fuel|atm|bank|parking"](around:${radiusMeters},${lat},${lng});
      );
      out center tags;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { 
        headers: { 'Content-Type': 'text/plain' },
        timeout: 15000 // 15 second timeout
      }
    );

    if (!response.data || !response.data.elements || response.data.elements.length === 0) {
      console.warn(`⚠️  No amenities found at ${lat},${lng} within ${radiusMeters}m`);
      return [];
    }

    const amenitySet = new Set();
    const amenityCounts = {};
    
    response.data.elements.forEach(element => {
      const amenityType = element.tags?.amenity;
      const cuisine = element.tags?.cuisine;
      const name = element.tags?.name;
      
      // Count amenity types for debugging
      if (amenityType) {
        amenityCounts[amenityType] = (amenityCounts[amenityType] || 0) + 1;
      }
      
      // Food establishments
      if (['restaurant', 'cafe', 'fast_food', 'food_court'].includes(amenityType) || cuisine) {
        amenitySet.add('food');
      }
      
      // Washroom/Toilets
      if (amenityType === 'toilets') {
        amenitySet.add('washroom');
      }
      
      // Medical facilities
      if (['hospital', 'clinic', 'pharmacy', 'doctors'].includes(amenityType)) {
        amenitySet.add('medical');
      }
      
      // Accommodation
      if (['hotel', 'motel', 'guest_house'].includes(amenityType)) {
        amenitySet.add('hotel');
      }
      
      // Fuel stations
      if (amenityType === 'fuel') {
        amenitySet.add('fuel');
      }
      
      // ATM/Banking
      if (['atm', 'bank'].includes(amenityType)) {
        amenitySet.add('atm');
      }
      
      // Parking
      if (amenityType === 'parking') {
        amenitySet.add('parking');
      }
      
      // WiFi availability
      if (element.tags?.internet_access === 'wlan' || 
          element.tags?.wifi === 'yes' || 
          element.tags?.['internet_access:fee'] === 'no') {
        amenitySet.add('wifi');
      }
    });

    // Log what was found
    console.log(`📊 Amenity breakdown at ${lat},${lng}:`, amenityCounts);
    
    const foundAmenities = Array.from(amenitySet);
    
    return foundAmenities;
    
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error('⏱️  Overpass API timeout - location may have limited data');
    } else if (error.response?.status === 429) {
      console.error('🚫 Overpass API rate limit reached - try again later');
    } else {
      console.error('❌ Overpass API Error:', error.message);
    }
    
    return []; // NO FALLBACK MOCK DATA
  }
}
