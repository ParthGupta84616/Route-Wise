import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { VehicleCard } from '@/components/VehicleCard';
import { storage } from '@/utils/storage';
import { Plus, RefreshCw, Car, Zap, Battery } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function VehiclesScreen() {
  const router = useRouter();
  const { vehicles, isLoading, deleteVehicle, isDeleting, syncFromBackend } = useVehicles(true);
  const { isAuthenticated } = useAuth();
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadActiveVehicle();
  }, []);

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const loadActiveVehicle = async () => {
    const vehicleId = await storage.getActiveVehicle();
    setActiveVehicleId(vehicleId);
  };

  const handleSelectVehicle = async (vehicleId: string) => {
    await storage.saveActiveVehicle(vehicleId);
    setActiveVehicleId(vehicleId);
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    Alert.alert(
      'Delete Vehicle',
      'Are you sure you want to delete this vehicle? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicle(vehicleId);
              if (activeVehicleId === vehicleId) {
                await storage.removeActiveVehicle();
                setActiveVehicleId(null);
              }
            } catch (error) {
              console.error('Failed to delete vehicle:', error);
              Alert.alert('Error', 'Failed to delete vehicle. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEditVehicle = (vehicleId: string) => {
    // Using dynamic route with [id] parameter
    console.log(`/vehicle/edit/${vehicleId}`)
    router.push(`/vehicle/edit/${vehicleId}`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActiveVehicle();
    setRefreshing(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncFromBackend();
      Alert.alert('Success', 'Vehicles synced successfully!');
    } catch (error) {
      console.error('Sync failed:', error);
      Alert.alert('Sync Failed', 'Could not sync vehicles from server.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading your vehicles...</Text>
        </View>
      </View>
    );
  }

  const totalBatteryCapacity = vehicles.reduce((sum, v) => sum + (v.batteryCapacity || 0), 0);
  const avgConsumption = vehicles.length > 0 
    ? vehicles.reduce((sum, v) => sum + (v.consumption_kWh_per_km || 0), 0) / vehicles.length 
    : 0;

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
            <View>
              <Text style={styles.title}>My Garage</Text>
              <Text style={styles.subtitle}>
                {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} • {totalBatteryCapacity.toFixed(0)}kWh total
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.syncButton, isSyncing && styles.syncButtonLoading]}
                onPress={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <RefreshCw size={20} color="#3b82f6" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/vehicle/add')}
              >
                <Plus size={22} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats Row */}
          {vehicles.length > 0 && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Car size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.statText}>{vehicles.length} total</Text>
              </View>
              <View style={styles.statItem}>
                <Battery size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.statText}>{totalBatteryCapacity.toFixed(0)}kWh</Text>
              </View>
              <View style={styles.statItem}>
                <Zap size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.statText}>{avgConsumption.toFixed(2)}kWh/km avg</Text>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#3b82f6']}
            tintColor="#3b82f6"
          />
        }
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
            <Text style={styles.emptyTitle}>No Vehicles Yet</Text>
            <Text style={styles.emptyText}>
              Add your first electric vehicle to start planning optimized routes with charging stops
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
          <View style={styles.vehiclesGrid}>
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle._id || vehicle.id}
                vehicle={vehicle}
                isActive={(vehicle._id || vehicle.id) === activeVehicleId}
                onSelect={() => handleSelectVehicle(vehicle._id || vehicle.id)}
                onEdit={() => handleEditVehicle(vehicle._id || vehicle.id)}
                onDelete={() => handleDeleteVehicle(vehicle._id || vehicle.id)}
                isDeleting={isDeleting}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Add Button for non-empty state */}
      {vehicles.length > 0 && (
        <TouchableOpacity
          style={styles.floatingAddButton}
          onPress={() => router.push('/vehicle/add')}
        >
          <LinearGradient
            colors={['#3b82f6', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.floatingAddGradient}
          >
            <Plus size={28} color="#fff" strokeWidth={2.5} />
          </LinearGradient>
        </TouchableOpacity>
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
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
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
    gap: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 32,
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
  headerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  syncButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  syncButtonLoading: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  vehiclesGrid: {
    gap: 16,
    marginTop: 4,
  },
  floatingAddButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingAddGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
