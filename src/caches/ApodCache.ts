import { createSimpleCache } from "./createSimpleCache.ts";

export interface ApodResponse {
  title: string;
  explanation: string;
  date: string;
  url: string;
  hdUrl: string | null;
  mediaType: string;
  copyright: string | null;
}

const cache = createSimpleCache<ApodResponse>();

export const updateApod = cache.update;
export const setApodError = cache.setError;
export const getApod = cache.get;
export const getApodHealth = cache.getHealth;
