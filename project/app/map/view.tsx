import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft, Clock, Battery, MapPin, Zap, AlertTriangle, Info, CheckCircle, XCircle,
  Coffee, Utensils, Wifi, ShoppingCart, Home, Fuel, WashingMachine, ParkingCircle,
  Hotel, Heart, DollarSign, Filter, Navigation, X
} from 'lucide-react-native';
import { Amenity, ChargingStation, Output } from "@/utils/mapTypes";
import { routeApi } from '@/api/routeApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MapViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeData: string; source: string; destination: string }>();
  const webViewRef = useRef<WebView>(null);
  
  const [routeData, setRouteData] = useState<Output | null>(null);
  const [mapHtml, setMapHtml] = useState('');
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sourceAddress, setSourceAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [maxDistance, setMaxDistance] = useState(1000);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [amenityRoute, setAmenityRoute] = useState<any>(null);
  const [isLoadingAmenityRoute, setIsLoadingAmenityRoute] = useState(false);
  const [selectedAmenity, setSelectedAmenity] = useState<Amenity | null>(null);
  
  const amenityCategories = ['food', 'washroom', 'medical', 'hotel', 'wifi', 'parking', 'cafe', 'restaurant', 'fuel', 'atm'];

  useEffect(() => {
    if (params.routeData) {
      try {
        const data: Output = JSON.parse(params.routeData);
        setRouteData(data);
        generateEnhancedMapHtml(data);
        
        if (data.routeCoordinates && data.routeCoordinates.length > 0) {
          const start = data.routeCoordinates[0];
          const end = data.routeCoordinates[data.routeCoordinates.length - 1];
          fetchAddressNames(start.lat, start.lng, end.lat, end.lng);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Failed to parse route data:', error);
        setLoading(false);
      }
    }
  }, [params.routeData]);

  const fetchAddressNames = async (startLat: number, startLng: number, endLat: number, endLng: number) => {
    try {
      const [startRes, endRes] = await Promise.all([
        fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${startLat}&lon=${startLng}&apiKey=5ffe1f1598ac467dafc8789f5e787a3e`),
        fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${endLat}&lon=${endLng}&apiKey=5ffe1f1598ac467dafc8789f5e787a3e`)
      ]);
      
      const [startData, endData] = await Promise.all([startRes.json(), endRes.json()]);
      
      if (startData.features?.[0]) {
        const props = startData.features[0].properties;
        setSourceAddress(props.city || props.county || props.formatted || 'Start');
      }
      
      if (endData.features?.[0]) {
        const props = endData.features[0].properties;
        setDestAddress(props.city || props.county || props.formatted || 'Destination');
      }
    } catch (error) {
      console.error('Failed to fetch address names:', error);
    }
  };

  const generateEnhancedMapHtml = (data: Output) => {
    const coordinates = data.routeCoordinates || [];
    if (coordinates.length === 0) return;

    const centerLat = coordinates[Math.floor(coordinates.length / 2)].lat;
    const centerLng = coordinates[Math.floor(coordinates.length / 2)].lng;

    const routeSegments = coordinates.map((coord, index) => {
      const nextCoord = coordinates[index + 1];
      if (!nextCoord) return '';

      const color = coord.trafficColor || '#10b981';
      const batteryPercent = coord.batteryLevelPercent || 100;
      const isCritical = batteryPercent < 20;
      const isCharging = coord.isChargingStop;
      
      const weight = isCharging ? 12 : (isCritical ? 8 : 5);
      const dashArray = isCritical ? '10, 5' : 'none';

      let popupContent = '';
      if (coord.isChargingStop) {
        popupContent = `<div style="font-family: system-ui; padding: 6px; min-width: 180px;"><div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #1e293b;">⚡ Charging Stop</div><div style="color: #64748b; font-size: 11px; line-height: 1.5;"><div>🏪 <strong>${coord.stationName || 'Station'}</strong></div><div>⏱️ ${coord.chargingTimeMin || 0}min charge</div><div>🔋 +${coord.chargeAddedPercent || 0}%</div></div></div>`;
      } else {
        popupContent = `<div style="font-family: system-ui; padding: 6px; min-width: 180px;"><div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #1e293b;">📍 Segment ${index + 1}</div><div style="color: #64748b; font-size: 11px; line-height: 1.5;"><div>🚦 ${coord.trafficLevel || 'free'} • ${coord.predictedSpeedKmh || 60}km/h</div><div>🌤️ ${coord.weatherCondition || 'clear'}</div><div>📏 ${((coord.segmentDistanceM || 0) / 1000).toFixed(1)}km</div><div>🔋 ${batteryPercent.toFixed(1)}%</div></div></div>`;
      }

      return `L.polyline([[${coord.lat}, ${coord.lng}], [${nextCoord.lat}, ${nextCoord.lng}]], {color: '${color}', weight: ${weight}, opacity: 0.85, dashArray: '${dashArray}'}).addTo(map).bindPopup(${JSON.stringify(popupContent)});`;
    }).join('\n');

    // Generate ALL amenity markers
    const allAmenityMarkers = data.chargingStations.map((station, stationIdx) => {
      if (!station.amenities || station.amenities.length === 0) return '';
      
      return station.amenities.map((amenity, amenityIdx) => {
        if (!amenity.lat || !amenity.lng) return '';
        
        const type = (amenity.type || amenity.amenity || '').toLowerCase();
        let emoji = '📍';
        
        if (type.includes('food')) emoji = '🍽️';
        else if (type.includes('washroom') || type.includes('restroom')) emoji = '🚻';
        else if (type.includes('medical')) emoji = '🏥';
        else if (type.includes('hotel')) emoji = '🏨';
        else if (type.includes('wifi')) emoji = '📶';
        else if (type.includes('parking')) emoji = '🅿️';
        else if (type.includes('cafe') || type.includes('coffee')) emoji = '☕';
        else if (type.includes('restaurant')) emoji = '🍴';
        else if (type.includes('fuel')) emoji = '⛽';
        else if (type.includes('atm')) emoji = '💰';
        
        const name = amenity.name || amenity.amenity || amenity.type || 'Amenity';
        const distance = amenity.distance ? `${amenity.distance.toFixed(0)}m away` : '';
        
        const popupContent = `<div style="font-family: system-ui; padding: 6px; min-width: 160px;"><div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #1e293b;">${emoji} ${name}</div><div style="color: #64748b; font-size: 11px; line-height: 1.5;"><div>📍 ${type}</div>${distance ? `<div>↔️ ${distance}</div>` : ''}</div></div>`;
        
        return `var amenity${stationIdx}_${amenityIdx}Icon = L.divIcon({className: 'amenity-marker', html: '<div style="background: #7c3aed; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4); border: 2px solid white;">${emoji}</div>', iconSize: [28, 28]}); L.marker([${amenity.lat}, ${amenity.lng}], { icon: amenity${stationIdx}_${amenityIdx}Icon }).addTo(map).bindPopup(${JSON.stringify(popupContent)});`;
      }).join('\n');
    }).join('\n');

    const chargingStations = data.chargingStations.map((station, idx) => {
      const stationColor = station.isOptimal ? '#10b981' : '#3b82f6';
      const stationGradient = station.isOptimal ? '#059669' : '#2563eb';
      const stationPopup = `<div style="font-family: system-ui; padding: 8px; min-width: 220px;"><div style="font-weight: 700; font-size: 14px; color: #1e293b; margin-bottom: 6px;">${station.isOptimal ? '⭐ ' : ''}${station.name}</div><div style="background: #f1f5f9; padding: 8px; border-radius: 8px; font-size: 11px;"><div style="margin-bottom: 4px;"><strong>Stop ${station.stopOrder}</strong></div><div style="color: #64748b; line-height: 1.5;"><div>⚡ +${station.estimatedChargeAddedPercent}% in ${station.estimatedChargingTimeMin}min</div><div>🔋 ${station.batteryOnArrivalPercent}% → ${station.batteryOnDeparturePercent}%</div><div>📍 ${((station.distanceFromRouteM || 0) / 1000).toFixed(1)}km detour</div>${station.realTimeAvailability === 'available' ? '<div style="color: #10b981; font-weight: 600;">✅ Available</div>' : '<div style="color: #94a3b8;">⏳ Unknown</div>'}</div></div></div>`;
      
      return `
        var station${idx}Icon = L.divIcon({className: 'custom-station-icon', html: '<div style="background: linear-gradient(135deg, ${stationColor} 0%, ${stationGradient} 100%); width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 3px solid white;">⚡</div>', iconSize: [42, 42]});
        var station${idx}Marker = L.marker([${station.lat}, ${station.lng}], { icon: station${idx}Icon }).addTo(map).bindPopup(${JSON.stringify(stationPopup)}, { maxWidth: 260 });
        window.stations = window.stations || {};
        window.stations['${station.stationId}'] = {marker: station${idx}Marker, lat: ${station.lat}, lng: ${station.lng}};
        L.circle([${station.lat}, ${station.lng}], {color: '${stationColor}', fillColor: '${stationColor}', fillOpacity: 0.06, weight: 2, opacity: 0.3, radius: ${(station.distanceFromRouteM || 500) * 2}}).addTo(map);
      `;
    }).join('\n');

    const filteredCriticalPoints = [];
    const criticalPoints = data.batteryAnalysis.criticalPoints || [];
    if (criticalPoints.length > 0) {
      filteredCriticalPoints.push(criticalPoints[0]);
      for (let i = 1; i < criticalPoints.length; i++) {
        const lastAdded = filteredCriticalPoints[filteredCriticalPoints.length - 1];
        const current = criticalPoints[i];
        const distance = Math.abs((current.distanceFromStart || 0) - (lastAdded.distanceFromStart || 0));
        if (distance >= 3) filteredCriticalPoints.push(current);
      }
    }

    const criticalPointsHtml = filteredCriticalPoints.map((point) => {
      const criticalPopup = `<div style="font-family: system-ui; padding: 6px; min-width: 140px;"><div style="font-weight: 700; color: #dc2626; margin-bottom: 3px; font-size: 12px;">🚨 Critical Battery</div><div style="font-size: 11px; color: #64748b; line-height: 1.5;"><div>🔋 ${point.batteryPercent.toFixed(1)}%</div><div>📏 ${point.distanceFromStart?.toFixed(1) || 0}km</div></div></div>`;
      return `L.marker([${point.lat}, ${point.lng}], {icon: L.divIcon({className: 'warning-marker', html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.5); border: 2px solid white;">⚠️</div>', iconSize: [30, 30]})}).addTo(map).bindPopup(${JSON.stringify(criticalPopup)});`;
    }).join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100%; height: 100vh; }
          .leaflet-popup-content-wrapper { border-radius: 10px; padding: 0; }
          .leaflet-popup-content { margin: 0; }
          .amenity-marker { animation: pulse 2s infinite; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 12);
          var highlightedMarker = null;
          var amenityRouteLine = null;
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          ${routeSegments}
          ${chargingStations}
          ${allAmenityMarkers}
          ${criticalPointsHtml}

          L.marker([${coordinates[0].lat}, ${coordinates[0].lng}], {
            icon: L.divIcon({
              html: '<div style="background: #10b981; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">🏁</div>',
              iconSize: [34, 34]
            })
          }).addTo(map).bindPopup('<div style="padding: 4px; font-size: 12px;"><strong>🏁 Start</strong></div>');

          L.marker([${coordinates[coordinates.length - 1].lat}, ${coordinates[coordinates.length - 1].lng}], {
            icon: L.divIcon({
              html: '<div style="background: #ef4444; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">🎯</div>',
              iconSize: [34, 34]
            })
          }).addTo(map).bindPopup('<div style="padding: 4px; font-size: 12px;"><strong>🎯 Destination</strong></div>');

          map.fitBounds([${coordinates.map(c => `[${c.lat}, ${c.lng}]`).join(',')}], { padding: [40, 40] });

          function highlightAmenity(lat, lng, name, emoji) {
            if (highlightedMarker) {
              map.removeLayer(highlightedMarker);
            }

            var icon = L.divIcon({
              className: 'highlighted-amenity',
              html: '<div style="background: #ef4444; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6); border: 4px solid white; animation: bounce 0.5s;">' + emoji + '</div>',
              iconSize: [40, 40]
            });

            highlightedMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
            highlightedMarker.bindPopup('<div style="padding: 6px; font-size: 13px; font-weight: 700;">' + emoji + ' ' + name + '</div>').openPopup();
            map.setView([lat, lng], 15, { animate: true, duration: 0.5 });
          }

          function drawAmenityRoute(stationLat, stationLng, amenityLat, amenityLng, routeCoords) {
            if (amenityRouteLine) {
              map.removeLayer(amenityRouteLine);
            }

            if (routeCoords && routeCoords.length > 0) {
              amenityRouteLine = L.polyline(routeCoords, {
                color: '#7c3aed',
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 5'
              }).addTo(map);

              var bounds = L.latLngBounds(routeCoords);
              map.fitBounds(bounds, { padding: [50, 50], animate: true });
            }
          }

          function clearAmenityRoute() {
            if (amenityRouteLine) {
              map.removeLayer(amenityRouteLine);
              amenityRouteLine = null;
            }
            if (highlightedMarker) {
              map.removeLayer(highlightedMarker);
              highlightedMarker = null;
            }
          }

          window.highlightAmenity = highlightAmenity;
          window.drawAmenityRoute = drawAmenityRoute;
          window.clearAmenityRoute = clearAmenityRoute;
        </script>
      </body>
      </html>
    `;

    setMapHtml(html);
  };

  const navigateToAmenity = async (amenity: Amenity) => {
    if (!amenity.lat || !amenity.lng || !selectedStation) return;

    setIsLoadingAmenityRoute(true);
    setSelectedAmenity(amenity);

    try {
      // Call the API (use alias getWay or the explicit getWayToAmenity)
      const wayResp = await routeApi.getWayToAmenity(
        `${selectedStation.lat},${selectedStation.lng}`,
        `${amenity.lat},${amenity.lng}`
      );

      // Expecting { success, totalDistanceKm, totalTimeMin, way: [{lat,lng,...}] }
      if (wayResp && wayResp.success && Array.isArray(wayResp.way) && wayResp.way.length > 0) {
        const routeCoords = wayResp.way.map((s: any) => [s.lat, s.lng]);

        setAmenityRoute({
          totalDistanceKm: wayResp.totalDistanceKm || 0,
          totalTimeMin: wayResp.totalTimeMin || 0,
          coordinates: routeCoords
        });

        // Close modal
        setShowStationModal(false);

        // Draw route on map after small delay
        setTimeout(() => {
          const { emoji } = getAmenityIcon(amenity);
          const name = amenity.name || amenity.amenity || amenity.type || 'Amenity';

          const jsCode = `
            if (window.highlightAmenity) {
              window.highlightAmenity(${amenity.lat}, ${amenity.lng}, ${JSON.stringify(name)}, ${JSON.stringify(emoji)});
            }
            if (window.drawAmenityRoute) {
              window.drawAmenityRoute(${selectedStation.lat}, ${selectedStation.lng}, ${amenity.lat}, ${amenity.lng}, ${JSON.stringify(routeCoords)});
            }
          `;
          webViewRef.current?.injectJavaScript(jsCode);
        }, 300);
      } else {
        console.warn('Amenity route response empty or invalid', wayResp);
      }
    } catch (error) {
      console.error('Failed to fetch amenity route:', error);
    } finally {
      setIsLoadingAmenityRoute(false);
    }
  };

  const clearAmenityRoute = () => {
    setAmenityRoute(null);
    setSelectedAmenity(null);
    
    const jsCode = `
      if (window.clearAmenityRoute) {
        window.clearAmenityRoute();
      }
    `;
    webViewRef.current?.injectJavaScript(jsCode);
  };

  const getAmenityIcon = (amenity: Amenity) => {
    const type = (amenity.type || amenity.amenity || amenity.name || '').toLowerCase();
    if (type.includes('food')) return { icon: Utensils, color: '#dc2626', emoji: '🍽️', label: 'Food' };
    if (type.includes('washroom') || type.includes('restroom') || type.includes('toilet')) return { icon: Home, color: '#059669', emoji: '🚻', label: 'Washroom' };
    if (type.includes('medical') || type.includes('hospital')) return { icon: Heart, color: '#e11d48', emoji: '🏥', label: 'Medical' };
    if (type.includes('hotel') || type.includes('lodge')) return { icon: Hotel, color: '#7c3aed', emoji: '🏨', label: 'Hotel' };
    if (type.includes('wifi') || type.includes('internet')) return { icon: Wifi, color: '#2563eb', emoji: '📶', label: 'WiFi' };
    if (type.includes('parking')) return { icon: ParkingCircle, color: '#4b5563', emoji: '🅿️', label: 'Parking' };
    if (type.includes('cafe') || type.includes('coffee')) return { icon: Coffee, color: '#92400e', emoji: '☕', label: 'Cafe' };
    if (type.includes('restaurant')) return { icon: Utensils, color: '#dc2626', emoji: '🍴', label: 'Restaurant' };
    if (type.includes('fuel') || type.includes('gas') || type.includes('petrol')) return { icon: Fuel, color: '#ea580c', emoji: '⛽', label: 'Fuel' };
    if (type.includes('atm') || type.includes('bank')) return { icon: DollarSign, color: '#16a34a', emoji: '💰', label: 'ATM' };
    return { icon: MapPin, color: '#64748b', emoji: '📍', label: 'Other' };
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getBatteryColor = (percent: number) => {
    if (percent >= 60) return '#10b981';
    if (percent >= 40) return '#f59e0b';
    if (percent >= 20) return '#f97316';
    return '#ef4444';
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const getFilteredAmenities = () => {
    if (!selectedStation?.amenities) return [];
    let filtered = selectedStation.amenities;
    if (maxDistance < 1000) {
      filtered = filtered.filter(a => (a.distance || 0) <= maxDistance);
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(a => {
        const type = (a.type || a.amenity || '').toLowerCase();
        return selectedCategories.some(cat => type.includes(cat));
      });
    }
    return filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  };

  if (loading || !routeData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Optimizing your route...</Text>
      </View>
    );
  }

  const filteredAmenities = getFilteredAmenities();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#1e293b" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.routeTitle} numberOfLines={1}>
            {sourceAddress || 'Start'} → {destAddress || 'Destination'}
          </Text>
          <Text style={styles.routeSubtitle}>
            {routeData.distanceKm.toFixed(0)}km • {formatTime(routeData.totalTimeMinutes)}
          </Text>
        </View>
        <TouchableOpacity style={styles.batteryBtn} onPress={() => setShowBatteryModal(true)}>
          <Battery size={20} color={getBatteryColor(routeData.batteryAnalysis.finalPercent)} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <WebView ref={webViewRef} source={{ html: mapHtml }} style={styles.map} javaScriptEnabled={true} />
      </View>

      {amenityRoute && (
        <View style={styles.amenityRouteBanner}>
          <View style={styles.amenityRouteInfo}>
            <Text style={styles.amenityRouteTitle}>
              {getAmenityIcon(selectedAmenity!).emoji} Navigating to {selectedAmenity?.name || 'Amenity'}
            </Text>
            <Text style={styles.amenityRouteStats}>
              {amenityRoute.totalDistanceKm.toFixed(1)}km • {Math.round(amenityRoute.totalTimeMin)}min from station
            </Text>
          </View>
          <TouchableOpacity style={styles.amenityRouteClose} onPress={clearAmenityRoute}>
            <X size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.floatingPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsContainer}>
          <View style={styles.miniStat}>
            <Battery size={16} color={getBatteryColor(routeData.batteryAnalysis.finalPercent)} />
            <Text style={[styles.miniStatValue, { color: getBatteryColor(routeData.batteryAnalysis.finalPercent) }]}>
              {routeData.batteryAnalysis.finalPercent.toFixed(0)}%
            </Text>
            <Text style={styles.miniStatLabel}>Final</Text>
          </View>

          {routeData.chargingStations.length > 0 && (
            <View style={styles.miniStat}>
              <Zap size={16} color="#f59e0b" />
              <Text style={styles.miniStatValue}>{routeData.chargingStations.length}</Text>
              <Text style={styles.miniStatLabel}>Stops</Text>
            </View>
          )}

          <View style={styles.miniStat}>
            <Clock size={16} color="#3b82f6" />
            <Text style={styles.miniStatValue}>{formatTime(routeData.totalTimeMinutes)}</Text>
            <Text style={styles.miniStatLabel}>Time</Text>
          </View>

          {routeData.totalTrafficDelayMin > 0 && (
            <View style={styles.miniStat}>
              <AlertTriangle size={16} color="#ef4444" />
              <Text style={styles.miniStatValue}>{Math.round(routeData.totalTrafficDelayMin)}'</Text>
              <Text style={styles.miniStatLabel}>Delay</Text>
            </View>
          )}
        </ScrollView>

        {routeData.batteryAnalysis.willMeetRequirement !== undefined && (
          <View style={[styles.statusBanner, routeData.batteryAnalysis.willMeetRequirement ? styles.statusSuccess : styles.statusWarning]}>
            {routeData.batteryAnalysis.willMeetRequirement ? <CheckCircle size={18} color="#10b981" /> : <XCircle size={18} color="#ef4444" />}
            <Text style={[styles.statusText, routeData.batteryAnalysis.willMeetRequirement ? styles.statusTextSuccess : styles.statusTextWarning]} numberOfLines={1}>
              {routeData.batteryAnalysis.willMeetRequirement ? `Will reach ${routeData.batteryAnalysis.userRequestedMinimumPercent}% at destination` : `Short ${routeData.batteryAnalysis.shortfallPercent?.toFixed(0)}% at destination`}
            </Text>
          </View>
        )}

        {routeData.chargingStations.length > 0 && (
          <View style={styles.stationsContainer}>
            <View style={styles.stationsHeader}>
              <Text style={styles.stationsTitle}>⚡ Charging Stops</Text>
              {routeData.chargingStations.length > 2 && (
                <TouchableOpacity onPress={() => setShowStationModal(true)}>
                  <Text style={styles.viewAllBtn}>See All ({routeData.chargingStations.length})</Text>
                </TouchableOpacity>
              )}
            </View>

            {routeData.chargingStations.slice(0, 2).map((station) => (
              <TouchableOpacity
                key={station.stationId}
                style={[styles.stationCard, station.isOptimal && styles.stationCardOptimal]}
                onPress={() => { setSelectedStation(station); setShowStationModal(true); }}
                activeOpacity={0.7}
              >
                <View style={[styles.stopBadge, station.isOptimal && styles.stopBadgeOptimal]}>
                  <Text style={styles.stopBadgeText}>{station.stopOrder}</Text>
                </View>
                <View style={styles.stationInfo}>
                  <Text style={styles.stationCardName} numberOfLines={1}>
                    {station.isOptimal && '⭐ '}{station.name}
                  </Text>
                  <View style={styles.stationMeta}>
                    <Text style={styles.metaText}>{station.estimatedChargingTimeMin}min • +{station.estimatedChargeAddedPercent}%</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>ETA {formatTime(station.etaAtStationMin || 0)}</Text>
                  </View>
                </View>
                <Zap size={20} color={station.isOptimal ? '#10b981' : '#3b82f6'} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Station Modal - keeping existing structure but updating amenity card */}
      <Modal visible={showStationModal} transparent animationType="slide" onRequestClose={() => setShowStationModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowStationModal(false)} />
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleContainer}>
                  {selectedStation?.isOptimal && <Text style={styles.starEmoji}>⭐</Text>}
                  <Text style={styles.modalTitle} numberOfLines={2}>{selectedStation?.name}</Text>
                </View>
                <View style={[styles.modalStopBadge, selectedStation?.isOptimal && styles.modalStopBadgeOptimal]}>
                  <Text style={styles.modalStopText}>Stop {selectedStation?.stopOrder}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Zap size={18} color="#3b82f6" />
                  <Text style={styles.sectionTitle}>Charging Details</Text>
                </View>
                <View style={styles.highlightCard}>
                  <View style={styles.highlightRow}>
                    <View style={styles.highlight}>
                      <Text style={styles.highlightLabel}>Charge Time</Text>
                      <Text style={styles.highlightValue}>{selectedStation?.estimatedChargingTimeMin}min</Text>
                    </View>
                    <View style={styles.highlightDivider} />
                    <View style={styles.highlight}>
                      <Text style={styles.highlightLabel}>Charge Added</Text>
                      <Text style={[styles.highlightValue, { color: '#10b981' }]}>+{selectedStation?.estimatedChargeAddedPercent}%</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.infoGrid}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Arrival Battery</Text>
                    <Text style={styles.infoValue}>{selectedStation?.batteryOnArrivalPercent}%</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Departure Battery</Text>
                    <Text style={[styles.infoValue, { color: '#10b981' }]}>{selectedStation?.batteryOnDeparturePercent}%</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MapPin size={18} color="#3b82f6" />
                  <Text style={styles.sectionTitle}>Location</Text>
                </View>
                <View style={styles.infoGrid}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Coordinates</Text>
                    <Text style={styles.infoValue}>{selectedStation?.lat.toFixed(4)}, {selectedStation?.lng.toFixed(4)}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Detour</Text>
                    <Text style={styles.infoValue}>{((selectedStation?.distanceFromRouteM || 0) / 1000).toFixed(1)}km</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Extra Time</Text>
                    <Text style={styles.infoValue}>{selectedStation?.detourExtraTimeMin}min</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>ETA at Station</Text>
                    <Text style={styles.infoValue}>{formatTime(selectedStation?.etaAtStationMin || 0)}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Availability</Text>
                    <Text style={[styles.infoValue, selectedStation?.realTimeAvailability === 'available' ? { color: '#10b981' } : {}]}>
                      {selectedStation?.realTimeAvailability === 'available' ? '✅ Available' : '⏳ Unknown'}
                    </Text>
                  </View>
                </View>
              </View>

              {selectedStation?.chargers && selectedStation.chargers.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Zap size={18} color="#3b82f6" />
                    <Text style={styles.sectionTitle}>Chargers</Text>
                  </View>
                  {selectedStation.chargers.map((charger, idx) => (
                    <View key={idx} style={styles.chargerItem}>
                      <View style={styles.chargerLeft}>
                        <View style={styles.chargerDot} />
                        <Text style={styles.chargerType}>{charger.type}</Text>
                      </View>
                      <View style={styles.chargerRight}>
                        <Text style={styles.chargerPower}>{charger.powerKw}kW</Text>
                        {charger.available !== undefined && <Text style={styles.chargerAvail}>({charger.available} free)</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {selectedStation?.amenities && selectedStation.amenities.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <ShoppingCart size={18} color="#3b82f6" />
                    <Text style={styles.sectionTitle}>Nearby Amenities ({filteredAmenities.length})</Text>
                    <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilterModal(true)}>
                      <Filter size={16} color="#3b82f6" />
                      {(selectedCategories.length > 0 || maxDistance < 1000) && (
                        <View style={styles.filterBadge}>
                          <Text style={styles.filterBadgeText}>{selectedCategories.length || '•'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                  
                  {filteredAmenities.length === 0 ? (
                    <Text style={styles.noAmenitiesText}>No amenities match your filters</Text>
                  ) : (
                    <View style={styles.amenitiesContainer}>
                      {filteredAmenities.map((amenity, idx) => {
                        const { icon: Icon, color, emoji, label } = getAmenityIcon(amenity);
                        const hasCoords = amenity.lat && amenity.lng;
                        
                        return (
                          <View key={idx} style={styles.amenityCard}>
                            <View style={styles.amenityHeader}>
                              <View style={[styles.amenityIcon, { backgroundColor: color + '15' }]}>
                                <Text style={{ fontSize: 16 }}>{emoji}</Text>
                              </View>
                              <View style={styles.amenityInfo}>
                                <Text style={styles.amenityName} numberOfLines={1}>
                                  {amenity.name || amenity.amenity || amenity.type}
                                </Text>
                                <View style={styles.amenityMeta}>
                                  <Text style={styles.amenityType}>{label}</Text>
                                  {amenity.distance !== undefined && (
                                    <>
                                      <Text style={styles.amenityMetaDot}>•</Text>
                                      <Text style={styles.amenityDistance}>{amenity.distance.toFixed(0)}m</Text>
                                    </>
                                  )}
                                </View>
                              </View>
                              {hasCoords && (
                                <TouchableOpacity
                                  style={styles.navigateBtn}
                                  onPress={() => navigateToAmenity(amenity)}
                                  disabled={isLoadingAmenityRoute}
                                >
                                  {isLoadingAmenityRoute && selectedAmenity === amenity ? (
                                    <ActivityIndicator size="small" color="#3b82f6" />
                                  ) : (
                                    <Navigation size={16} color="#3b82f6" />
                                  )}
                                </TouchableOpacity>
                              )}
                            </View>
                            {hasCoords && (
                              <View style={styles.amenityCoords}>
                                <MapPin size={10} color="#94a3b8" />
                                <Text style={styles.coordsText}>{amenity.lat?.toFixed(4)}, {amenity.lng?.toFixed(4)}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {selectedStation?.notes && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Info size={18} color="#3b82f6" />
                    <Text style={styles.sectionTitle}>Notes</Text>
                  </View>
                  <Text style={styles.notesText}>{selectedStation.notes}</Text>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Filter Modal & Battery Modal - keeping existing code */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFilterModal(false)} />
          <View style={styles.filterModal}>
            <View style={styles.modalHandle} />
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter Amenities</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.filterScroll}>
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Maximum Distance</Text>
                <View style={styles.distanceOptions}>
                  {[250, 500, 750, 1000].map(dist => (
                    <TouchableOpacity key={dist} style={[styles.distanceOption, maxDistance === dist && styles.distanceOptionActive]} onPress={() => setMaxDistance(dist)}>
                      <Text style={[styles.distanceOptionText, maxDistance === dist && styles.distanceOptionTextActive]}>{dist}m</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Categories</Text>
                <View style={styles.categoryGrid}>
                  {amenityCategories.map(category => {
                    const { emoji, label } = getAmenityIcon({ type: category, name: '', amenity: '' });
                    const isSelected = selectedCategories.includes(category);
                    return (
                      <TouchableOpacity key={category} style={[styles.categoryChip, isSelected && styles.categoryChipActive]} onPress={() => toggleCategory(category)}>
                        <Text style={styles.categoryEmoji}>{emoji}</Text>
                        <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterActions}>
                <TouchableOpacity style={styles.clearBtn} onPress={() => { setSelectedCategories([]); setMaxDistance(1000); }}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilterModal(false)}>
                  <Text style={styles.applyBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Battery Modal - keeping existing code */}
      <Modal visible={showBatteryModal} transparent animationType="slide" onRequestClose={() => setShowBatteryModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowBatteryModal(false)} />
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🔋 Battery Analysis</Text>
              </View>

              <View style={styles.section}>
                <View style={styles.batteryProgress}>
                  <View style={styles.batteryPoint}>
                    <View style={[styles.batteryDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.batteryPercent}>{routeData.batteryAnalysis.initialPercent}%</Text>
                    <Text style={styles.batteryLabel}>Start</Text>
                  </View>
                  <View style={styles.batteryLine} />
                  <View style={styles.batteryPoint}>
                    <View style={[styles.batteryDot, { backgroundColor: getBatteryColor(routeData.batteryAnalysis.finalPercent) }]} />
                    <Text style={[styles.batteryPercent, { color: getBatteryColor(routeData.batteryAnalysis.finalPercent) }]}>
                      {routeData.batteryAnalysis.finalPercent}%
                    </Text>
                    <Text style={styles.batteryLabel}>End</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.infoGrid}>
                  {routeData.batteryAnalysis.totalConsumedKwh !== undefined && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Consumed</Text>
                      <Text style={styles.infoValue}>{routeData.batteryAnalysis.totalConsumedKwh.toFixed(1)}kWh</Text>
                    </View>
                  )}
                  {routeData.batteryAnalysis.totalChargedKwh !== undefined && routeData.batteryAnalysis.totalChargedKwh > 0 && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Charged</Text>
                      <Text style={[styles.infoValue, { color: '#10b981' }]}>{routeData.batteryAnalysis.totalChargedKwh.toFixed(1)}kWh</Text>
                    </View>
                  )}
                  {routeData.batteryAnalysis.minPercent !== undefined && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Minimum</Text>
                      <Text style={styles.infoValue}>{routeData.batteryAnalysis.minPercent.toFixed(1)}%</Text>
                    </View>
                  )}
                </View>
              </View>

              {routeData.batteryAnalysis.userRequestedMinimumPercent !== undefined && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <CheckCircle size={18} color="#3b82f6" />
                    <Text style={styles.sectionTitle}>Destination Requirement</Text>
                  </View>
                  <View style={[styles.requirementCard, routeData.batteryAnalysis.willMeetRequirement ? styles.requirementCardSuccess : styles.requirementCardWarning]}>
                    {routeData.batteryAnalysis.willMeetRequirement ? <CheckCircle size={24} color="#10b981" /> : <XCircle size={24} color="#ef4444" />}
                    <View style={styles.requirementContent}>
                      <Text style={styles.requirementTitle}>{routeData.batteryAnalysis.willMeetRequirement ? 'Requirement Met' : 'Below Requirement'}</Text>
                      <Text style={styles.requirementText}>Required: {routeData.batteryAnalysis.userRequestedMinimumPercent}% • Expected: {routeData.batteryAnalysis.finalPercent}%</Text>
                    </View>
                  </View>
                </View>
              )}

              {routeData.batteryAnalysis.criticalPoints && routeData.batteryAnalysis.criticalPoints.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <AlertTriangle size={18} color="#ef4444" />
                    <Text style={styles.sectionTitle}>Critical Battery Points</Text>
                  </View>
                  {(() => {
                    const filtered = [];
                    const points = routeData.batteryAnalysis.criticalPoints;
                    if (points.length > 0) {
                      filtered.push(points[0]);
                      for (let i = 1; i < points.length; i++) {
                        const lastAdded = filtered[filtered.length - 1];
                        const current = points[i];
                        const distance = Math.abs((current.distanceFromStart || 0) - (lastAdded.distanceFromStart || 0));
                        if (distance >= 3) filtered.push(current);
                      }
                    }
                    return filtered.map((point, idx) => (
                      <View key={idx} style={styles.criticalCard}>
                        <View style={styles.criticalHeader}>
                          <Text style={styles.criticalTitle}>⚠️ Point {idx + 1}</Text>
                          <Text style={styles.criticalBattery}>{point.batteryPercent.toFixed(1)}%</Text>
                        </View>
                        {point.distanceFromStart !== undefined && (
                          <Text style={styles.criticalDistance}>📏 {point.distanceFromStart.toFixed(1)}km from start</Text>
                        )}
                      </View>
                    ));
                  })()}
                </View>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 16, fontSize: 15, color: '#64748b', fontWeight: '500' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { marginRight: 12, padding: 4 },
  headerContent: { flex: 1 },
  routeTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', letterSpacing: -0.3 },
  routeSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '500' },
  batteryBtn: { marginLeft: 12, padding: 4 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  floatingPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 20, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10, maxHeight: '50%' },
  statsContainer: { flexDirection: 'row', paddingBottom: 12 },
  miniStat: { alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, minWidth: 70 },
  miniStatValue: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginTop: 6, letterSpacing: -0.5 },
  miniStatLabel: { fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '600' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, marginBottom: 14 },
  statusSuccess: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  statusWarning: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  statusText: { flex: 1, fontSize: 12, fontWeight: '600', letterSpacing: -0.2 },
  statusTextSuccess: { color: '#166534' },
  statusTextWarning: { color: '#991b1b' },
  stationsContainer: { /* no gap property */ },
  stationsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  stationsTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', letterSpacing: -0.3 },
  viewAllBtn: { fontSize: 12, color: '#3b82f6', fontWeight: '600' },
  stationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: '#e2e8f0' },
  stationCardOptimal: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  stopBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stopBadgeOptimal: { backgroundColor: '#10b981' },
  stopBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stationInfo: { flex: 1 },
  stationCardName: { fontSize: 14, fontWeight: '700', color: '#1e293b', letterSpacing: -0.2 },
  stationMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 },
  metaText: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  metaDot: { fontSize: 11, color: '#cbd5e1' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%', paddingTop: 8 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#cbd5e1', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  modalScroll: { paddingHorizontal: 20 },
  modalHeader: { marginBottom: 20 },
  modalTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  starEmoji: { fontSize: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', letterSpacing: -0.5, flex: 1 },
  modalStopBadge: { alignSelf: 'flex-start', backgroundColor: '#dbeafe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  modalStopBadgeOptimal: { backgroundColor: '#d1fae5' },
  modalStopText: { fontSize: 12, fontWeight: '700', color: '#1e40af' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', letterSpacing: -0.3, flex: 1 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', padding: 4, position: 'relative' },
  filterBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#ef4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  highlightCard: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, marginBottom: 12 },
  highlightRow: { flexDirection: 'row' },
  highlight: { flex: 1, alignItems: 'center' },
  highlightLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 6 },
  highlightValue: { fontSize: 24, fontWeight: '800', color: '#1e293b', letterSpacing: -0.8 },
  highlightDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
  infoGrid: { /* spacing via children */ },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f8fafc', borderRadius: 10 },
  infoLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#1e293b', letterSpacing: -0.2 },
  chargerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 8 },
  chargerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  chargerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' },
  chargerType: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  chargerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chargerPower: { fontSize: 15, fontWeight: '800', color: '#3b82f6' },
  chargerAvail: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  amenitiesContainer: { /* no gap */ },
  amenityCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 8, // add top and bottom spacing between amenity cards
  },
  amenityHeader: { flexDirection: 'row', alignItems: 'center' /* spacing via marginRight */ },
  amenityIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  amenityInfo: { flex: 1 },
  amenityName: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 3 },
  amenityMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amenityType: { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  amenityMetaDot: { fontSize: 10, color: '#cbd5e1' },
  amenityDistance: { fontSize: 10, color: '#64748b', fontWeight: '500' },
  amenityCoords: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  coordsText: { fontSize: 10, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '500' },
  noAmenitiesText: { textAlign: 'center', color: '#94a3b8', fontSize: 13, fontStyle: 'italic', paddingVertical: 20 },
  notesText: { fontSize: 13, color: '#64748b', lineHeight: 20, backgroundColor: '#f8fafc', padding: 14, borderRadius: 12 },
  batteryProgress: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 20, borderRadius: 16, marginBottom: 12 },
  batteryPoint: { alignItems: 'center', flex: 1 },
  batteryDot: { width: 16, height: 16, borderRadius: 8, marginBottom: 8 },
  batteryPercent: { fontSize: 20, fontWeight: '800', color: '#1e293b', letterSpacing: -0.5 },
  batteryLabel: { fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: '600' },
  batteryLine: { height: 2, flex: 1, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
  requirementCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 14 },
  requirementCardSuccess: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  requirementCardWarning: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  requirementContent: { flex: 1 },
  requirementTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  requirementText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  criticalCard: { backgroundColor: '#fef2f2', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#fecaca' },
  criticalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  criticalTitle: { fontSize: 13, fontWeight: '700', color: '#991b1b' },
  criticalBattery: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  criticalDistance: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  filterModal: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '70%', paddingTop: 8 },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  filterTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  filterScroll: { paddingHorizontal: 20, paddingTop: 16 },
  filterSection: { marginBottom: 24, marginVertical: 8 }, // added vertical spacing
  filterSectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  distanceOptions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  distanceOption: { flex: 1, paddingVertical: 10, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', marginRight: 8, marginBottom: 8 }, // spacing between buttons
  distanceOptionActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  distanceOptionText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  distanceOptionTextActive: { color: '#1e40af' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 /* spacing via chip margins */ },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f8fafc', borderRadius: 20, borderWidth: 2, borderColor: '#e2e8f0', marginRight: 8, marginBottom: 8 }, // add spacing between chips
  categoryChipActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  categoryEmoji: { fontSize: 16 },
  categoryLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  categoryLabelActive: { color: '#1e40af' },
  amenityRouteBanner: { position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6, borderWidth: 2, borderColor: '#7c3aed' },
  amenityRouteInfo: { flex: 1 },
  amenityRouteTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  amenityRouteStats: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  amenityRouteClose: { padding: 4, marginLeft: 8 },
  filterActions: { flexDirection: 'row', paddingVertical: 20 /* gap removed */ },

  // Re-added styles for the Clear / Apply buttons in the filter modal
  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});