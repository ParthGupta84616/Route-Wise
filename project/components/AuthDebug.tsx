import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { storage } from '@/utils/storage';
import { useState } from 'react';

interface AuthDebugProps {
  onTokenCleared: () => void;
}

export function AuthDebug({ onTokenCleared }: AuthDebugProps) {
  const [token, setToken] = useState<string | null>(null);

  const checkToken = async () => {
    const currentToken = await storage.getToken();
    setToken(currentToken);
  };

  const clearToken = async () => {
    await storage.removeToken();
    await storage.removeActiveVehicle();
    setToken(null);
    onTokenCleared();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Information</Text>
      
      <TouchableOpacity style={styles.button} onPress={checkToken}>
        <Text style={styles.buttonText}>Check Token</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearToken}>
        <Text style={styles.buttonText}>Clear Token</Text>
      </TouchableOpacity>
      
      {token && (
        <View style={styles.tokenContainer}>
          <Text style={styles.tokenLabel}>Current Token:</Text>
          <Text style={styles.tokenText}>{token.substring(0, 20)}...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  clearButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  tokenContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tokenLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'monospace',
  },
});
