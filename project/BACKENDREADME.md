# 🚗 Route Wise - EV Route Planning Backend

Production-grade REST API for electric vehicle route planning with **live traffic**, **weather integration**, **charging station selection**, and **battery optimization**.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-6.0+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🌟 Features

- ✅ **JWT Authentication** - Secure user registration and login
- ✅ **Vehicle Management** - CRUD operations for EV fleet
- ✅ **Smart Route Planning** - OpenRouteService integration with 200m segment granularity
- ✅ **Live Traffic** - TomTom Traffic API with time-based predictions
- ✅ **Weather Impact** - Battery consumption adjustments for cold/hot/rain
- ✅ **Charging Station Selection** - Resource-constrained Dijkstra algorithm
- ✅ **Amenities Filtering** - Pre-fetched from local MongoDB (food, washroom, ATM, etc.)
- ✅ **Time-Aware Predictions** - Forecast traffic at exact arrival time
- ✅ **Battery Optimization** - Degradation, consumption rate, and range calculations

---

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Running the Server](#running-the-server)
- [API Documentation](#api-documentation)
- [Testing with Postman](#testing-with-postman)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## 📦 Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 18.x ([Download](https://nodejs.org/))
- **MongoDB** >= 6.0 ([Download](https://www.mongodb.com/try/download/community))
- **Python** >= 3.8 (for station import script)
- **Git** ([Download](https://git-scm.com/downloads))

### Required API Keys (Free Tier)

1. **OpenRouteService** - [Sign up](https://openrouteservice.org/dev/#/signup) (2000 requests/day)
2. **OpenWeatherMap** - [Sign up](https://home.openweathermap.org/users/sign_up) (1000 requests/day)
3. **TomTom Traffic** - [Sign up](https://developer.tomtom.com/user/register) (2500 requests/day)

---

## 🚀 Installation

### 1. Clone Repository

```bash
git clone https://github.com/parthgupta84616/route-wise.git
cd route-wise
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Install Python Dependencies (for station import)

```bash
pip install -r requirements.txt
```

---

## ⚙️ Environment Setup

### 1. Create `.env` File

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

Open `.env` and update with your actual keys:

```env
NODE_ENV=development
PORT=5000

# MongoDB
MONGO_URI=mongodb://localhost:27017/routewise

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=30d

# Required APIs
OPENROUTE_API_KEY=your_openroute_api_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here
TOMTOM_API_KEY=your_tomtom_api_key_here
```

## 🏃 Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

Server will start at: `http://localhost:5000`

**Health Check:**
```bash
curl http://localhost:5000/health
```

---

## 📖 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### 1. Register User
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64abc...",
    "name": "John Doe",
    "email": "john@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 2. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### 3. Get Current User
```http
GET /auth/me
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### Vehicle Endpoints

#### 1. Create Vehicle
```http
POST /vehicles
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
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
}
```

#### 2. Get All Vehicles
```http
GET /vehicles
Authorization: Bearer YOUR_JWT_TOKEN
```

#### 3. Update Vehicle
```http
PUT /vehicles/:id
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "kmRun": 6000,
  "degradationPercent": 3
}
```

#### 4. Delete Vehicle
```http
DELETE /vehicles/:id
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### Geocoding Endpoints

#### 1. Address to Coordinates (Geocoding)
```http
GET /api/geocode?address=Bangalore%20Airport&country=IN
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `address` (required): Full or partial address (e.g., "Bangalore Airport", "MG Road Bangalore")
- `country` (optional): Country code (default: IN)

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
    "suggestions": [
      {
        "lat": 13.1990,
        "lng": 77.7070,
        "address": "Bangalore International Airport Road",
        "confidence": 80
      }
    ]
  }
}
```

**Low Confidence Example:**
```json
{
  "success": true,
  "data": {
    "lat": 12.9716,
    "lng": 77.5946,
    "formattedAddress": "Bangalore, Karnataka, India",
    "confidence": 45,
    "warning": "Low confidence match. Please verify the address or choose from suggestions.",
    "suggestions": [...]
  }
}
```

#### 2. Coordinates to Address (Reverse Geocoding)
```http
GET /api/geocode/reverse?lat=12.9716&lng=77.5946
Authorization: Bearer YOUR_JWT_TOKEN
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

### Route Planning Endpoint

#### Plan Route with Live Traffic & Charging Stops
```http
POST /plan-route
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "source": "12.9716,77.5946",
  "destination": "13.0827,80.2707",
  "vehicleId": "64xyz789...",
  "currentChargePercent": 85,
  "segmentDistanceMeters": 300,
  "preferredMaxDetourKm": 8,
  "amenitiesFilter": ["food", "washroom"],
  "preferredChargingSpeedKw": 60
}
```

**Response:**
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
      "trafficColor": "#FF0000",
      "predictedSpeedKmh": 22,
      "segmentDistanceM": 300,
      "segmentDurationSec": 49,
      "trafficDelayMin": 0.5,
      "expectedConsumptionKwh": 0.056
    }
  ],
  "chargingStations": [...],
  "trafficSummary": {
    "totalDelayMinutes": 27.3,
    "averageSpeedKmh": 67.0,
    "severeSegments": 3,
    "heavySegments": 45
  }
}
```

**NEW: Using Geocoding in Route Planning**

You can now use addresses instead of coordinates:

```bash
# Step 1: Geocode source address
curl "http://localhost:5000/api/geocode?address=Bangalore+Airport" \
  -H "Authorization: Bearer YOUR_TOKEN"
# Returns: {"lat": 13.1986, "lng": 77.7066}

# Step 2: Geocode destination address
curl "http://localhost:5000/api/geocode?address=Chennai+Central+Station" \
  -H "Authorization: Bearer YOUR_TOKEN"
# Returns: {"lat": 13.0827, "lng": 80.2707}

# Step 3: Use coordinates in route planning
curl -X POST http://localhost:5000/api/plan-route \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "13.1986,77.7066",
    "destination": "13.0827,80.2707",
    "vehicleId": "64xyz789..."
  }'
```

---

## 🧪 Testing with Postman

### Import Collection

1. Download [Postman Collection](./POSTMAN_COLLECTION.json)
2. Open Postman → Import → Select file
3. Update environment variables:
   - `base_url`: `http://localhost:5000`
   - `token`: (auto-populated after login)

### Test Flow

1. **Register** → Get token
2. **Login** → Refresh token
3. **Create Vehicle** → Get vehicleId
4. **Plan Short Route** (Bangalore → Mysore)
5. **Plan Long Route** (Bangalore → Chennai) with charging

---


## 📁 Project Structure

```
route-wise/
├── controllers/          # Request handlers
│   ├── authController.js
│   ├── vehicleController.js
│   └── routeController.js
├── models/              # MongoDB schemas
│   ├── User.js
│   ├── Vehicle.js
│   └── EVStation.js
├── routes/              # API routes
│   ├── authRoutes.js
│   ├── vehicleRoutes.js
│   └── routeRoutes.js
├── utils/               # Helper functions
│   ├── orsClient.js
│   ├── weatherService.js
│   ├── trafficService.js
│   └── graphAlgorithm.js
├── middleware/          # Auth middleware
├── scripts/             # Database seeders
├── .env.example         # Environment template
├── server.js            # Entry point
└── package.json
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 📧 Contact

For support or queries: support@routewise.com

**Happy routing! 🚗⚡**
