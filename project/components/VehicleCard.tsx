import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Vehicle } from '@/types';
import { CreditCard as Edit, Trash2, Check } from 'lucide-react-native';

interface VehicleCardProps {
  vehicle: Vehicle;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function VehicleCard({ vehicle, isActive, onSelect, onEdit, onDelete }: VehicleCardProps) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Vehicle',
      `Are you sure you want to delete ${vehicle.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.activeCard]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.info}>
            <Text style={styles.name}>{vehicle.name}</Text>
            <Text style={styles.model}>{vehicle.model}</Text>
          </View>
          {isActive && (
            <View style={styles.activeBadge}>
              <Check size={16} color="#fff" />
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>

        <View style={styles.specs}>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Battery</Text>
            <Text style={styles.specValue}>{vehicle.batteryCapacity} kWh</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Consumption</Text>
            <Text style={styles.specValue}>{vehicle.consumption_kWh_per_km} kWh/km</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Distance</Text>
            <Text style={styles.specValue}>{vehicle.kmRun.toLocaleString()} km</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
            <Edit size={18} color="#2563eb" />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
            <Trash2 size={18} color="#ef4444" />
            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  activeCard: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  content: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  model: {
    fontSize: 14,
    color: '#64748b',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  activeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  specs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  specItem: {
    flex: 1,
  },
  specLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  specValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  deleteText: {
    color: '#ef4444',
  },
});