import { axiosClient } from './axiosClient';
import { AuthResponse, LoginCredentials, RegisterCredentials, User } from '@/types';
import { storage } from '@/utils/storage';

export const authApi = {
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      console.log('Attempting to register user:', credentials.email);
      const response = await axiosClient.post<AuthResponse>('/auth/register', credentials);
      
      if (response.data.success && response.data.data.token) {
        await storage.saveToken(response.data.data.token);
        console.log('Registration successful, token saved');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Registration error:', error.response?.data || error.message);
      
      // Handle specific MongoDB duplicate key error
      if (error.response?.data?.message?.includes('duplicate key')) {
        throw new Error('Email already exists. Please use a different email or try logging in.');
      }
      
      // Handle validation errors
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      
      throw new Error('Registration failed. Please try again.');
    }
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log('Attempting to login user:', credentials.email);
      const response = await axiosClient.post<AuthResponse>('/auth/login', credentials);
      
      if (response.data.success && response.data.data.token) {
        await storage.saveToken(response.data.data.token);
        console.log('Login successful, token saved');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      
      throw new Error('Login failed. Please check your credentials and try again.');
    }
  },

  async getCurrentUser(): Promise<User> {
    try {
      const response = await axiosClient.get<{ success: boolean; data: User }>('/auth/me');
      return response.data.data;
    } catch (error: any) {
      console.error('Get current user error:', error.response?.data || error.message);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await storage.removeToken();
      await storage.removeActiveVehicle();
      console.log('Logout successful, tokens cleared');
    } catch (error) {
      console.error('Logout error:', error);
    }
  },
};