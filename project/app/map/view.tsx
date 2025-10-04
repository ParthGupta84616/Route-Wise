import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { RoutePlanResponse } from '@/types';
import { ArrowLeft, Navigation, Clock, Battery, MapPin, Zap, AlertTriangle, Info } from 'lucide-react-native';

export default function MapViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeData: string; source: string; destination: string }>();

  const [routeData, setRouteData] = useState<RoutePlanResponse | null>(null);
  const [mapHtml, setMapHtml] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [showStationModal, setShowStationModal] = useState(false);

  useEffect(() => {
    if (params.routeData) {
      try {
        const data = JSON.parse(params.routeData);
        setRouteData(data);
        generateEnhancedMapHtml(data);
      } catch (error) {
        console.error('Failed to parse route data:', error);
      }
    }
  }, [params.routeData]);

  const generateEnhancedMapHtml = (data: RoutePlanResponse) => {
    const coordinates = data.routeCoordinates || [];
    if (coordinates.length === 0) return;

    const centerLat = coordinates[Math.floor(coordinates.length / 2)].lat;
    const centerLng = coordinates[Math.floor(coordinates.length / 2)].lng;

    // Create colored segments based on traffic AND battery level
    const trafficSegments = coordinates.map((coord, index) => {
      const nextCoord = coordinates[index + 1];
      if (!nextCoord) return '';
      
      const color = coord.trafficColor || '#00FF00';
      const batteryPercent = coord.batteryLevelPercent || 100;
      
      // Highlight critical battery segments
      const isCritical = batteryPercent < 20;
      const weight = isCritical ? 8 : 6;
      const dashArray = isCritical ? '10, 5' : 'none';
      
      return `
        L.polyline([[${coord.lat}, ${coord.lng}], [${nextCoord.lat}, ${nextCoord.lng}]], {
          color: '${color}',
          weight: ${weight},
          opacity: 0.8,
          dashArray: '${dashArray}'
        }).addTo(map).bindPopup(\`
          <div style="font-family: sans-serif; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; color: #2563eb;">Route Segment ${index + 1}</h4>
            <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
              <strong>🚦 Traffic:</strong> ${coord.trafficLevel} (${coord.predictedSpeedKmh} km/h)
            </div>
            <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
              <strong>🌤️ Weather:</strong> ${coord.weatherCondition}
            </div>
            <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
              <strong>📏 Distance:</strong> ${(coord.segmentDistanceM / 1000).toFixed(1)} km
            </div>
            <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
              <strong>🔋 Battery:</strong> ${batteryPercent.toFixed(1)}%
            </div>
            <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
              <strong>⚡ Consumption:</strong> ${coord.expectedConsumptionKwh.toFixed(2)} kWh
            </div>
            <div style="padding: 4px 0;">
              <strong>🕐 ETA:</strong> ${new Date(coord.segmentEtaIso).toLocaleTimeString()}
            </div>
          </div>
        \`);
      `;
    }).join('\n');
    
    // Enhanced charging stations with animations
    const chargingStations = data.chargingStations.map((station, idx) => 
      `
      // Charging Station ${idx + 1} - ${station.name}
      var station${idx}Marker = L.marker([${station.lat}, ${station.lng}], {
        icon: L.divIcon({
          className: 'charging-icon-enhanced',
          html: \`
            <div style="
              background: linear-gradient(135deg, ${station.isOptimal ? '#10b981' : '#3b82f6'} 0%, ${station.isOptimal ? '#059669' : '#2563eb'} 100%);
              color: white;
              border-radius: 50%;
              width: ${station.markerData.size === 'large' ? '45px' : '35px'};
              height: ${station.markerData.size === 'large' ? '45px' : '35px'};
              display: flex;
              align-items: center;
              justify-content: center;
              border: 3px solid white;
              box-shadow: 0 4px 8px rgba(0,0,0,0.3);
              font-size: 20px;
              animation: pulse 2s infinite;
              position: relative;
            ">
              ⚡
              <div style="
                position: absolute;
                top: -8px;
                right: -8px;
                background: ${station.isOptimal ? '#fbbf24' : '#3b82f6'};
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                border: 2px solid white;
              ">${station.stopOrder}</div>
            </div>
          \`,
          iconSize: [${station.markerData.size === 'large' ? '45' : '35'}, ${station.markerData.size === 'large' ? '45' : '35'}]
        })
      }).addTo(map);
      
      station${idx}Marker.bindPopup(\`
        <div style="font-family: sans-serif; min-width: 280px; max-width: 320px;">
          <div style="background: linear-gradient(135deg, ${station.isOptimal ? '#10b981' : '#3b82f6'}, ${station.isOptimal ? '#059669' : '#2563eb'}); color: white; padding: 12px; margin: -8px -8px 12px -8px; border-radius: 8px 8px 0 0;">
            <h3 style="margin: 0; font-size: 16px;">
              ${station.isOptimal ? '⭐ ' : ''}${station.name}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Stop ${station.stopOrder} • ${station.isOptimal ? 'Optimal Choice' : 'Alternative'}</p>
          </div>
          
          <div style="padding: 8px 0;">
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">🔌 Charging Time:</span>
              <strong style="color: #1e293b;">${station.estimatedChargingTimeMin} min</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">⚡ Charge Added:</span>
              <strong style="color: #10b981;">+${station.estimatedChargeAddedPercent}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">🔋 Battery on Arrival:</span>
              <strong style="color: ${station.batteryOnArrivalPercent < 20 ? '#ef4444' : '#3b82f6'};">${station.batteryOnArrivalPercent}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">🔋 Battery on Departure:</span>
              <strong style="color: #10b981;">${station.batteryOnDeparturePercent}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">📍 Detour:</span>
              <strong style="color: #1e293b;">${(station.distanceFromRouteM / 1000).toFixed(1)} km (${station.detourExtraTimeMin} min)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="color: #64748b;">🕐 ETA at Station:</span>
              <strong style="color: #1e293b;">${Math.floor(station.etaAtStationMin / 60)}h ${station.etaAtStationMin % 60}m</strong>
            </div>
          </div>
          
          <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0;">
            <div style="font-weight: 600; margin-bottom: 8px; color: #1e293b;">Chargers Available:</div>
            ${station.chargers.map(c => `
              <div style="background: #f1f5f9; padding: 8px; border-radius: 6px; margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #475569;">${c.type}</span>
                  <strong style="color: #2563eb;">${c.powerKw} kW</strong>
                </div>
                <div style="color: #64748b; font-size: 12px; margin-top: 4px;">
                  ${c.available} charger${c.available > 1 ? 's' : ''} available
                </div>
              </div>
            `).join('')}
          </div>
          
          ${station.amenities.length > 0 ? `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0;">
            <div style="font-weight: 600; margin-bottom: 8px; color: #1e293b;">Amenities:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${station.amenities.map(a => `
                <span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                  ${a.name}
                </span>
              `).join('')}
            </div>
          </div>
          ` : ''}
          
          <div style="margin-top: 12px; padding: 8px; background: ${station.realTimeAvailability === 'available' ? '#dcfce7' : '#fef3c7'}; border-radius: 6px; font-size: 12px;">
            <strong>Status:</strong> ${station.realTimeAvailability === 'available' ? '✅ Available Now' : '⏳ Availability Unknown'}
          </div>
        </div>
      \`, { maxWidth: 350 });
      
      // Add distance circle around station
      L.circle([${station.lat}, ${station.lng}], {
        color: '${station.isOptimal ? '#10b981' : '#3b82f6'}',
        fillColor: '${station.isOptimal ? '#10b981' : '#3b82f6'}',
        fillOpacity: 0.1,
        radius: ${station.distanceFromRouteM}
      }).addTo(map);
      `
    ).join('\n');

    // Dynamic charging recommendations (warnings)
    const recommendations = (data.dynamicChargingRecommendations || []).map((rec, idx) => `
      L.marker([${rec.lat}, ${rec.lng}], {
        icon: L.divIcon({
          className: 'warning-icon',
          html: '<div style="background-color: ${rec.type === 'critical' ? '#ef4444' : '#f59e0b'}; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); animation: pulse 1.5s infinite;">⚠️</div>',
          iconSize: [30, 30]
        })
      })
        .addTo(map)
        .bindPopup(\`
          <div style="font-family: sans-serif;">
            <h4 style="margin: 0 0 8px 0; color: ${rec.type === 'critical' ? '#ef4444' : '#f59e0b'};">
              ${rec.type === 'critical' ? '🚨 Critical Battery Warning' : '⚠️ Low Battery Warning'}
            </h4>
            <p style="margin: 4px 0;"><strong>Battery:</strong> ${rec.batteryAtPoint.toFixed(1)}%</p>
            <p style="margin: 4px 0;">${rec.message}</p>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #e2e8f0;"/>
            <p style="margin: 4px 0; font-weight: 600; color: #2563eb;">Nearest Station:</p>
            <p style="margin: 4px 0;"><strong>${rec.nearestStation.name}</strong></p>
            <p style="margin: 4px 0;">📍 ${rec.nearestStation.distance.toFixed(1)} km away</p>
            <p style="margin: 4px 0;">⏱️ ${rec.nearestStation.detourMinutes} min detour</p>
          </div>
        \`);
    `).join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          
          .traffic-legend {
            position: absolute;
            bottom: 120px;
            left: 6px;
            background: white;
            padding: 6px 8px;
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            z-index: 1000;
            font-size: 9px;
            font-family: sans-serif;
          }
          
          .legend-item {
            display: flex;
            align-items: center;
            margin: 2px 0;
          }
          
          .legend-color {
            width: 18px;
            height: 3px;
            margin-right: 6px;
            border-radius: 2px;
          }
          
          .battery-legend {
            position: absolute;
            bottom: 6px;
            left: 6px;
            background: white;
            padding: 6px 8px;
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            z-index: 1000;
            font-size: 9px;
            font-family: sans-serif;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        
        <!-- Compact Traffic Legend -->
        <div class="traffic-legend">
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 10px;">🚦 Traffic</div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #00FF00;"></div>
            <span>Free</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #FFFF00;"></div>
            <span>Moderate</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background-color: #FF0000;"></div>
            <span>Heavy</span>
          </div>
        </div>
        
        <!-- Compact Battery Legend -->
        <div class="battery-legend">
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 10px;">🔋 Battery</div>
          <div class="legend-item">
            <div style="width: 10px; height: 10px; background: #10b981; border-radius: 50%; margin-right: 6px;"></div>
            <span>Good</span>
          </div>
          <div class="legend-item">
            <div style="width: 10px; height: 10px; background: #f59e0b; border-radius: 50%; margin-right: 6px;"></div>
            <span>Low</span>
          </div>
          <div class="legend-item">
            <div style="width: 10px; height: 10px; background: #ef4444; border-radius: 50%; margin-right: 6px;"></div>
            <span>Critical</span>
          </div>
        </div>

        <script>
          // Initialize map
          var map = L.map('map').setView([${centerLat}, ${centerLng}], 10);
          
          // Add OpenStreetMap tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18,
          }).addTo(map);

          // Add traffic-colored segments
          ${trafficSegments}

          // Add start marker
          L.marker([${coordinates[0].lat}, ${coordinates[0].lng}], {
            icon: L.divIcon({
              className: 'start-icon',
              html: '<div style="background: linear-gradient(135deg, #10b981, #059669); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.3); font-weight: bold; font-size: 18px;">🏁</div>',
              iconSize: [40, 40]
            })
          }).addTo(map).bindPopup('<div style="font-family: sans-serif;"><h3 style="color: #10b981; margin: 0 0 4px 0;">Start Location</h3><p style="margin: 0;">${params.source}</p></div>');

          // Add end marker
          L.marker([${coordinates[coordinates.length - 1].lat}, ${coordinates[coordinates.length - 1].lng}], {
            icon: L.divIcon({
              className: 'end-icon',
              html: '<div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.3); font-weight: bold; font-size: 18px;">🎯</div>',
              iconSize: [40, 40]
            })
          }).addTo(map).bindPopup('<div style="font-family: sans-serif;"><h3 style="color: #ef4444; margin: 0 0 4px 0;">Destination</h3><p style="margin: 0;">${params.destination}</p></div>');

          // Add enhanced charging stations
          ${chargingStations}
          
          // Add dynamic recommendations
          ${recommendations}

          // Fit map to show entire route
          var bounds = L.latLngBounds([${coordinates.map(c => `[${c.lat}, ${c.lng}]`).join(', ')}]);
          map.fitBounds(bounds.pad(0.1));

          // Compact route statistics overlay
          var statsControl = L.control({position: 'topright'});
          statsControl.onAdd = function (map) {
            var div = L.DomUtil.create('div', 'info');
            div.style.background = 'white';
            div.style.padding = '6px 8px';
            div.style.borderRadius = '6px';
            div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            div.style.fontFamily = 'sans-serif';
            div.style.fontSize = '9px';
            
            var statsHtml = '<div style="font-weight: bold; margin-bottom: 4px; font-size: 10px;">📊 Route</div>';
            statsHtml += '<div style="padding: 2px 0;">📏 ${(data.distanceKm).toFixed(1)} km</div>';
            statsHtml += '<div style="padding: 2px 0;">🕐 ${Math.floor(data.totalTimeMinutes / 60)}h ${data.totalTimeMinutes % 60}m</div>';
            statsHtml += '<div style="padding: 2px 0;">🔋 ${data.estimatedBatteryUsagePercent.toFixed(0)}%</div>';
            ${data.chargingStations.length > 0 ? `statsHtml += '<div style="padding: 2px 0;">⚡ ${data.chargingStations.length} stops</div>';` : ''}
            
            div.innerHTML = statsHtml;
            return div;
          };
          statsControl.addTo(map);
        </script>
      </body>
      </html>
    `;

    setMapHtml(html);
  };

  if (!routeData || !mapHtml) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading enhanced route map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Compact Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#1e293b" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>To: {params.destination}</Text>
          <Text style={styles.headerSubtitle}>
            {routeData.distanceKm.toFixed(1)} km • {Math.floor(routeData.totalTimeMinutes / 60)}h {Math.round(routeData.totalTimeMinutes % 60)}m
          </Text>
        </View>
      </View>

      {/* Map */}
      <WebView
        style={styles.map}
        source={{ html: mapHtml }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
      />

      {/* Compact Bottom Summary Card */}
      <View style={styles.summaryCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
          <View style={styles.statCard}>
            <Navigation size={16} color="#2563eb" />
            <Text style={styles.statValue}>{routeData.distanceKm.toFixed(1)}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          
          <View style={styles.statCard}>
            <Clock size={16} color="#2563eb" />
            <Text style={styles.statValue}>{Math.floor(routeData.totalTimeMinutes / 60)}h {Math.round(routeData.totalTimeMinutes % 60)}m</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          
          <View style={[styles.statCard, routeData.estimatedBatteryUsagePercent > 80 && styles.statCardWarning]}>
            <Battery size={16} color={routeData.estimatedBatteryUsagePercent > 80 ? '#ef4444' : '#2563eb'} />
            <Text style={[styles.statValue, routeData.estimatedBatteryUsagePercent > 80 && styles.statValueWarning]}>
              {routeData.estimatedBatteryUsagePercent.toFixed(0)}%
            </Text>
            <Text style={styles.statLabel}>Battery</Text>
          </View>
          
          {routeData.chargingStations.length > 0 && (
            <View style={[styles.statCard, styles.statCardSuccess]}>
              <Zap size={16} color="#10b981" />
              <Text style={[styles.statValue, styles.statValueSuccess]}>{routeData.chargingStations.length}</Text>
              <Text style={styles.statLabel}>Stops</Text>
            </View>
          )}
        </ScrollView>
        
        {/* Compact Charging Info */}
        {routeData.chargingStations.length > 0 && (
          <View style={styles.chargingInfo}>
            <Text style={styles.chargingTitle}>⚡ Charging Stops</Text>
            {routeData.chargingStations.map((station, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.stationSummary, station.isOptimal && styles.stationSummaryOptimal]}
                onPress={() => {
                  setSelectedStation(station);
                  setShowStationModal(true);
                }}
              >
                <View style={styles.stationOrder}>
                  <Text style={styles.stationOrderText}>{station.stopOrder}</Text>
                </View>
                <View style={styles.stationDetails}>
                  <Text style={styles.stationName} numberOfLines={1}>
                    {station.isOptimal && '⭐ '}{station.name}
                  </Text>
                  <Text style={styles.stationTime}>
                    {station.estimatedChargingTimeMin}min • +{station.estimatedChargeAddedPercent}%
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Compact Station Modal */}
      {selectedStation && (
        <Modal
          visible={showStationModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowStationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedStation.isOptimal && '⭐ '}{selectedStation.name}
                </Text>
                <TouchableOpacity onPress={() => setShowStationModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalBody}>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>⚡ Charging</Text>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Time:</Text>
                    <Text style={styles.modalValue}>{selectedStation.estimatedChargingTimeMin}min</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Added:</Text>
                    <Text style={[styles.modalValue, styles.modalValueSuccess]}>
                      +{selectedStation.estimatedChargeAddedPercent}%
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Arrival:</Text>
                    <Text style={[styles.modalValue, selectedStation.batteryOnArrivalPercent < 20 && styles.modalValueWarning]}>
                      {selectedStation.batteryOnArrivalPercent}%
                    </Text>
                  </View>
                </View>
                
                {selectedStation.chargers && selectedStation.chargers.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>🔌 Chargers</Text>
                    {selectedStation.chargers.map((charger: any, idx: number) => (
                      <View key={idx} style={styles.chargerCard}>
                        <Text style={styles.chargerType}>{charger.type}</Text>
                        <Text style={styles.chargerPower}>{charger.powerKw}kW</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {selectedStation.amenities && selectedStation.amenities.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>🏪 Amenities</Text>
                    <View style={styles.amenitiesGrid}>
                      {selectedStation.amenities.map((amenity: any, idx: number) => (
                        <View key={idx} style={styles.amenityChip}>
                          <Text style={styles.amenityText}>{amenity.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  map: {
    flex: 1,
  },
  summaryCard: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    maxHeight: '35%',
  },
  statsScroll: {
    marginBottom: 8,
  },
  statCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
    marginRight: 8,
    minWidth: 65,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statCardWarning: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statCardSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
  },
  statValueWarning: {
    color: '#ef4444',
  },
  statValueSuccess: {
    color: '#10b981',
  },
  statLabel: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
  },
  chargingInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  chargingTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  stationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stationSummaryOptimal: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  stationOrder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  stationOrderText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stationDetails: {
    flex: 1,
  },
  stationName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  stationTime: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
    marginRight: 10,
  },
  modalClose: {
    fontSize: 20,
    color: '#64748b',
  },
  modalBody: {
    padding: 14,
  },
  modalSection: {
    marginBottom: 14,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  modalValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  modalValueSuccess: {
    color: '#10b981',
  },
  modalValueWarning: {
    color: '#ef4444',
  },
  chargerCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chargerType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  chargerPower: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  amenityChip: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  amenityText: {
    fontSize: 10,
    color: '#166534',
    fontWeight: '500',
  },
});