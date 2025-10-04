import axios from 'axios';
import { storage } from '@/utils/storage';

// API Configuration
// Change this URL to point to your backend API
const API_BASE_URL = 'http://192.168.29.177:5000/api';

// For local development, uncomment the line below:
// const API_BASE_URL = 'http://localhost:5000/api';

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