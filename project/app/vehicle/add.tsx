import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useVehicles } from '@/hooks/useVehicles';
import { ArrowLeft, ChevronDown, Check } from 'lucide-react-native';
import * as storage from '@/utils/storage';

export default function AddVehicleScreen() {
  const router = useRouter();
  const { createVehicle, isCreating } = useVehicles();

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('');
  const [batteryCapacity, setBatteryCapacity] = useState('');
  const [consumptionRate, setConsumptionRate] = useState('');
  const [kmRun, setKmRun] = useState('');
  const [degradation, setDegradation] = useState('');
  const [error, setError] = useState('');
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showChargingDropdown, setShowChargingDropdown] = useState(false);

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

  // Reset form when screen is focused
  useEffect(() => {
    const unsubscribe = router.addListener('focus', () => {
      resetForm();
    });
    return unsubscribe;
  }, [router]);

  const resetForm = () => {
    setName('');
    setModel('');
    setSize('');
    setBatteryCapacity('');
    setConsumptionRate('');
    setKmRun('');
    setDegradation('');
    setError('');
  };

  const handleSubmit = async () => {
    setError('');

    if (!name || !model || !size || !batteryCapacity || !consumptionRate || !kmRun) {
      setError('Please fill in all required fields');
      return;
    }

    const batteryNum = parseFloat(batteryCapacity);
    const consumptionNum = parseFloat(consumptionRate);
    const kmNum = parseFloat(kmRun);
    const degradationNum = degradation ? parseFloat(degradation) : undefined;

    if (isNaN(batteryNum) || isNaN(consumptionNum) || isNaN(kmNum)) {
      setError('Please enter valid numbers');
      return;
    }

    try {
      await createVehicle({
        name,
        model,
        size,
        batteryCapacity: batteryNum,
        consumptionRate: consumptionNum,
        kmRun: kmNum,
        degradation: degradationNum,
      });
      
      // Reset form after successful creation
      resetForm();
      
      // Check if this is first vehicle selection flow
      const hasVehicle = await storage.hasSelectedVehicle();
      if (!hasVehicle) {
        router.replace('/vehicle/select');
      } else {
        router.back();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create vehicle');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Vehicle</Text>
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
            editable={!isCreating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Model *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Model 3"
            value={model}
            onChangeText={setModel}
            editable={!isCreating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Vehicle Size *</Text>
          <TouchableOpacity
            style={[styles.dropdown, isCreating && styles.inputDisabled]}
            onPress={() => setShowSizeDropdown(!showSizeDropdown)}
            disabled={isCreating}
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
            editable={!isCreating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Consumption Rate (kWh/km) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 0.15"
            value={consumptionRate}
            onChangeText={setConsumptionRate}
            keyboardType="decimal-pad"
            editable={!isCreating}
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
            editable={!isCreating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Battery Degradation (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={degradation}
            onChangeText={setDegradation}
            keyboardType="decimal-pad"
            editable={!isCreating}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Charging Port Type</Text>
          <TouchableOpacity
            style={[styles.dropdown, isCreating && styles.inputDisabled]}
            onPress={() => setShowChargingDropdown(!showChargingDropdown)}
            disabled={isCreating}
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
            editable={!isCreating}
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
            editable={!isCreating}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isCreating && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Vehicle</Text>
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
});