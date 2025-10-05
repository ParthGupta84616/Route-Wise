import axios from 'axios';
import { storage } from '@/utils/storage';
import Constants from 'expo-constants';

// Determine API base URL from Expo extras if provided, otherwise fall back to the
// previously hardcoded URL. This enables changing the backend URL without
// editing source files (useful when building an APK).
const hardcoded = 'https://bfab17803a89.ngrok-free.app/api';
const expoExtraUrl = (Constants?.expoConfig?.extra as any)?.API_BASE_URL;
export const API_BASE_URL = typeof expoExtraUrl === 'string' && expoExtraUrl.length > 0 ? expoExtraUrl : hardcoded;

export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

axiosClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.log('401 Unauthorized - clearing tokens');
      await storage.clearAll();
    }
    return Promise.reject(error);
  }
);