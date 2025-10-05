import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ArrowLeft, Check, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { routeApi } from '@/api/routeApi';

export default function MapSelectorScreen() {
  const router = useRouter();
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [mapHtml, setMapHtml] = useState<string>('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (currentLocation) {
      generateMapHtml();
    }
  }, [currentLocation]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      setCurrentLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      // Default to a location if GPS fails
      setCurrentLocation({ lat: 22.7196, lng: 75.8577 }); // Indore, India
    }
  };

  const handleLocationSelect = async (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsLoadingAddress(true);
    
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=5ffe1f1598ac467dafc8789f5e787a3e`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const props = data.features[0].properties;
        const address = props.formatted || props.city || props.county || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setSelectedAddress(address);
      } else {
        setSelectedAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch (error) {
      console.error('Geocoding failed:', error);
      setSelectedAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const confirmDestination = () => {
    if (!selectedLocation) return;
    router.back();
    (global as any).selectedDestination = {
      coords: `${selectedLocation.lat},${selectedLocation.lng}`,
      address: selectedAddress,
    };
  };

  const generateMapHtml = () => {
    if (!currentLocation) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .current-location-icon {
            background-color: #3b82f6;
            border: 3px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          // Initialize map centered on current location
          var map = L.map('map').setView([${currentLocation.lat}, ${currentLocation.lng}], 13);
          
          // Add OpenStreetMap tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
          }).addTo(map);

          // Add current location marker with pulsing effect
          L.marker([${currentLocation.lat}, ${currentLocation.lng}], {
            icon: L.divIcon({
              className: 'current-location-marker',
              html: '<div class="current-location-icon"></div>',
              iconSize: [20, 20]
            })
          })
          .addTo(map)
          .bindPopup('<div style="font-family: sans-serif;"><strong>📍 Your Current Location</strong></div>')
          .openPopup();

          // Add circle around current location
          L.circle([${currentLocation.lat}, ${currentLocation.lng}], {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            radius: 100
          }).addTo(map);

          var selectedMarker = null;

          // Handle map clicks
          map.on('click', function(e) {
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;
            
            // Remove previous selected marker
            if (selectedMarker) {
              map.removeLayer(selectedMarker);
            }
            
            // Add new marker at clicked location
            selectedMarker = L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'destination-marker',
                html: '<div style="background-color: #ef4444; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); font-weight: bold;">📍</div>',
                iconSize: [30, 30]
              })
            }).addTo(map);
            
            selectedMarker.bindPopup('<div style="font-family: sans-serif;"><strong>🎯 Selected Destination</strong><br/>Tap confirm to select this location</div>').openPopup();
            
            // Send location to React Native
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'locationSelected',
              lat: lat,
              lng: lng
            }));
          });

          // Add instruction overlay
          var instructionControl = L.control({position: 'topright'});
          instructionControl.onAdd = function (map) {
            var div = L.DomUtil.create('div', 'instruction');
            div.style.background = 'rgba(255,255,255,0.9)';
            div.style.padding = '10px';
            div.style.borderRadius = '5px';
            div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            div.style.maxWidth = '200px';
            div.innerHTML = '<div style="font-family: sans-serif; font-size: 12px;"><strong>📍 Tap anywhere on the map to select your destination</strong></div>';
            return div;
          };
          instructionControl.addTo(map);
        </script>
      </body>
      </html>
    `;

    setMapHtml(html);
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationSelected') {
        handleLocationSelect(data.lat, data.lng);
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  if (!currentLocation || !mapHtml) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.headerTitle}>Select Destination</Text>
            <Image source={require('../../assets/images/icon.png')} style={{ width: 28, height: 28, resizeMode: 'contain' }} />
          </View>
          <Text style={styles.headerSubtitle}>Tap on the map</Text>
        </View>
      </View>

      {/* Map */}
      <WebView
        style={styles.map}
        source={{ html: mapHtml }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleWebViewMessage}
        startInLoadingState={true}
        scalesPageToFit={true}
      />

      {selectedLocation && (
        <View style={styles.bottomCard}>
          <View style={styles.coordsDisplay}>
            <Text style={styles.coordsLabel}>Coordinates:</Text>
            <Text style={styles.coordsValue}>
              {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
            </Text>
          </View>
          
          <View style={styles.addressDisplay}>
            <Text style={styles.addressLabel}>📍 Location:</Text>
            {isLoadingAddress ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.addressValue}>{selectedAddress}</Text>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.confirmButton} 
            onPress={confirmDestination}
            disabled={isLoadingAddress}
          >
            <Check size={20} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  map: {
    flex: 1,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  addressDisplay: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
    marginBottom: 6,
  },
  addressValue: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  coordsDisplay: {
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  coordsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  coordsValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#1e3a8a',
  },
  confirmButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});