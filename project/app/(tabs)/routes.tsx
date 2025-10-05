import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Modal, Dimensions, Image } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { storage } from '@/utils/storage';
import { useVehicles } from '@/hooks/useVehicles';
import { routeApi } from '@/api/routeApi';
import { RoutePlanRequest } from '@/types';
import { 
  Navigation, Battery, Clock, MapPin, Search, Zap, Settings, Target, 
  TrendingUp, Gauge, ChevronDown, CheckCircle2, Car
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/hooks/useAuth';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { LinearGradient as LG } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AMENITIES = [
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'washroom', label: 'Restroom', emoji: '🚻' },
  { id: 'ATM', label: 'ATM', emoji: '💰' },
  { id: 'parking', label: 'Parking', emoji: '🅿️' },
  { id: 'wifi', label: 'WiFi', emoji: '📶' }
];

export default function RoutesScreen() {
  const router = useRouter();
  const { vehicles } = useVehicles();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [currentCharge, setCurrentCharge] = useState('80');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [maxDetour, setMaxDetour] = useState('5');
  const [chargingSpeed, setChargingSpeed] = useState('50');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [sourceCoords, setSourceCoords] = useState('');
  const [destinationCoords, setDestinationCoords] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [sourceAddress, setSourceAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [consumptionOverride, setConsumptionOverride] = useState('');
  const [segmentDistanceMeters, setSegmentDistanceMeters] = useState('200');
  const [optimizationStrategy, setOptimizationStrategy] = useState<'time' | 'cost' | 'hybrid'>('hybrid');
  const [minimumBatteryAtDestinationPercent, setMinimumBatteryAtDestinationPercent] = useState('20');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadActiveVehicle();
  }, [vehicles, activeVehicleId]);

  useFocusEffect(
    useCallback(() => {
      loadActiveVehicle();
      if ((global as any).selectedDestination) {
        setDestination((global as any).selectedDestination.coords);
        setDestinationCoords((global as any).selectedDestination.coords);
        setDestinationAddress((global as any).selectedDestination.address);
        (global as any).selectedDestination = null;
      }
      return () => { };
    }, [])
  );

  const loadActiveVehicle = async () => {
    const vehicleId = await storage.getActiveVehicle();
    setActiveVehicleId(vehicleId);
  };

  const activeVehicle = vehicles.find(v => v._id === activeVehicleId || v.id === activeVehicleId);

  const estimatedChargedKwh = (() => {
    const pct = parseFloat(currentCharge || '0');
    if (!activeVehicle?.batteryCapacity || isNaN(pct)) return null;
    return (activeVehicle.batteryCapacity * (Math.min(100, Math.max(0, pct)) / 100));
  })();

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities(prev =>
      prev.includes(amenityId) ? prev.filter(a => a !== amenityId) : [...prev, amenityId]
    );
  };

  const geocodeAddress = async (address: string, isSource: boolean) => {
    if (!address.trim()) return;
    const coordRegex = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
    if (coordRegex.test(address.trim())) {
      const [lat, lng] = address.split(',').map(s => parseFloat(s.trim()));
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const coords = `${lat},${lng}`;
        if (isSource) {
          setSource(coords);
          setSourceCoords(coords);
          fetchAddressName(lat, lng, true);
        } else {
          setDestination(coords);
          setDestinationCoords(coords);
          fetchAddressName(lat, lng, false);
        }
        return;
      }
    }

    setIsGeocoding(true);
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&apiKey=5ffe1f1598ac467dafc8789f5e787a3e&limit=1`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const lat = feature.properties.lat;
        const lng = feature.properties.lon;
        const formattedAddress = feature.properties.formatted;
        const coords = `${lat},${lng}`;
        if (isSource) {
          setSource(coords);
          setSourceCoords(coords);
          setSourceAddress(formattedAddress);
        } else {
          setDestination(coords);
          setDestinationCoords(coords);
          setDestinationAddress(formattedAddress);
        }
      }
    } catch (error: any) {
      console.error('Geocoding error:', error?.message || String(error));
    } finally {
      setIsGeocoding(false);
    }
  };

  const fetchAddressName = async (lat: number, lng: number, isSource: boolean) => {
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=5ffe1f1598ac467dafc8789f5e787a3e`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const address = data.features[0].properties.formatted;
        if (isSource) {
          setSourceAddress(address);
        } else {
          setDestinationAddress(address);
        }
      }
    } catch (error: any) {
      console.error('Address fetch error:', error?.message || String(error));
    }
  };

  const resetForm = () => {
    setSource('');
    setDestination('');
    setSourceCoords('');
    setDestinationCoords('');
    setCurrentCharge('80');
    setSelectedAmenities([]);
    setMaxDetour('5');
    setChargingSpeed('50');
    setConsumptionOverride('');
    setSegmentDistanceMeters('200');
    setOptimizationStrategy('hybrid');
    setMinimumBatteryAtDestinationPercent('20');
  };

  const handlePlanRoute = async () => {
    if (!activeVehicle) {
      Alert.alert('Missing Vehicle', 'Please select a vehicle to plan the route.');
      return;
    }

    if (!sourceCoords || !destinationCoords) {
      Alert.alert('Missing Information', 'Please enter valid source and destination.');
      return;
    }

    const currentChargeNum = Math.min(100, Math.max(0, parseFloat(currentCharge || '100')));
    const currentChargedKwhNum = estimatedChargedKwh != null ? Number(estimatedChargedKwh.toFixed(3)) : null;
    const consumptionNum = consumptionOverride ? parseFloat(consumptionOverride) : (activeVehicle?.consumption_kWh_per_km ?? null);
    const preferredMaxDetourKmNum = Math.min(50, Math.max(0, parseFloat(maxDetour || '5')));
    const segmentDistanceMetersNum = Math.min(1000, Math.max(50, parseInt(segmentDistanceMeters || '200', 10)));
    const preferredChargingSpeedKwNum = chargingSpeed ? parseFloat(chargingSpeed) : null;
    const minimumBatteryAtDestinationPercentNum = Math.min(100, Math.max(0, parseFloat(minimumBatteryAtDestinationPercent || '20')));

    setIsPlanning(true);
    try {
      const request: RoutePlanRequest & any = {
        source: sourceCoords,
        destination: destinationCoords,
        vehicleId: activeVehicle._id || activeVehicle.id,
        currentChargePercent: Number.isFinite(currentChargeNum) ? currentChargeNum : 100,
        currentChargedKwh: currentChargedKwhNum,
        consumption_kWh_per_km: consumptionNum,
        preferredMaxDetourKm: preferredMaxDetourKmNum,
        segmentDistanceMeters: segmentDistanceMetersNum,
        amenitiesFilter: selectedAmenities.length > 0 ? selectedAmenities : [],
        preferredChargingSpeedKw: preferredChargingSpeedKwNum,
        optimizationStrategy: optimizationStrategy || 'hybrid',
        minimumBatteryAtDestinationPercent: minimumBatteryAtDestinationPercentNum,
      };

      const result = await routeApi.planRoute(request);
      router.push({
        pathname: '/map/view',
        params: {
          routeData: JSON.stringify(result),
          source: sourceCoords,
          destination: destinationCoords,
        },
      });
    } catch (error: any) {
      console.error('Route planning error:', error?.response?.data?.message || error?.message || String(error));
      Alert.alert('Error', error.response?.data?.message || error.message || 'Failed to plan route.');
    } finally {
      setIsPlanning(false);
    }
  };

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        getCurrentLocation();
      } else {
        Alert.alert('Location Permission', 'Location access is needed to use your current position as starting point.');
      }
    } catch (error: any) {
      console.error('Location permission error:', error?.message || String(error));
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };
      setCurrentLocation(coords);
    } catch (error: any) {
      console.error('Get location error:', error?.message || String(error));
      Alert.alert('Location Error', 'Could not get your current location. Please enter manually.');
    }
  };

  const useCurrentLocation = async () => {
    if (currentLocation) {
      const coordsString = `${currentLocation.lat},${currentLocation.lng}`;
      setSource(coordsString);
      setSourceCoords(coordsString);
      fetchAddressName(currentLocation.lat, currentLocation.lng, true);
    } else {
      getCurrentLocation();
    }
  };

  const openMapSelector = () => {
    router.push('/map/selector');
  };

  return (
    <View style={styles.container}>
      {/* Enhanced Header with Gradient */}
      <LinearGradient
        colors={['#3b82f6', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image source={require('../../assets/images/icon.png')} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
              <Text style={styles.title}>Plan Your Journey</Text>
            </View>
            <Navigation size={28} color="#fff" strokeWidth={2.5} />
          </View>
          <Text style={styles.subtitle}>Smart EV route planning with charging stops</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.scrollContent}>
          {!activeVehicle ? (
            <View style={styles.warningCard}>
              <View style={styles.warningIconContainer}>
                <Car size={32} color="#dc2626" />
              </View>
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>No Vehicle Selected</Text>
                <Text style={styles.warningText}>Please select a vehicle from the Vehicles tab before planning a route.</Text>
              </View>
            </View>
          ) : (
            <>
              {/* Vehicle Info Card */}
              <View style={styles.vehicleCard}>
                <View style={styles.vehicleIconBadge}>
                  <Zap size={20} color="#3b82f6" strokeWidth={2.5} />
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleLabel}>Active Vehicle</Text>
                  <Text style={styles.vehicleName}>{activeVehicle.name || activeVehicle.model}</Text>
                  <View style={styles.vehicleStats}>
                    <View style={styles.vehicleStat}>
                      <Battery size={14} color="#10b981" />
                      <Text style={styles.vehicleStatText}>{activeVehicle.batteryCapacity}kWh</Text>
                    </View>
                    <View style={styles.vehicleStat}>
                      <Gauge size={14} color="#f59e0b" />
                      <Text style={styles.vehicleStatText}>{activeVehicle.consumption_kWh_per_km}kWh/km</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Location Section */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MapPin size={20} color="#3b82f6" strokeWidth={2.5} />
                  <Text style={styles.sectionTitle}>Location</Text>
                </View>

                {/* Source Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Starting Point</Text>
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputIcon}>
                      <View style={styles.dotStart} />
                    </View>
                    <TextInput
                      style={styles.inputField}
                      placeholder="Enter address or coordinates"
                      placeholderTextColor="#94a3b8"
                      value={source}
                      onChangeText={(text) => {
                        setSource(text);
                        setSourceCoords('');
                        setSourceAddress('');
                      }}
                      editable={!isPlanning}
                    />
                    <TouchableOpacity
                      style={styles.searchBtn}
                      onPress={() => geocodeAddress(source, true)}
                      disabled={isGeocoding || isPlanning}
                    >
                      {isGeocoding ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Search size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity style={styles.quickBtn} onPress={useCurrentLocation}>
                    <Target size={16} color="#10b981" />
                    <Text style={styles.quickBtnText}>Use Current Location</Text>
                  </TouchableOpacity>

                  {sourceAddress && (
                    <View style={styles.addressBadge}>
                      <CheckCircle2 size={14} color="#10b981" />
                      <Text style={styles.addressBadgeText} numberOfLines={2}>{sourceAddress}</Text>
                    </View>
                  )}
                </View>

                {/* Destination Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Destination</Text>
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputIcon}>
                      <View style={styles.dotEnd} />
                    </View>
                    <TextInput
                      style={styles.inputField}
                      placeholder="Enter address or coordinates"
                      placeholderTextColor="#94a3b8"
                      value={destination}
                      onChangeText={(text) => {
                        setDestination(text);
                        setDestinationCoords('');
                        setDestinationAddress('');
                      }}
                      editable={!isPlanning}
                    />
                    <TouchableOpacity
                      style={styles.searchBtn}
                      onPress={() => geocodeAddress(destination, false)}
                      disabled={isGeocoding || isPlanning}
                    >
                      {isGeocoding ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Search size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.quickBtn} onPress={openMapSelector}>
                    <MapPin size={16} color="#3b82f6" />
                    <Text style={styles.quickBtnText}>Select on Map</Text>
                  </TouchableOpacity>

                  {destinationAddress && (
                    <View style={styles.addressBadge}>
                      <CheckCircle2 size={14} color="#10b981" />
                      <Text style={styles.addressBadgeText} numberOfLines={2}>{destinationAddress}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Battery & Optimization Section */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Battery size={20} color="#3b82f6" strokeWidth={2.5} />
                  <Text style={styles.sectionTitle}>Battery & Optimization</Text>
                </View>

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Current Charge</Text>
                    <View style={styles.inputWithUnit}>
                      <TextInput
                        style={styles.inputFieldSmall}
                        placeholder="80"
                        placeholderTextColor="#94a3b8"
                        value={currentCharge}
                        onChangeText={setCurrentCharge}
                        keyboardType="numeric"
                        editable={!isPlanning}
                      />
                      <Text style={styles.inputUnit}>%</Text>
                    </View>
                    {estimatedChargedKwh !== null && !isNaN(estimatedChargedKwh) && (
                      <Text style={styles.inputHint}>≈ {estimatedChargedKwh.toFixed(1)}kWh</Text>
                    )}
                  </View>

                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Min at Destination</Text>
                    <View style={styles.inputWithUnit}>
                      <TextInput
                        style={styles.inputFieldSmall}
                        placeholder="20"
                        placeholderTextColor="#94a3b8"
                        value={minimumBatteryAtDestinationPercent}
                        onChangeText={setMinimumBatteryAtDestinationPercent}
                        keyboardType="numeric"
                        editable={!isPlanning}
                      />
                      <Text style={styles.inputUnit}>%</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.strategyContainer}>
                  <Text style={styles.inputLabel}>Optimization Strategy</Text>
                  <View style={styles.strategyRow}>
                    {(['hybrid', 'time', 'cost'] as const).map((strategy) => (
                      <TouchableOpacity
                        key={strategy}
                        style={[
                          styles.strategyChip,
                          optimizationStrategy === strategy && styles.strategyChipActive
                        ]}
                        onPress={() => setOptimizationStrategy(strategy)}
                        disabled={isPlanning}
                      >
                        <Text style={[
                          styles.strategyText,
                          optimizationStrategy === strategy && styles.strategyTextActive
                        ]}>
                          {strategy === 'hybrid' ? '⚡ Balanced' : strategy === 'time' ? '🏃 Fast' : '💰 Economical'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Amenities Section */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Settings size={20} color="#3b82f6" strokeWidth={2.5} />
                  <Text style={styles.sectionTitle}>Amenities Filter</Text>
                </View>
                <View style={styles.amenitiesGrid}>
                  {AMENITIES.map((amenity) => (
                    <TouchableOpacity
                      key={amenity.id}
                      style={[
                        styles.amenityChipNew,
                        selectedAmenities.includes(amenity.id) && styles.amenityChipActiveNew
                      ]}
                      onPress={() => toggleAmenity(amenity.id)}
                      disabled={isPlanning}
                    >
                      <Text style={styles.amenityEmoji}>{amenity.emoji}</Text>
                      <Text style={[
                        styles.amenityLabel,
                        selectedAmenities.includes(amenity.id) && styles.amenityLabelActive
                      ]}>
                        {amenity.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Advanced Settings (Collapsible) */}
              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Settings size={18} color="#64748b" />
                <Text style={styles.advancedToggleText}>Advanced Settings</Text>
                <ChevronDown
                  size={18}
                  color="#64748b"
                  style={{ transform: [{ rotate: showAdvanced ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.sectionCard}>
                  <View style={styles.row}>
                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Max Detour</Text>
                      <View style={styles.inputWithUnit}>
                        <TextInput
                          style={styles.inputFieldSmall}
                          placeholder="5"
                          placeholderTextColor="#94a3b8"
                          value={maxDetour}
                          onChangeText={setMaxDetour}
                          keyboardType="numeric"
                          editable={!isPlanning}
                        />
                        <Text style={styles.inputUnit}>km</Text>
                      </View>
                    </View>

                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Charging Speed</Text>
                      <View style={styles.inputWithUnit}>
                        <TextInput
                          style={styles.inputFieldSmall}
                          placeholder="50"
                          placeholderTextColor="#94a3b8"
                          value={chargingSpeed}
                          onChangeText={setChargingSpeed}
                          keyboardType="numeric"
                          editable={!isPlanning}
                        />
                        <Text style={styles.inputUnit}>kW</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Consumption</Text>
                      <View style={styles.inputWithUnit}>
                        <TextInput
                          style={styles.inputFieldSmall}
                          placeholder={activeVehicle?.consumption_kWh_per_km?.toString() || '0.2'}
                          placeholderTextColor="#94a3b8"
                          value={consumptionOverride}
                          onChangeText={setConsumptionOverride}
                          keyboardType="numeric"
                          editable={!isPlanning}
                        />
                        <Text style={styles.inputUnit}>kWh/km</Text>
                      </View>
                    </View>

                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Segment</Text>
                      <View style={styles.inputWithUnit}>
                        <TextInput
                          style={styles.inputFieldSmall}
                          placeholder="200"
                          placeholderTextColor="#94a3b8"
                          value={segmentDistanceMeters}
                          onChangeText={setSegmentDistanceMeters}
                          keyboardType="numeric"
                          editable={!isPlanning}
                        />
                        <Text style={styles.inputUnit}>m</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.planButton, isPlanning && styles.buttonDisabled]}
                  onPress={handlePlanRoute}
                  disabled={isPlanning}
                  activeOpacity={0.8}
                >
                  {isPlanning ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.planButtonText}>Planning...</Text>
                    </>
                  ) : (
                    <>
                      <Navigation size={20} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.planButtonText}>Plan Route</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={resetForm}
                  disabled={isPlanning}
                >
                  <Text style={styles.resetButtonText}>Reset Form</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    gap: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    // use marginRight on icon instead
  },
  warningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  warningContent: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 0,
  },
  warningText: {
    fontSize: 14,
    color: '#dc2626',
    lineHeight: 20,
    marginTop: 0,
  },
  vehicleCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  vehicleIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vehicleInfo: {
    flex: 1,
    gap: 4,
  },
  vehicleLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
    marginBottom: 8,
  },
  vehicleStats: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 0,
  },
  vehicleStatText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginLeft: 0,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  inputIcon: {
    width: 40,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
  },
  dotEnd: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#ef4444',
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    paddingVertical: 12,
    fontWeight: '500',
  },
  searchBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderRadius: 10,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
  },
  addressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  addressBadgeText: {
    flex: 1,
    fontSize: 12,
    color: '#166534',
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingRight: 12,
  },
  inputFieldSmall: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontWeight: '600',
  },
  inputUnit: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  inputHint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    marginLeft: 4,
  },
  strategyContainer: {
    marginTop: 4,
  },
  strategyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  strategyChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  strategyChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  strategyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  strategyTextActive: {
    color: '#fff',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amenityChipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  amenityChipActiveNew: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  amenityEmoji: {
    fontSize: 16,
  },
  amenityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  amenityLabelActive: {
    color: '#1e40af',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  actionButtons: {
    marginVertical: 12,
    gap: 10,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  planButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  resetButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
});