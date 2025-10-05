import axios from 'axios';
import { axiosClient, API_BASE_URL } from './axiosClient';
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

  async getWayToAmenity(start: string, end: string, segmentDistanceMeters: number = 200): Promise<any> {
    const payloadVariants = [
      // common variant used earlier
      { start, end, segmentDistanceMeters, batchSize: 10 },
      // alternate variant some backends expect
      { source: start, destination: end, segmentDistanceMeters, batchSize: 10 },
    ];

    // Helper to attempt a POST via axiosClient (keeps auth header/interceptors)
    const tryPost = async (url: string, payload: any) => {
      try {
        const resp = await axiosClient.post(url, payload);
        return resp.data;
      } catch (err: any) {
        // Attach useful debug info and rethrow to caller
        const status = err?.response?.status;
        const respData = err?.response?.data;
        const message = err?.message || 'unknown error';
        throw { status, respData, message, originalError: err };
      }
    };

    // 1) Try primary endpoint '/get-routes' with each payload variant
    for (const p of payloadVariants) {
      try {
        const data = await tryPost('/get-routes', p);
        return data;
      } catch (e: any) {
        console.warn('Primary /get-routes attempt failed', e.status || e.message, e.respData || '');
        // continue to next payload variant
      }
    }

    // 2) Build fallback candidate URLs derived from axiosClient.defaults.baseURL or exported API_BASE_URL
    const base = (axiosClient.defaults.baseURL || API_BASE_URL || '').replace(/\/+$/, ''); // no trailing slash
    const candidates = [
      `${base.replace(/\/api$/, '')}/api/get-routes`,
      `${base.replace(/\/api$/, '')}/get-routes`,
      `${base}/get-routes`
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    // 3) Try candidates sequentially with each payload variant
    for (const url of candidates) {
      for (const p of payloadVariants) {
        try {
          // axiosClient.post accepts absolute URLs; interceptors still run
          const data = await tryPost(url, p);
          return data;
        } catch (e: any) {
          console.warn(`Fallback POST to ${url} with payload variant failed`, e.status || e.message, e.respData || '');
          // continue to next payload variant / candidate
        }
      }
    }

    // 4) All attempts failed — throw a descriptive error with attempted endpoints
    const finalErr: any = new Error('Failed to fetch amenity route from /get-routes (all endpoints and payload variants attempted)');
    finalErr.attempted = { candidates, payloadVariantsCount: payloadVariants.length };
    throw finalErr;
  },

  // Backwards-compatible alias
  async getWay(start: string, end: string, segmentDistanceMeters: number = 200): Promise<any> {
    return await (this as any).getWayToAmenity(start, end, segmentDistanceMeters);
  },
};
