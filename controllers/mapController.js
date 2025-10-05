const asyncHandler = require('express-async-handler');
const { getOSRMRoute } = require('../utils/osrmClient');
const { getWeatherForCoordinates } = require('../utils/weatherService');
const { getTrafficForCoordinates, calculateTrafficDelay } = require('../utils/trafficService');

// Convert degrees to radians
function toRad(deg) { return deg * (Math.PI / 180); }

// Haversine distance calculation
function haversineMeters(lat1, lon1, lat2, lon2) {
	const R = 6371000;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Summarize segment creation (similar to Route controller segmentation)
function createSegmentsFromCoordinates(coordinates, targetDistanceM = 200) {
	const segments = [];
	let cumulative = 0;
	let lastLngLat = coordinates[0];
	for (let i = 1; i < coordinates.length; i++) {
		const [lng1, lat1] = lastLngLat;
		const [lng2, lat2] = coordinates[i];
		const dist = haversineMeters(lat1, lng1, lat2, lng2);
		cumulative += dist;
		lastLngLat = coordinates[i];
		if (cumulative >= targetDistanceM || i === coordinates.length - 1) {
			segments.push({
				lat: lat2,
				lng: lng2,
				distanceM: cumulative
			});
			cumulative = 0;
		}
	}
	// compute cumulativeDistanceKm
	let total = 0;
	for (const s of segments) { total += s.distanceM / 1000; s.cumulativeDistanceKm = total; }
	return segments;
}

// Batch enrichment of segments with weather & traffic
async function enrichWaySegments(segments, startTime = new Date(), batchSize = 10) {
	const enriched = [];
	let cumulativeTimeMin = 0;
	for (let i = 0; i < segments.length; i += batchSize) {
		const batch = segments.slice(i, i + batchSize);
		const promises = batch.map(async seg => {
			const arrival = new Date(startTime.getTime() + cumulativeTimeMin * 60000);
			const [weather, traffic] = await Promise.all([
				getWeatherForCoordinates(seg.lat, seg.lng, arrival),
				getTrafficForCoordinates(seg.lat, seg.lng, arrival)
			]);
			return { ...seg, weather, traffic, arrivalTime: arrival };
		});
		const results = await Promise.all(promises);
		for (const r of results) {
			// basic mapping fields
			r.weatherColor = r.weather?.color || null;
			r.weatherCondition = r.weather?.condition || null;
			r.trafficLevel = r.traffic?.level || 'unknown';
			r.predictedSpeedKmh = r.traffic?.speedKmh || 50;
			// duration & delay calc (use distance & predictedSpeed)
			const segKm = (r.distanceM || 0) / 1000;
			const baseDurationMin = segKm / (r.predictedSpeedKmh || 50) * 60;
			const trafficDelay = calculateTrafficDelay(r.traffic, segKm, baseDurationMin);
			r.segmentDurationSec = Math.round((baseDurationMin + (trafficDelay || 0)) * 60);
			r.trafficDelayMin = Math.round((trafficDelay || 0) * 10) / 10;
			cumulativeTimeMin += r.segmentDurationSec / 60;
			r.segmentEtaIso = new Date(startTime.getTime() + cumulativeTimeMin * 60000).toISOString();
			enriched.push(r);
		}
	}
	return enriched;
}

// Controller: returns way array with lat/lng + weather/traffic info
exports.mapWay = asyncHandler(async (req, res) => {
	const { start, end, segmentDistanceMeters = 200, batchSize = 10 } = req.body || {};

	// parse coords helper
	const parseCoords = (input) => {
		if (!input) return null;
		if (typeof input === 'string') {
			const [lat, lng] = input.split(',').map(Number);
			return { lat, lng };
		}
		return input;
	};

	const s = parseCoords(start);
	const e = parseCoords(end);
	if (!s || !e || isNaN(s.lat) || isNaN(s.lng) || isNaN(e.lat) || isNaN(e.lng)) {
		return res.status(400).json({ success: false, message: 'Provide valid start and end coordinates (lat,lng)' });
	}

	try {
		// Request OSRM route (coordinates order: lng, lat)
		const routeData = await getOSRMRoute([s.lng, s.lat], [e.lng, e.lat], { steps: true, overview: 'full', geometries: 'geojson' });

		// routeData.coordinates is expected as array of [lng, lat]
		const coordinates = routeData.coordinates || [];
		if (coordinates.length === 0) {
			return res.status(404).json({ success: false, message: 'No route found' });
		}

		// Build segments sampled by target distance
		const segments = createSegmentsFromCoordinates(coordinates, segmentDistanceMeters);

		// Enrich segments with weather & traffic in batches
		const enriched = await enrichWaySegments(segments, new Date(), batchSize);

		// Build simple response
		const way = enriched.map(seg => ({
			lat: seg.lat,
			lng: seg.lng,
			segmentDistanceM: Math.round(seg.distanceM || 0),
			segmentDurationSec: seg.segmentDurationSec || 0,
			segmentEtaIso: seg.segmentEtaIso || null,
			weatherCondition: seg.weatherCondition,
			weatherColor: seg.weatherColor,
			trafficLevel: seg.trafficLevel,
			predictedSpeedKmh: Math.round(seg.predictedSpeedKmh || 0),
			trafficDelayMin: seg.trafficDelayMin || 0
		}));

		const totalDistanceKm = (routeData.distanceMeters || 0) / 1000;
		const totalTimeMin = (routeData.durationSeconds || 0) / 60;

		res.json({
			success: true,
			totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
			totalTimeMin: Math.round(totalTimeMin),
			way,
			meta: {
				routeProvider: 'OSRM',
				weatherProvider: 'OpenWeatherMap',
				trafficProvider: process.env.TOMTOM_API_KEY ? 'TomTom Live Traffic' : 'Time-based prediction',
				computedAtIso: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('mapWay error:', err);
		res.status(500).json({ success: false, message: 'Error generating way', error: err.message });
	}
});