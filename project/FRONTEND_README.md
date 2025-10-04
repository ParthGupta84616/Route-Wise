# 🚗 EV Route Planner - Frontend

A React Native Expo application for electric vehicle route planning with live traffic, weather integration, and charging station optimization.

## 🌟 Features

- ✅ **JWT Authentication** - Secure user registration and login
- ✅ **Vehicle Management** - Add, edit, and manage your EV fleet
- ✅ **Smart Route Planning** - Plan routes with live traffic and weather data
- ✅ **Geocoding Support** - Convert addresses to coordinates automatically
- ✅ **Charging Station Integration** - Find optimal charging stops along your route
- ✅ **Interactive Maps** - Visualize routes with charging stations
- ✅ **Amenities Filtering** - Filter charging stations by amenities (food, washroom, etc.)

## 📱 Screenshots

The app includes:
- **Authentication Screen** - Login/Register with email and password
- **Vehicles Tab** - Manage your EV fleet with detailed specifications
- **Routes Tab** - Plan routes with geocoding and preferences
- **Profile Tab** - User profile and logout functionality
- **Map View** - Interactive route visualization with charging stations

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **Expo CLI** - `npm install -g @expo/cli`
- **React Native development environment** (for iOS/Android)
- **Backend API** - The Route Wise backend must be running

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure API endpoint**
   
   Edit `api/axiosClient.ts` to point to your backend:
   ```typescript
   // For production (default)
   const API_BASE_URL = 'https://route-wise.onrender.com/api';
   
   // For local development
   const API_BASE_URL = 'http://localhost:5000/api';
   ```

4. **Start the development server**
   ```bash
   npm start
   # or
   expo start
   ```

### Running on Devices

#### iOS Simulator
```bash
npm run ios
# or
expo run:ios
```

#### Android Emulator
```bash
npm run android
# or
expo run:android
```

#### Web Browser
```bash
npm run web
# or
expo start --web
```

## 📖 Usage Guide

### 1. Authentication
- Open the app and register a new account or login
- The app will automatically handle JWT token storage

### 2. Adding Vehicles
- Navigate to the "Vehicles" tab
- Tap the "+" button to add a new vehicle
- Fill in vehicle details:
  - **Name**: Your vehicle's nickname
  - **Model**: Vehicle model (e.g., "Tesla Model 3")
  - **Size**: Vehicle size category
  - **Battery Capacity**: Total battery capacity in kWh
  - **Consumption Rate**: Energy consumption in kWh/100km
  - **Distance Run**: Current odometer reading
  - **Degradation**: Optional battery degradation percentage

### 3. Planning Routes
- Navigate to the "Routes" tab
- Select a vehicle (must be done from Vehicles tab first)
- Enter source and destination:
  - Use coordinates (lat,lng) format
  - Or use addresses and tap the search button for geocoding
- Set preferences:
  - Current charge percentage
  - Maximum detour distance
  - Preferred charging speed
  - Amenities filter (food, washroom, ATM, etc.)
- Tap "Plan Route" to generate the route

### 4. Viewing Routes
- After planning, you'll see an interactive map
- Route is displayed as a blue line
- Charging stations are marked with pins
- Tap pins for station details
- View route statistics (distance, time, battery usage)

## 🔧 API Integration

The app integrates with the Route Wise backend API:

### Authentication Endpoints
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user

### Vehicle Endpoints
- `GET /vehicles` - Get user's vehicles
- `POST /vehicles` - Create new vehicle
- `PUT /vehicles/:id` - Update vehicle
- `DELETE /vehicles/:id` - Delete vehicle

### Route Planning Endpoints
- `GET /geocode` - Convert address to coordinates
- `GET /geocode/reverse` - Convert coordinates to address
- `POST /plan-route` - Plan route with charging stops

## 🛠️ Development

### Project Structure
```
app/
├── (tabs)/           # Tab navigation screens
│   ├── index.tsx    # Vehicles screen
│   ├── routes.tsx   # Route planning screen
│   └── profile.tsx  # Profile screen
├── vehicle/         # Vehicle management screens
├── map/             # Map visualization
└── _layout.tsx     # Root layout

api/                 # API integration
├── axiosClient.ts   # HTTP client configuration
├── authApi.ts       # Authentication API
├── vehicleApi.ts    # Vehicle management API
└── routeApi.ts      # Route planning API

components/          # Reusable components
hooks/              # Custom React hooks
types/              # TypeScript type definitions
utils/              # Utility functions
```

### Key Technologies
- **React Native** - Cross-platform mobile development
- **Expo** - Development platform and tools
- **TypeScript** - Type-safe JavaScript
- **React Query** - Data fetching and caching
- **Expo Router** - File-based navigation
- **Axios** - HTTP client
- **Lucide React Native** - Icon library

### State Management
- **React Query** for server state
- **React Context** for authentication
- **AsyncStorage** for local storage
- **Expo SecureStore** for secure token storage

## 🐛 Troubleshooting

### Common Issues

1. **API Connection Errors**
   - Check if backend is running
   - Verify API_BASE_URL in `api/axiosClient.ts`
   - Check network connectivity

2. **Authentication Issues**
   - Clear app data and re-login
   - Check if JWT token is expired
   - Verify backend authentication endpoints

3. **Route Planning Fails**
   - Ensure vehicle is selected
   - Check if coordinates are valid
   - Verify backend has API keys configured

4. **Map Not Loading**
   - Check internet connection
   - Verify WebView permissions
   - Try refreshing the route

### Debug Mode
Enable debug logging by checking the console for:
- API request/response logs
- Authentication token status
- Error details and stack traces

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📧 Support

For support or questions:
- Check the backend README for API setup
- Review the troubleshooting section
- Check console logs for error details

**Happy routing! 🚗⚡**
