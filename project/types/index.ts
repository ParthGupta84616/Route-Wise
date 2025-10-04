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
  source: string;
  destination: string;
  vehicleId: string;
  currentChargePercent: number;
  segmentDistanceMeters?: number;
  preferredMaxDetourKm?: number;
  amenitiesFilter?: string[];
  preferredChargingSpeedKw?: number;
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
