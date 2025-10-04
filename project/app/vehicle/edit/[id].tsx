import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { ArrowLeft, ChevronDown, Check } from 'lucide-react-native';

export default function EditVehicleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, updateVehicle, isUpdating, isLoading } = useVehicles();

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('medium');
  const [batteryCapacity, setBatteryCapacity] = useState('');
  const [consumption_kWh_per_km, setConsumption_kWh_per_km] = useState('');
  const [kmRun, setKmRun] = useState('');
  const [degradationPercent, setDegradationPercent] = useState('');
  const [chargingPortType, setChargingPortType] = useState('CCS');
  const [maxChargePower, setMaxChargePower] = useState('');
  const [topSpeed, setTopSpeed] = useState('');
  const [error, setError] = useState('');
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showChargingDropdown, setShowChargingDropdown] = useState(false);
  const [vehicleFound, setVehicleFound] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const sizeOptions = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'suv', label: 'SUV' },
  ];

  const chargingPortOptions = [
    { value: 'CCS', label: 'CCS' },
    { value: 'CHAdeMO', label: 'CHAdeMO' },
    { value: 'Type2', label: 'Type 2' },
    { value: 'GB/T', label: 'GB/T' },
  ];

  useEffect(() => {
    console.log('Edit vehicle - ID:', id);
    console.log('Edit vehicle - Available vehicles:', vehicles.map(v => ({ _id: v._id, name: v.name })));
    
    const vehicle = vehicles.find(v => v._id === id);
    if (vehicle && !isInitialized) {
      console.log('Edit vehicle - Found vehicle:', vehicle);
      setName(vehicle.name);
      setModel(vehicle.model);
      setSize(vehicle.size);
      setBatteryCapacity(vehicle.batteryCapacity.toString());
      setConsumption_kWh_per_km(vehicle.consumption_kWh_per_km.toString());
      setKmRun(vehicle.kmRun.toString());
      setDegradationPercent(vehicle.degradationPercent?.toString() || '0');
      setChargingPortType(vehicle.chargingPortType || 'CCS');
      setMaxChargePower(vehicle.maxChargePower?.toString() || '50');
      setTopSpeed(vehicle.topSpeed?.toString() || '120');
      setVehicleFound(true);
      setIsInitialized(true);
    } else {
      console.log('Edit vehicle - Vehicle not found for ID:', id);
      setVehicleFound(false);
    }
  }, [id, vehicles, isInitialized]);

  const handleSubmit = async () => {
    setError('');

    if (!name || !model || !batteryCapacity || !consumption_kWh_per_km) {
      setError('Please fill in all required fields');
      return;
    }

    const batteryNum = parseFloat(batteryCapacity);
    const consumptionNum = parseFloat(consumption_kWh_per_km);
    const kmNum = parseFloat(kmRun);
    const degradationNum = parseFloat(degradationPercent);
    const maxChargeNum = parseFloat(maxChargePower);
    const topSpeedNum = parseFloat(topSpeed);

    // Validation
    if (isNaN(batteryNum) || batteryNum < 10 || batteryNum > 200) {
      setError('Battery capacity must be between 10-200 kWh');
      return;
    }

    if (isNaN(consumptionNum) || consumptionNum < 0.05 || consumptionNum > 1.0) {
      setError('Consumption rate must be between 0.05-1.0 kWh/km');
      return;
    }

    if (isNaN(kmNum) || kmNum < 0) {
      setError('Distance run must be 0 or greater');
      return;
    }

    if (isNaN(degradationNum) || degradationNum < 0 || degradationNum > 100) {
      setError('Degradation must be between 0-100%');
      return;
    }

    if (isNaN(maxChargeNum) || maxChargeNum < 3.3 || maxChargeNum > 350) {
      setError('Max charge power must be between 3.3-350 kW');
      return;
    }

    if (isNaN(topSpeedNum) || topSpeedNum < 0) {
      setError('Top speed must be 0 or greater');
      return;
    }

    try {
      console.log('Updating vehicle with ID:', id);
      console.log('Update data:', {
        name,
        model,
        size,
        batteryCapacity: batteryNum,
        consumption_kWh_per_km: consumptionNum,
        kmRun: kmNum,
        degradationPercent: degradationNum,
        chargingPortType,
        maxChargePower: maxChargeNum,
        topSpeed: topSpeedNum,
      });

      await updateVehicle({
        id,
        vehicle: {
          name,
          model,
          size,
          batteryCapacity: batteryNum,
          consumption_kWh_per_km: consumptionNum,
          kmRun: kmNum,
          degradationPercent: degradationNum,
          chargingPortType,
          maxChargePower: maxChargeNum,
          topSpeed: topSpeedNum,
        },
      });
      
      console.log('Vehicle updated successfully');
      router.back();
    } catch (err: any) {
      console.error('Error updating vehicle:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update vehicle');
    }
  };

  // Show loading while fetching vehicles
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading vehicle...</Text>
      </View>
    );
  }

  // Show error if vehicle not found
  if (!vehicleFound && vehicles.length > 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Vehicle</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Vehicle Not Found</Text>
          <Text style={styles.errorText}>
            The vehicle you're trying to edit could not be found. It may have been deleted.
          </Text>
          <TouchableOpacity style={styles.backToVehiclesButton} onPress={() => router.back()}>
            <Text style={styles.backToVehiclesText}>Back to Vehicles</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Vehicle</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Vehicle Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., My Tesla"
            value={name}
            onChangeText={setName}
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Model *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Model 3"
            value={model}
            onChangeText={setModel}
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Vehicle Size *</Text>
          <TouchableOpacity
            style={[styles.dropdown, isUpdating && styles.inputDisabled]}
            onPress={() => setShowSizeDropdown(!showSizeDropdown)}
            disabled={isUpdating}
          >
            <Text style={[styles.dropdownText, size === '' && styles.placeholderText]}>
              {sizeOptions.find(option => option.value === size)?.label || 'Select size'}
            </Text>
            <ChevronDown size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Battery Capacity (kWh) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 75"
            value={batteryCapacity}
            onChangeText={setBatteryCapacity}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Consumption Rate (kWh/km) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 0.15"
            value={consumption_kWh_per_km}
            onChangeText={setConsumption_kWh_per_km}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Distance Run (km) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 5000"
            value={kmRun}
            onChangeText={setKmRun}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Battery Degradation (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={degradationPercent}
            onChangeText={setDegradationPercent}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Charging Port Type</Text>
          <TouchableOpacity
            style={[styles.dropdown, isUpdating && styles.inputDisabled]}
            onPress={() => setShowChargingDropdown(!showChargingDropdown)}
            disabled={isUpdating}
          >
            <Text style={[styles.dropdownText, chargingPortType === '' && styles.placeholderText]}>
              {chargingPortOptions.find(option => option.value === chargingPortType)?.label || 'Select port type'}
            </Text>
            <ChevronDown size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Max Charge Power (kW)</Text>
          <TextInput
            style={styles.input}
            placeholder="50"
            value={maxChargePower}
            onChangeText={setMaxChargePower}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Top Speed (km/h)</Text>
          <TextInput
            style={styles.input}
            placeholder="120"
            value={topSpeed}
            onChangeText={setTopSpeed}
            keyboardType="decimal-pad"
            editable={!isUpdating}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isUpdating && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Size Dropdown Modal */}
      <Modal
        visible={showSizeDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSizeDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSizeDropdown(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownTitle}>Select Vehicle Size</Text>
            {sizeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.dropdownOption}
                onPress={() => {
                  setSize(option.value);
                  setShowSizeDropdown(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{option.label}</Text>
                {size === option.value && <Check size={20} color="#2563eb" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Charging Port Dropdown Modal */}
      <Modal
        visible={showChargingDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChargingDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChargingDropdown(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownTitle}>Select Charging Port Type</Text>
            {chargingPortOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.dropdownOption}
                onPress={() => {
                  setChargingPortType(option.value);
                  setShowChargingDropdown(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{option.label}</Text>
                {chargingPortType === option.value && <Check size={20} color="#2563eb" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
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
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 16,
    color: '#1e293b',
  },
  placeholderText: {
    color: '#94a3b8',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dropdownModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#1e293b',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  backToVehiclesButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backToVehiclesText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
