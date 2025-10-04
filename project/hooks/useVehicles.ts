import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleApi } from '@/api/vehicleApi';
import { VehicleInput } from '@/types';
import { storage } from '@/utils/storage';
import { useAuth } from './useAuth';

export function useVehicles(loadFromCache = false) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: vehicles = [], isLoading, refetch } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      if (loadFromCache) {
        const cached = await storage.getVehiclesCache();
        if (cached && cached.length > 0) return cached;
      }
      const data = await vehicleApi.getVehicles();
      await storage.saveVehiclesCache(data);
      return data;
    },
    enabled: isAuthenticated === true,
    retry: false,
  });

  const syncFromBackend = async () => {
    const data = await vehicleApi.getVehicles();
    await storage.saveVehiclesCache(data);
    queryClient.setQueryData(['vehicles'], data);
    return data;
  };

  const createMutation = useMutation({
    mutationFn: (vehicle: VehicleInput) => vehicleApi.createVehicle(vehicle),
    onSuccess: async (newVehicle) => {
      await syncFromBackend();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, vehicle }: { id: string; vehicle: Partial<VehicleInput> }) =>
      vehicleApi.updateVehicle(id, vehicle),
    onSuccess: async () => {
      await syncFromBackend();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vehicleApi.deleteVehicle(id),
    onSuccess: async () => {
      await syncFromBackend();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return {
    vehicles,
    isLoading,
    syncFromBackend,
    refetch,
    createVehicle: createMutation.mutateAsync,
    updateVehicle: updateMutation.mutateAsync,
    deleteVehicle: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}