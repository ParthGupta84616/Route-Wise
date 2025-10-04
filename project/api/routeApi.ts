import { axiosClient } from './axiosClient';
import { GeocodeResult, RoutePlanRequest, RoutePlanResponse } from '@/types';

export const routeApi = {
  async geocode(address: string, country: string = 'IN'): Promise<GeocodeResult> {
    const response = await axiosClient.get<GeocodeResult>('/geocode', {
      params: { address, country },
    });
    return response.data;
  },

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
    const response = await axiosClient.get<GeocodeResult>('/geocode/reverse', {
      params: { lat, lng },
    });
    return response.data;
  },

  async planRoute(request: RoutePlanRequest): Promise<RoutePlanResponse> {
    const response = await axiosClient.post<RoutePlanResponse>('/plan-route', request);
    return response.data;
  },
};
