# cURL Examples for Route Wise API

## 1. Register & Login

### Register new user
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64abc12345...",
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "priya@example.com",
    "password": "password123"
  }'
```

---

## 2. Create Vehicle

```bash
curl -X POST http://localhost:5000/api/vehicles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Nexon EV",
    "model": "Tata Nexon EV Max",
    "size": "medium",
    "batteryCapacity": 40.5,
    "consumption_kWh_per_km": 0.14,
    "kmRun": 5000,
    "degradationPercent": 2,
    "chargingPortType": "CCS",
    "maxChargePower": 50,
    "topSpeed": 140
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64xyz789...",
    "userId": "64abc12345...",
    "name": "My Nexon EV",
    "model": "Tata Nexon EV Max",
    "batteryCapacity": 40.5,
    "consumption_kWh_per_km": 0.14,
    "maxChargePower": 50
  }
}
```

---

## 3. Plan Route - SHORT TRIP (No Charging Needed)

### Bangalore to Mysore (~150 km)
```bash
curl -X POST http://localhost:5000/api/plan-route \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "12.9716,77.5946",
    "destination": "12.2958,76.6394",
    "vehicleId": "64xyz789...",
    "currentChargePercent": 80,
    "segmentDistanceMeters": 300,
    "preferredMaxDetourKm": 5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "distanceKm": 143.2,
  "totalTimeMinutes": 165,
  "estimatedBatteryUsagePercent": 49.5,
  "chargingRequired": false,
  "finalEtaIso": "2025-01-10T14:45:00Z",
  "routeCoordinates": [
    {
      "lat": 12.9716,
      "lng": 77.5946,
      "weatherColor": "#00FF00",
      "trafficColor": "#FFFF00",
      "segmentDistanceM": 300,
      "segmentDurationSec": 18,
      "segmentEtaIso": "2025-01-10T12:00:18Z",
      "expectedConsumptionKwh": 0.042
    },
    ...
  ],
  "chargingStations": [],
  "errors": [],
  "meta": {
    "routeProvider": "OpenRouteService",
    "weatherProvider": "OpenWeatherMap",
    "amenitiesProvider": "LocalDB",
    "computedAtIso": "2025-01-10T12:00:00Z"
  }
}
```

---

## 4. Plan Route - LONG TRIP (Charging Required)

### Bangalore to Chennai (~350 km) with LIVE TRAFFIC
```bash
curl -X POST http://localhost:5000/api/plan-route \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "12.9716,77.5946",
    "destination": "13.0827,80.2707",
    "vehicleId": "64xyz789...",
    "currentChargePercent": 85,
    "segmentDistanceMeters": 300,
    "preferredMaxDetourKm": 8,
    "amenitiesFilter": ["food", "washroom"]
  }'
```

**Expected Response (with live traffic):**
```json
{
  "success": true,
  "distanceKm": 348.5,
  "totalTimeMinutes": 312,
  "totalTrafficDelayMin": 27.3,
  "estimatedBatteryUsagePercent": 132.8,
  "chargingRequired": true,
  "finalEtaIso": "2025-01-10T17:12:00Z",
  "routeCoordinates": [
    {
      "lat": 12.9716,
      "lng": 77.5946,
      "weatherColor": "#00FF00",
      "weatherCondition": "ideal",
      "trafficColor": "#FF0000",
      "trafficLevel": "heavy",
      "predictedSpeedKmh": 22,
      "segmentDistanceM": 300,
      "segmentDurationSec": 49,
      "trafficDelayMin": 0.5,
      "segmentEtaIso": "2025-01-10T12:00:49Z",
      "expectedConsumptionKwh": 0.056
    }
  ],
  "chargingStations": [...],
  "errors": [],
  "trafficSummary": {
    "totalDelayMinutes": 27.3,
    "averageSpeedKmh": 67.0,
    "severeSegments": 3,
    "heavySegments": 45,
    "moderateSegments": 120,
    "freeFlowSegments": 332
  },
  "meta": {
    "routeProvider": "OpenRouteService",
    "weatherProvider": "OpenWeatherMap",
    "trafficProvider": "TomTom Live Traffic",
    "amenitiesProvider": "LocalDB",
    "computedAtIso": "2025-01-10T12:00:00Z"
  }
}
```

---

## 5. Geocoding - Address to Coordinates

### Accurate Address (High Confidence)
```bash
curl "http://localhost:5000/api/geocode?address=Bangalore+International+Airport" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lat": 13.1986,
    "lng": 77.7066,
    "formattedAddress": "Kempegowda International Airport, Devanahalli, Bengaluru, Karnataka, India",
    "confidence": 95,
    "locality": "Devanahalli",
    "region": "Karnataka",
    "country": "India",
    "type": "venue",
    "suggestions": []
  }
}
```

### Fuzzy/Inaccurate Address (Low Confidence)
```bash
curl "http://localhost:5000/api/geocode?address=banglore+airprt" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lat": 13.1986,
    "lng": 77.7066,
    "formattedAddress": "Kempegowda International Airport, Devanahalli, Bengaluru, Karnataka, India",
    "confidence": 62,
    "warning": "Low confidence match. Please verify the address or choose from suggestions.",
    "suggestions": [
      {
        "lat": 12.9716,
        "lng": 77.5946,
        "address": "Bengaluru, Karnataka, India",
        "confidence": 50
      }
    ]
  }
}
```

### Address Not Found
```bash
curl "http://localhost:5000/api/geocode?address=xyz123nonexistent" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": false,
  "message": "No results found for this address"
}
```

---

## 6. Reverse Geocoding - Coordinates to Address

```bash
curl "http://localhost:5000/api/geocode/reverse?lat=12.9716&lng=77.5946" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "formattedAddress": "Cubbon Park, Bengaluru, Karnataka 560001, India",
    "locality": "Bengaluru",
    "region": "Karnataka",
    "country": "India",
    "postalCode": "560001"
  }
}
```

---

## Geocoding Use Cases

### 1. Plan route using addresses instead of coordinates
```bash
# Step 1: Geocode source
SOURCE=$(curl -s "http://localhost:5000/api/geocode?address=Bangalore+Airport" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq -r '.data | "\(.lat),\(.lng)"')

# Step 2: Geocode destination  
DEST=$(curl -s "http://localhost:5000/api/geocode?address=Chennai+Central" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq -r '.data | "\(.lat),\(.lng)"')

# Step 3: Plan route
curl -X POST http://localhost:5000/api/plan-route \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"source\": \"$SOURCE\",
    \"destination\": \"$DEST\",
    \"vehicleId\": \"64xyz789...\"
  }"
```

### 2. Handle fuzzy addresses with suggestions
```bash
# If address is ambiguous, show suggestions to user
curl "http://localhost:5000/api/geocode?address=MG+Road" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response contains multiple suggestions:
# - MG Road, Bangalore (confidence: 70%)
# - MG Road, Mumbai (confidence: 65%)
# - MG Road, Pune (confidence: 60%)
```

### 3. Verify charging station address
```bash
# Get human-readable address for a station
curl "http://localhost:5000/api/geocode/reverse?lat=12.7409&lng=77.8253" \
  -H "Authorization: Bearer YOUR_TOKEN"
# Returns: "Tata Power Station, Hosur Road, Electronic City"
```

---

## API Setup Instructions

### TomTom Traffic API (REQUIRED for Live Traffic)

1. **Sign up**: https://developer.tomtom.com/user/register
2. **Create API Key**: 
   - Go to Dashboard → My API Keys
   - Create new key with "Traffic API" enabled
3. **Free Tier**: 2,500 requests/day
4. **Add to `.env`**:
   ```bash
   TOMTOM_API_KEY=your_actual_tomtom_key_here
   ```

### Traffic Features

✅ **Live traffic speed** at predicted arrival time  
✅ **Congestion factor** (current vs free-flow)  
✅ **Time-based delays** (minutes per km)  
✅ **Battery penalty** based on stop-and-go traffic  
✅ **Cumulative ETA** propagation (delays compound)  
✅ **Rush hour detection** (morning/evening)  
✅ **Weekend vs weekday** patterns  
✅ **Fallback predictions** if API unavailable  

---

## Notes

### API Requirements (Only 2 APIs needed!)

1. **OpenRouteService** (https://openrouteservice.org/)
   - Free tier: 2000 requests/day
   - Used for: Route calculation, distance, duration
   - Sign up at: https://openrouteservice.org/dev/#/signup

2. **OpenWeatherMap** (https://openweathermap.org/)
   - Free tier: 1000 requests/day
   - Used for: Weather conditions along route
   - Sign up at: https://home.openweathermap.org/users/sign_up

### No Additional APIs Required

- **EV Charging Stations**: Stored in local MongoDB (pre-imported using Python script)
- **Amenities**: Pre-fetched during station import (stored in `amenitiesDetail` field)
- **Traffic**: Time-based heuristic (no external API)

### Testing Tips

1. Replace `YOUR_JWT_TOKEN` with the token from login response
2. Replace `64xyz789...` with your actual vehicle ID
3. Start with short trips to test without charging stops
4. Use longer trips to test charging station selection algorithm
5. Try different `amenitiesFilter` arrays to test amenity filtering

### Error Handling

If you get errors:
- `401`: Token expired or invalid - login again
- `404`: Vehicle not found - check vehicleId
- `503`: ORS API down - algorithm will use haversine fallback
- Empty `chargingStations` + error: No stations within detour radius
