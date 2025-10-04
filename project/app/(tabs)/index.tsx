import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { VehicleCard } from '@/components/VehicleCard';
import { storage } from '@/utils/storage';
import { Plus, RefreshCw } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';

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

  // Check auth when screen loads
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
    try {
      await deleteVehicle(vehicleId);
      if (activeVehicleId === vehicleId) {
        await storage.removeActiveVehicle();
        setActiveVehicleId(null);
      }
    } catch (error) {
      console.error('Failed to delete vehicle:', error);
    }
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
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Vehicles</Text>
          <Text style={styles.subtitle}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw size={20} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/vehicle/add')}
          >
            <Plus size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptyText}>Add your first vehicle to start planning routes</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/vehicle/add')}
            >
              <Text style={styles.emptyButtonText}>Add Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle._id || vehicle.id}
              vehicle={vehicle}
              isActive={(vehicle._id || vehicle.id) === activeVehicleId}
              onSelect={() => handleSelectVehicle(vehicle._id || vehicle.id)}
              onEdit={() => router.push(`/vehicle/edit/${vehicle._id || vehicle.id}`)}
              onDelete={() => handleDeleteVehicle(vehicle._id || vehicle.id)}
            />
          ))
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    backgroundColor: '#2563eb',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  syncButton: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
  },
});
