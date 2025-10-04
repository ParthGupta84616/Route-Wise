import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const ACTIVE_VEHICLE_KEY = 'active_vehicle';
const VEHICLES_CACHE_KEY = 'vehicles_cache';
const HAS_SELECTED_VEHICLE_KEY = 'has_selected_vehicle';

export const storage = {
  async saveToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      }
      console.log('Token saved successfully');
    } catch (error) {
      console.error('Error saving token:', error);
      throw error;
    }
  },

  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return await AsyncStorage.getItem(TOKEN_KEY);
      } else {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  },

  async removeToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      console.log('Token removed successfully');
    } catch (error) {
      console.error('Error removing token:', error);
    }
  },

  async saveActiveVehicle(vehicleId: string): Promise<void> {
    await AsyncStorage.setItem(ACTIVE_VEHICLE_KEY, vehicleId);
    await AsyncStorage.setItem(HAS_SELECTED_VEHICLE_KEY, 'true');
  },

  async getActiveVehicle(): Promise<string | null> {
    return await AsyncStorage.getItem(ACTIVE_VEHICLE_KEY);
  },

  async removeActiveVehicle(): Promise<void> {
    await AsyncStorage.removeItem(ACTIVE_VEHICLE_KEY);
    await AsyncStorage.removeItem(HAS_SELECTED_VEHICLE_KEY);
  },

  async hasSelectedVehicle(): Promise<boolean> {
    const value = await AsyncStorage.getItem(HAS_SELECTED_VEHICLE_KEY);
    return value === 'true';
  },

  async saveVehiclesCache(vehicles: any[]): Promise<void> {
    await AsyncStorage.setItem(VEHICLES_CACHE_KEY, JSON.stringify(vehicles));
  },

  async getVehiclesCache(): Promise<any[] | null> {
    try {
      const value = await AsyncStorage.getItem(VEHICLES_CACHE_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error getting vehicles cache:', error);
      return null;
    }
  },

  async clearVehiclesCache(): Promise<void> {
    await AsyncStorage.removeItem(VEHICLES_CACHE_KEY);
  },

  async clearAll(): Promise<void> {
    try {
      await this.removeToken();
      await this.removeActiveVehicle();
      await this.clearVehiclesCache();
      console.log('All storage cleared');
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  },
};
