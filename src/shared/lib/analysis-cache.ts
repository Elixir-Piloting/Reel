import type { AnalyzeResponse } from './types';

interface CacheEntry {
  result: AnalyzeResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 50;

export function getCachedAnalysis(url: string): AnalyzeResponse | null {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.timestamp < TTL) return entry.result;
  cache.delete(url);
  return null;
}

export function setCachedAnalysis(url: string, result: AnalyzeResponse): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { result, timestamp: Date.now() });
}

export function invalidateCache(url: string): void {
  cache.delete(url);
}
