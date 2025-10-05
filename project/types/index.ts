export interface User {
  _id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    _id: string;
    name: string;
    email: string;
    token: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name?: string;
}

export interface Vehicle {
  id?: string;
  _id?: string;
  userId: string;
  name: string;
  model: string;
  size: string;
  batteryCapacity: number;
  consumptionRate?: number;
  consumption_kWh_per_km?: number;
  kmRun: number;
  degradation?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleInput {
  name: string;
  model: string;
  size: string;
  batteryCapacity: number;
  consumption_kWh_per_km: number;
  kmRun: number;
  degradationPercent?: number;
  chargingPortType?: string;
  maxChargePower?: number;
  topSpeed?: number;
}

export interface GeocodeResult {
  success: boolean;
  data: {
    lat: number;
    lng: number;
    formattedAddress: string;
    confidence?: number;
    locality?: string;
    region?: string;
    country?: string;
    type?: string;
    suggestions?: Array<{
      lat: number;
      lng: number;
      address: string;
      confidence: number;
    }>;
    warning?: string;
  };
}

export interface ChargingStation {
  _id: string;
  name: string;
  lat: number;
  lng: number;
  amenities: string[];
  chargingSpeedKw: number;
  etaFromPrevious: number;
  estimatedChargingTime: number;
  distanceFromPrevious: number;
}

export interface RouteSegment {
  coordinates: [number, number][];
  weather?: string;
  traffic?: string;
}

export interface RoutePlanRequest {
  source: string; // "lat,lng" format
  destination: string; // "lat,lng" format
  vehicleId: string;
  currentChargePercent?: number;
  currentChargedKwh?: number;
  consumption_kWh_per_km?: number;
  preferredMaxDetourKm?: number;
  segmentDistanceMeters?: number;
  amenitiesFilter?: string[];
  preferredChargingSpeedKw?: number;
  optimizationStrategy?: 'time' | 'cost' | 'hybrid';
  minimumBatteryAtDestinationPercent?: number;
}

// Helper function to validate and format coordinates
export function formatCoordinates(lat: number, lng: number): string {
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinates: NaN values');
  }
  if (lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat} (must be between -90 and 90)`);
  }
  if (lng < -180 || lng > 180) {
    throw new Error(`Invalid longitude: ${lng} (must be between -180 and 180)`);
  }
  return `${lat},${lng}`;
}

export function parseCoordinates(coordString: string): { lat: number; lng: number } {
  const parts = coordString.split(',');
  if (parts.length !== 2) {
    throw new Error('Coordinates must be in "lat,lng" format');
  }
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinate values');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Coordinates out of valid range');
  }
  
  return { lat, lng };
}

export interface RoutePlanResponse {
  success: boolean;
  distanceKm: number;
  totalTimeMinutes: number;
  totalTrafficDelayMin: number;
  estimatedBatteryUsagePercent: number;
  chargingRequired: boolean;
  finalEtaIso: string;
  routeCoordinates: Array<{
    lat: number;
    lng: number;
    weatherColor?: string;
    trafficColor?: string;
    predictedSpeedKmh?: number;
    segmentDistanceM?: number;
    segmentDurationSec?: number;
    trafficDelayMin?: number;
    expectedConsumptionKwh?: number;
  }>;
  chargingStations: ChargingStation[];
  trafficSummary?: {
    totalDelayMinutes: number;
    averageSpeedKmh: number;
    severeSegments: number;
    heavySegments: number;
  };
}
