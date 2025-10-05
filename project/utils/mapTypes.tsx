export interface Output {
  success: boolean;
  distanceKm: number;
  totalTimeMinutes: number;
  totalTrafficDelayMin: number;
  estimatedBatteryUsagePercent: number;
  chargingRequired: boolean;
  chargingUrgency?: "low" | "medium" | "high" | "critical";
  finalEtaIso?: string;
  routeCoordinates: RouteCoordinate[];
  navigationSteps: NavigationStep[];
  chargingStations: ChargingStation[];
  dynamicChargingRecommendations?: any[];
  errors: any[];
  trafficSummary: TrafficSummary;
  batteryAnalysis: BatteryAnalysis;
  meta: Meta;
}

export interface RouteCoordinate {
  lat: number;
  lng: number;
  weatherColor?: string;
  weatherCondition?: string;
  trafficColor?: string;
  trafficLevel?: "free" | "moderate" | "heavy" | "severe" | "charging";
  predictedSpeedKmh?: number;
  segmentDistanceM?: number;
  segmentDurationSec?: number;
  trafficDelayMin?: number;
  segmentEtaIso?: string;
  expectedConsumptionKwh?: number;
  batteryLevelPercent?: number;
  batteryLevelKwh?: number;
  isChargingStop?: boolean;
  stationName?: string | null;
  chargingTimeMin?: number | null;
  chargeAddedPercent?: number | null;
}

export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
  type: string;
  direction?: string;
  modifier?: string;
}

export interface ChargingStation {
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  distanceFromRouteM?: number;
  detourExtraTimeMin?: number;
  etaAtStationMin?: number;
  estimatedChargingTimeMin?: number;
  estimatedChargeAddedPercent?: number;
  batteryOnArrivalPercent?: number;
  batteryOnDeparturePercent?: number;
  chargers?: Charger[];
  amenities?: Amenity[];
  isOptimal?: boolean;
  stopOrder?: number;
  notes?: string;
  realTimeAvailability?: string;
  highlighted?: boolean;
  markerData?: MarkerData;
}

export interface Charger {
  type: string;
  powerKw?: number;
  available?: number;
}

export interface Amenity {
  _id?: string;
  type?: string;
  amenity?: string;
  name?: string;
  distance?: number;
  lat?: number;
  lng?: number;
}

export interface MarkerData {
  stationId: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  size?: "small" | "medium" | "large";
}

export interface TrafficSummary {
  totalDelayMinutes: number;
  averageSpeedKmh: number;
  severeSegments: number;
  heavySegments: number;
  moderateSegments: number;
  freeFlowSegments: number;
}

export interface BatteryAnalysis {
  initialPercent: number;
  initialKwh?: number;
  finalPercent: number;
  finalKwh?: number;
  minPercent?: number;
  criticalPoints?: CriticalPoint[];
  totalConsumedKwh?: number;
  totalChargedKwh?: number;
  chargingNeeded?: boolean;
  minimumBatteryAtDestinationPercent?: number;
  minimumBatteryAtDestinationKwh?: number;
  userRequestedMinimumPercent?: number;
  willMeetRequirement?: boolean;
  shortfallKwh?: number;
  shortfallPercent?: number;
  surplusKwh?: number;
  surplusPercent?: number;
  recommendedChargeAtDestination?: RecommendedCharge | null;
}

export interface CriticalPoint {
  index: number;
  lat: number;
  lng: number;
  batteryPercent: number;
  batteryKwh?: number;
  distanceFromStart?: number;
}

export interface RecommendedCharge {
  needed: boolean;
  shortfallKwh?: number;
  shortfallPercent?: number;
  currentAtDestination?: number;
  requiredAtDestination?: number;
  chargeToPercent?: number;
  estimatedTimeMin?: number;
  reason?: string;
  nearbyStations?: ChargingStation[];
  recommendation?: string;
}

export interface Meta {
  routeProvider?: string;
  weatherProvider?: string;
  trafficProvider?: string;
  amenitiesProvider?: string;
  optimizationAlgorithm?: string;
  computedAtIso?: string;
}

export interface WayResponse {
  success: boolean;
  totalDistanceKm: number;
  totalTimeMin: number;
  way: WaySegment[];
  meta: {
    routeProvider?: string;
    computedAtIso?: string;
  };
}

export interface WaySegment {
  lat: number;
  lng: number;
  segmentDistanceM?: number;
  segmentDurationSec?: number;
  segmentEtaIso?: string;
  weatherCondition?: string;
  trafficLevel?: string;
  predictedSpeedKmh?: number;
  trafficDelayMin?: number;
}