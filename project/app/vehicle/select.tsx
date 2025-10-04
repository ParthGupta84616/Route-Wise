import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { storage } from '@/utils/storage';
import { Plus, Check, RefreshCw } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/hooks/useAuth';

export default function SelectVehicleScreen() {
  const router = useRouter();
  const { vehicles, isLoading, syncFromBackend } = useVehicles(true);
  const { isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Check auth when screen loads
  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Reset selection when screen is focused
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
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Select Your Vehicle</Text>
          <Text style={styles.subtitle}>Choose a vehicle to start planning routes</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncFromBackend}
          disabled={isSyncing}
        >
          <RefreshCw size={18} color="#2563eb" />
          <Text style={styles.syncButtonText}>
            {isSyncing ? 'Syncing...' : 'Sync from Server'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/vehicle/add')}
        >
          <Plus size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No vehicles found</Text>
            <Text style={styles.emptyText}>Add your first vehicle to get started</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/vehicle/add')}
            >
              <Text style={styles.emptyButtonText}>Add Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {vehicles.map((vehicle) => (
              <TouchableOpacity
                key={vehicle._id}
                style={[
                  styles.vehicleCard,
                  selectedId === vehicle._id && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedId(vehicle._id)}
              >
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>{vehicle.name}</Text>
                  <Text style={styles.vehicleModel}>{vehicle.model}</Text>
                  <View style={styles.vehicleSpecs}>
                    <Text style={styles.specText}>⚡ {vehicle.batteryCapacity} kWh</Text>
                    <Text style={styles.specText}>📊 {vehicle.consumption_kWh_per_km} kWh/km</Text>
                  </View>
                </View>
                {selectedId === vehicle._id && (
                  <View style={styles.checkmark}>
                    <Check size={24} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.confirmButton, !selectedId && styles.confirmButtonDisabled]}
              onPress={handleSelectVehicle}
              disabled={!selectedId}
            >
              <Text style={styles.confirmButtonText}>Continue</Text>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#fff',
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  vehicleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  vehicleModel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  vehicleSpecs: {
    flexDirection: 'row',
    gap: 16,
  },
  specText: {
    fontSize: 12,
    color: '#64748b',
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
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
});