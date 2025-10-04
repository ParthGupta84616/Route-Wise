import { axiosClient } from './axiosClient';
import { Vehicle, VehicleInput } from '@/types';

export const vehicleApi = {
  async getVehicles(): Promise<Vehicle[]> {
    console.log('Fetching vehicles from API');
    const response = await axiosClient.get<{ success: boolean; data: Vehicle[] }>('/vehicles');
    console.log('Vehicles fetched successfully:', response.data.data);
    return response.data.data;
  },

  async createVehicle(vehicle: VehicleInput): Promise<Vehicle> {
    const response = await axiosClient.post<{ success: boolean; data: Vehicle }>('/vehicles', vehicle);
    return response.data.data;
  },

  async updateVehicle(id: string, vehicle: Partial<VehicleInput>): Promise<Vehicle> {
    const response = await axiosClient.put<{ success: boolean; data: Vehicle }>(`/vehicles/${id}`, vehicle);
    return response.data.data;
  },

  async deleteVehicle(id: string): Promise<void> {
    await axiosClient.delete(`/vehicles/${id}`);
  },
};
