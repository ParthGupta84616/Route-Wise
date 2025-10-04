import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { storage } from '@/utils/storage';
import { useVehicles } from '@/hooks/useVehicles';
import { routeApi } from '@/api/routeApi';
import { RoutePlanRequest } from '@/types';
import { Navigation, Battery, Clock, MapPin, Search } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/hooks/useAuth';
import * as Location from 'expo-location';

const AMENITIES = ['food', 'washroom', 'ATM', 'parking', 'wifi'];

export default function RoutesScreen() {
  const router = useRouter();
  const { vehicles } = useVehicles();
  const { isAuthenticated } = useAuth();

  // Check auth when screen loads
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
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);

  useEffect(() => {
    loadActiveVehicle();
  }, []);

  // Reset form when navigating away and back
  useFocusEffect(
    useCallback(() => {
      loadActiveVehicle();
      
      // Check if user selected a destination from map
      if (global.selectedDestination) {
        setDestination(global.selectedDestination.coords);
        setDestinationCoords(global.selectedDestination.coords);
        
        // Show confirmation
        Alert.alert(
          'Destination Set',
          `Selected: ${global.selectedDestination.address}`,
          [{ text: 'OK' }]
        );
        
        // Clear the global variable
        global.selectedDestination = null;
      }
      
      return () => {
        // Optional: Reset form when leaving the screen
        // setSource('');
        // setDestination('');
      };
    }, [])
  );

  const loadActiveVehicle = async () => {
    const vehicleId = await storage.getActiveVehicle();
    setActiveVehicleId(vehicleId);
  };

  const activeVehicle = vehicles.find(v => v._id === activeVehicleId || v.id === activeVehicleId);

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities(prev =>
      prev.includes(amenity)
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
    );
  };

  const geocodeAddress = async (address: string, isSource: boolean) => {
    if (!address.trim()) return;
    
    setIsGeocoding(true);
    try {
      const result = await routeApi.geocode(address);
      if (result.success && result.data) {
        const coords = `${result.data.lat},${result.data.lng}`;
        if (isSource) {
          setSourceCoords(coords);
          setSource(coords);
        } else {
          setDestinationCoords(coords);
          setDestination(coords);
        }
        Alert.alert(
          'Location Found',
          `Found: ${result.data.formattedAddress}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not find the location. Please try a different address.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to geocode address. Please try again.');
    } finally {
      setIsGeocoding(false);
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
  };

  const handlePlanRoute = async () => {
    if (!activeVehicle) {
      Alert.alert('No Vehicle Selected', 'Please select a vehicle from the Vehicles tab first.');
      return;
    }

    if (!source || !destination) {
      Alert.alert('Missing Information', 'Please enter both source and destination.');
      return;
    }

    setIsPlanning(true);

    try {
      const request: RoutePlanRequest = {
        source,
        destination,
        vehicleId: activeVehicle._id || activeVehicle.id,
        currentChargePercent: parseFloat(currentCharge),
        preferredMaxDetourKm: parseFloat(maxDetour),
        amenitiesFilter: selectedAmenities.length > 0 ? selectedAmenities : undefined,
        preferredChargingSpeedKw: parseFloat(chargingSpeed),
        segmentDistanceMeters: 300,
      };

      const result = await routeApi.planRoute(request);

      router.push({
        pathname: '/map/view',
        params: {
          routeData: JSON.stringify(result),
          source,
          destination,
        },
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to plan route');
    } finally {
      setIsPlanning(false);
    }
  };

  // Add location permission request
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
    } catch (error) {
      console.error('Location permission error:', error);
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
    } catch (error) {
      console.error('Get location error:', error);
      Alert.alert('Location Error', 'Could not get your current location. Please enter manually.');
    }
  };

  const useCurrentLocation = () => {
    if (currentLocation) {
      const coordsString = `${currentLocation.lat},${currentLocation.lng}`;
      setSource(coordsString);
      setSourceCoords(coordsString);
      Alert.alert('Location Set', 'Your current location has been set as the starting point.');
    } else {
      Alert.alert('Location Not Available', 'Please wait while we get your location, or enter manually.');
      getCurrentLocation();
    }
  };

  const openMapSelector = () => {
    // Navigate to map selector screen
    router.push('/map/selector');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Plan Route</Text>
        {activeVehicle && (
          <Text style={styles.subtitle}>{activeVehicle.name}</Text>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {!activeVehicle ? (
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>No Vehicle Selected</Text>
            <Text style={styles.warningText}>
              Please select a vehicle from the Vehicles tab before planning a route.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Route Details</Text>

              <View style={styles.inputContainer}>
                <View style={styles.inputLabel}>
                  <MapPin size={18} color="#2563eb" />
                  <Text style={styles.label}>Source</Text>
                </View>
                <View style={styles.inputWithButton}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    placeholder="Enter starting location (lat,lng or address)"
                    value={source}
                    onChangeText={setSource}
                    editable={!isPlanning}
                  />
                  <TouchableOpacity
                    style={[styles.geocodeButton, isGeocoding && styles.buttonDisabled]}
                    onPress={() => geocodeAddress(source, true)}
                    disabled={isGeocoding || isPlanning}
                  >
                    <Search size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                
                {/* GPS Button */}
                <TouchableOpacity
                  style={styles.gpsButton}
                  onPress={useCurrentLocation}
                  disabled={!locationPermission || isPlanning}
                >
                  <MapPin size={16} color="#10b981" />
                  <Text style={styles.gpsButtonText}>Use Current Location</Text>
                </TouchableOpacity>
                
                {sourceCoords && (
                  <Text style={styles.coordsText}>Coordinates: {sourceCoords}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputLabel}>
                  <Navigation size={18} color="#2563eb" />
                  <Text style={styles.label}>Destination</Text>
                </View>
                <View style={styles.inputWithButton}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    placeholder="Enter destination (lat,lng or address)"
                    value={destination}
                    onChangeText={setDestination}
                    editable={!isPlanning}
                  />
                  <TouchableOpacity
                    style={[styles.geocodeButton, isGeocoding && styles.buttonDisabled]}
                    onPress={() => geocodeAddress(destination, false)}
                    disabled={isGeocoding || isPlanning}
                  >
                    <Search size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                
                {/* Map Selector Button */}
                <TouchableOpacity
                  style={styles.mapSelectorButton}
                  onPress={openMapSelector}
                  disabled={isPlanning}
                >
                  <Navigation size={16} color="#2563eb" />
                  <Text style={styles.mapSelectorButtonText}>Select on Map</Text>
                </TouchableOpacity>
                
                {destinationCoords && (
                  <Text style={styles.coordsText}>Coordinates: {destinationCoords}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputLabel}>
                  <Battery size={18} color="#2563eb" />
                  <Text style={styles.label}>Current Charge (%)</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="80"
                  value={currentCharge}
                  onChangeText={setCurrentCharge}
                  keyboardType="decimal-pad"
                  editable={!isPlanning}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preferences</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Max Detour (km)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  value={maxDetour}
                  onChangeText={setMaxDetour}
                  keyboardType="decimal-pad"
                  editable={!isPlanning}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Preferred Charging Speed (kW)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  value={chargingSpeed}
                  onChangeText={setChargingSpeed}
                  keyboardType="decimal-pad"
                  editable={!isPlanning}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities Filter</Text>
              <View style={styles.amenities}>
                {AMENITIES.map(amenity => (
                  <TouchableOpacity
                    key={amenity}
                    style={[
                      styles.amenityChip,
                      selectedAmenities.includes(amenity) && styles.amenityChipSelected,
                    ]}
                    onPress={() => toggleAmenity(amenity)}
                    disabled={isPlanning}
                  >
                    <Text
                      style={[
                        styles.amenityText,
                        selectedAmenities.includes(amenity) && styles.amenityTextSelected,
                      ]}
                    >
                      {amenity}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isPlanning && styles.buttonDisabled]}
              onPress={handlePlanRoute}
              disabled={isPlanning}
            >
              {isPlanning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Navigation size={20} color="#fff" />
                  <Text style={styles.buttonText}>Plan Route</Text>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  warning: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  amenities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  amenityChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  amenityText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  amenityTextSelected: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  geocodeButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coordsText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 4,
    fontStyle: 'italic',
  },
  resetButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  resetButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#10b981',
    marginTop: 8,
  },
  gpsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10b981',
  },
  mapSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#2563eb',
    marginTop: 8,
  },
  mapSelectorButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb',
  },
});