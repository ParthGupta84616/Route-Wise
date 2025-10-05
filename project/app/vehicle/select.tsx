import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { storage } from '@/utils/storage';
import { Plus, Check, RefreshCw, Car, Battery, Gauge, ArrowRight, Zap } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SelectVehicleScreen() {
  const router = useRouter();
  const { vehicles, isLoading, syncFromBackend } = useVehicles(true);
  const { isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  useFocusEffect(
    useCallback(() => {
      setSelectedId(null);
      return () => {};
    }, [])
  );

  const handleSelectVehicle = async () => {
    if (!selectedId) return;
    
    await storage.saveActiveVehicle(selectedId);
    router.replace('/(tabs)/routes');
  };

  const handleSyncFromBackend = async () => {
    setIsSyncing(true);
    try {
      await syncFromBackend();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

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
            <View style={styles.headerIconBadge}>
              <Car size={28} color="#fff" strokeWidth={2} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Select Your Vehicle</Text>
              <Text style={styles.subtitle}>Choose a vehicle to start planning routes</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncFromBackend}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <RefreshCw size={18} color="#3b82f6" strokeWidth={2.5} />
          )}
          <Text style={styles.syncButtonText}>
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/vehicle/add')}
        >
          <Plus size={18} color="#fff" strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <LinearGradient
                colors={['#dbeafe', '#eff6ff']}
                style={styles.emptyIconGradient}
              >
                <Car size={64} color="#3b82f6" strokeWidth={1.5} />
              </LinearGradient>
            </View>
            <Text style={styles.emptyTitle}>No Vehicles Found</Text>
            <Text style={styles.emptyText}>
              Add your first electric vehicle to start planning optimized routes
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/vehicle/add')}
            >
              <Plus size={20} color="#fff" strokeWidth={2.5} />
              <Text style={styles.emptyButtonText}>Add Your First Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Available Vehicles ({vehicles.length})</Text>
            
            {vehicles.map((vehicle) => (
              <TouchableOpacity
                key={vehicle._id || vehicle.id}
                style={[
                  styles.vehicleCard,
                  selectedId === (vehicle._id || vehicle.id) && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedId(vehicle._id || vehicle.id)}
                activeOpacity={0.7}
              >
                <View style={styles.vehicleCardContent}>
                  <View style={[
                    styles.vehicleIcon,
                    selectedId === (vehicle._id || vehicle.id) && styles.vehicleIconSelected
                  ]}>
                    <Car size={24} color={selectedId === (vehicle._id || vehicle.id) ? '#fff' : '#3b82f6'} strokeWidth={2} />
                  </View>
                  
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleName}>{vehicle.name}</Text>
                    <Text style={styles.vehicleModel}>{vehicle.model}</Text>
                    
                    <View style={styles.vehicleSpecs}>
                      <View style={styles.specBadge}>
                        <Battery size={14} color="#10b981" strokeWidth={2} />
                        <Text style={styles.specText}>{vehicle.batteryCapacity}kWh</Text>
                      </View>
                      <View style={styles.specBadge}>
                        <Gauge size={14} color="#f59e0b" strokeWidth={2} />
                        <Text style={styles.specText}>{vehicle.consumption_kWh_per_km}kWh/km</Text>
                      </View>
                    </View>
                  </View>

                  {selectedId === (vehicle._id || vehicle.id) && (
                    <View style={styles.checkmark}>
                      <Check size={20} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.confirmButton, !selectedId && styles.confirmButtonDisabled]}
              onPress={handleSelectVehicle}
              disabled={!selectedId}
            >
              <Text style={styles.confirmButtonText}>Continue to Route Planning</Text>
              <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  vehicleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  vehicleCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  vehicleCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleIconSelected: {
    backgroundColor: '#3b82f6',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  vehicleModel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
    fontWeight: '500',
  },
  vehicleSpecs: {
    flexDirection: 'row',
    gap: 12,
  },
  specBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  specText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    marginBottom: 24,
  },
  emptyIconGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
