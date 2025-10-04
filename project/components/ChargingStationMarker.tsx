import { View, Text, StyleSheet } from 'react-native';
import { ChargingStation } from '@/types';
import { Zap } from 'lucide-react-native';

interface ChargingStationMarkerProps {
  station: ChargingStation;
}

export function ChargingStationMarker({ station }: ChargingStationMarkerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.marker}>
        <Zap size={16} color="#fff" />
      </View>
      <Text style={styles.label}>{station.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
});