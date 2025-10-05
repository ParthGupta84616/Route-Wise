import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useVehicles } from '@/hooks/useVehicles';
import { ArrowLeft, ChevronDown, Check, Car, Battery, Gauge, Zap, Settings, Plug, Plus } from 'lucide-react-native';
import { storage } from '@/utils/storage';
import { LinearGradient } from 'expo-linear-gradient';

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
  const [chargingPortType, setChargingPortType] = useState('CCS');
  const [maxChargePower, setMaxChargePower] = useState('50');
  const [topSpeed, setTopSpeed] = useState('120');
  const [error, setError] = useState('');
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showChargingDropdown, setShowChargingDropdown] = useState(false);

  const sizeOptions = [
    { value: 'small', label: 'Small', emoji: '🚗' },
    { value: 'medium', label: 'Medium', emoji: '🚙' },
    { value: 'large', label: 'Large', emoji: '🚐' },
    { value: 'suv', label: 'SUV', emoji: '🚙' },
  ];

  const chargingPortOptions = [
    { value: 'CCS', label: 'CCS' },
    { value: 'CHAdeMO', label: 'CHAdeMO' },
    { value: 'Type2', label: 'Type 2' },
    { value: 'GB/T', label: 'GB/T' },
  ];

  useFocusEffect(
    useCallback(() => {
      resetForm();
      return () => {};
    }, [])
  );

  const resetForm = () => {
    setName('');
    setModel('');
    setSize('');
    setBatteryCapacity('');
    setConsumptionRate('');
    setKmRun('');
    setDegradation('');
    setChargingPortType('CCS');
    setMaxChargePower('50');
    setTopSpeed('120');
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
    const degradationNum = degradation ? parseFloat(degradation) : 0;
    const maxChargeNum = parseFloat(maxChargePower);
    const topSpeedNum = parseFloat(topSpeed);

    if (isNaN(batteryNum) || batteryNum < 10 || batteryNum > 200) {
      setError('Battery capacity must be between 10-200 kWh');
      return;
    }

    if (isNaN(consumptionNum) || consumptionNum < 0.05 || consumptionNum > 1.0) {
      setError('Consumption rate must be between 0.05-1.0 kWh/km');
      return;
    }

    if (isNaN(kmNum) || kmNum < 0) {
      setError('Distance must be 0 or greater');
      return;
    }

    try {
      await createVehicle({
        name: name.trim(),
        model: model.trim(),
        size,
        batteryCapacity: batteryNum,
        consumption_kWh_per_km: consumptionNum,
        kmRun: kmNum,
        degradationPercent: degradationNum,
        chargingPortType,
        maxChargePower: maxChargeNum,
        topSpeed: topSpeedNum,
      });
      
      Alert.alert('Success', 'Vehicle added successfully!', [
        {
          text: 'OK',
          onPress: async () => {
            resetForm();
            const hasVehicle = await storage.hasSelectedVehicle();
            if (!hasVehicle) {
              router.replace('/vehicle/select');
            } else {
              router.back();
            }
          }
        }
      ]);
    } catch (err: any) {
      console.error('Error creating vehicle:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create vehicle');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#3b82f6', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Vehicle</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Car size={20} color="#3b82f6" strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Basic Information</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., My Tesla Model 3"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={setName}
              editable={!isCreating}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Model *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Tesla Model 3 Long Range"
              placeholderTextColor="#94a3b8"
              value={model}
              onChangeText={setModel}
              editable={!isCreating}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Size *</Text>
            <TouchableOpacity
              style={[styles.dropdown, isCreating && styles.inputDisabled]}
              onPress={() => setShowSizeDropdown(true)}
              disabled={isCreating}
            >
              <View style={styles.dropdownContent}>
                {size && (
                  <Text style={styles.dropdownEmoji}>
                    {sizeOptions.find(option => option.value === size)?.emoji}
                  </Text>
                )}
                <Text style={[styles.dropdownText, !size && styles.placeholderText]}>
                  {sizeOptions.find(option => option.value === size)?.label || 'Select vehicle size'}
                </Text>
              </View>
              <ChevronDown size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Battery Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Battery size={20} color="#3b82f6" strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Battery Specifications</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Capacity *</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  placeholder="75"
                  placeholderTextColor="#94a3b8"
                  value={batteryCapacity}
                  onChangeText={setBatteryCapacity}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
                <Text style={styles.inputUnit}>kWh</Text>
              </View>
            </View>

            <View style={styles.halfInput}>
              <Text style={styles.label}>Degradation</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={degradation}
                  onChangeText={setDegradation}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
                <Text style={styles.inputUnit}>%</Text>
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Consumption Rate *</Text>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.inputField}
                placeholder="0.18"
                placeholderTextColor="#94a3b8"
                value={consumptionRate}
                onChangeText={setConsumptionRate}
                keyboardType="decimal-pad"
                editable={!isCreating}
              />
              <Text style={styles.inputUnit}>kWh/km</Text>
            </View>
          </View>
        </View>

        {/* Charging Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Plug size={20} color="#3b82f6" strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Charging</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Port Type</Text>
            <TouchableOpacity
              style={[styles.dropdown, isCreating && styles.inputDisabled]}
              onPress={() => setShowChargingDropdown(true)}
              disabled={isCreating}
            >
              <Text style={styles.dropdownText}>
                {chargingPortOptions.find(option => option.value === chargingPortType)?.label || 'Select port'}
              </Text>
              <ChevronDown size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Max Charge Power</Text>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.inputField}
                placeholder="50"
                placeholderTextColor="#94a3b8"
                value={maxChargePower}
                onChangeText={setMaxChargePower}
                keyboardType="decimal-pad"
                editable={!isCreating}
              />
              <Text style={styles.inputUnit}>kW</Text>
            </View>
          </View>
        </View>

        {/* Performance Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Gauge size={20} color="#3b82f6" strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>Performance</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Distance Run *</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={kmRun}
                  onChangeText={setKmRun}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
                <Text style={styles.inputUnit}>km</Text>
              </View>
            </View>

            <View style={styles.halfInput}>
              <Text style={styles.label}>Top Speed</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  placeholder="120"
                  placeholderTextColor="#94a3b8"
                  value={topSpeed}
                  onChangeText={setTopSpeed}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
                <Text style={styles.inputUnit}>km/h</Text>
              </View>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.addButton, isCreating && styles.addButtonDisabled]}
          onPress={handleSubmit}
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.addButtonText}>Adding...</Text>
            </>
          ) : (
            <>
              <Plus size={20} color="#fff" strokeWidth={2.5} />
              <Text style={styles.addButtonText}>Add Vehicle</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Size Dropdown Modal */}
      <Modal visible={showSizeDropdown} transparent animationType="slide" onRequestClose={() => setShowSizeDropdown(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowSizeDropdown(false)} />
          <View style={styles.dropdownModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.dropdownTitle}>Select Vehicle Size</Text>
            {sizeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.dropdownOption, size === option.value && styles.dropdownOptionActive]}
                onPress={() => {
                  setSize(option.value);
                  setShowSizeDropdown(false);
                }}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={[styles.dropdownOptionText, size === option.value && styles.dropdownOptionTextActive]}>
                  {option.label}
                </Text>
                {size === option.value && <Check size={20} color="#3b82f6" strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Charging Port Dropdown Modal */}
      <Modal visible={showChargingDropdown} transparent animationType="slide" onRequestClose={() => setShowChargingDropdown(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowChargingDropdown(false)} />
          <View style={styles.dropdownModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.dropdownTitle}>Select Charging Port</Text>
            {chargingPortOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.dropdownOption, chargingPortType === option.value && styles.dropdownOptionActive]}
                onPress={() => {
                  setChargingPortType(option.value);
                  setShowChargingDropdown(false);
                }}
              >
                <Text style={[styles.dropdownOptionText, chargingPortType === option.value && styles.dropdownOptionTextActive]}>
                  {option.label}
                </Text>
                {chargingPortType === option.value && <Check size={20} color="#3b82f6" strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingRight: 14,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
  },
  inputUnit: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownEmoji: {
    fontSize: 20,
  },
  dropdownText: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  placeholderText: {
    color: '#94a3b8',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dropdownModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#cbd5e1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  dropdownTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  dropdownOptionActive: {
    backgroundColor: '#dbeafe',
  },
  optionEmoji: {
    fontSize: 24,
  },
  dropdownOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: '#1e40af',
  },
  headerContent: {
    // vertical spacing via margin on elements
  },
});
