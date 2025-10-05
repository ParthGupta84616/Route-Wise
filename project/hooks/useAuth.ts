import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { LoginCredentials, RegisterCredentials } from '@/types';
import { storage } from '@/utils/storage';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';

export function useAuth() {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await storage.getToken();
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    }
  };

  const userQuery = useQuery<any, Error>({
    queryKey: ['user'],
    queryFn: authApi.getCurrentUser,
    enabled: isAuthenticated === true,
    retry: false,
  });

  const user = userQuery.data;

  // If fetching the current user fails, clear storage and mark unauthenticated
  useEffect(() => {
    if (userQuery.isError) {
      (async () => {
        await storage.clearAll();
        setIsAuthenticated(false);
      })();
    }
  }, [userQuery.isError]);

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: () => {
      setIsAuthenticated(true);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (credentials: RegisterCredentials) => {
      console.log('Registering user:', credentials);
      return authApi.register(credentials);
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const logout = async () => {
    try {
      console.log('Starting logout process...');
      
      // Clear everything
      await storage.clearAll();
      queryClient.clear();
      setIsAuthenticated(false);
      
      console.log('Forcing app reload...');
      
      // Force app restart - this will completely reset the navigation stack
      if (Updates.isEnabled) {
        await Updates.reloadAsync();
      } else {
        // In development, just navigate
        setTimeout(() => {
          router.replace('/');
        }, 100);
      }
      
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback - just navigate
      router.replace('/');
      setIsAuthenticated(false);
    }
  };

  return {
    user,
    isAuthenticated,
  isLoading: isAuthenticated === null || (isAuthenticated && userQuery.isLoading),
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    checkAuthStatus,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}