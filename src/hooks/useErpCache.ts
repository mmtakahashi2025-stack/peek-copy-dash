import { useCallback, useState, useEffect } from 'react';
import { RawSaleRow } from '@/contexts/SheetDataContext';

const CACHE_KEY = 'erp_data_cache';
const CACHE_META_KEY = 'erp_cache_meta';
const MAX_CACHE_ENTRIES = 12; // Max 12 months of cached data
const MAX_CACHE_AGE_HOURS = 24; // Cache expires after 24 hours
const MAX_CACHE_SIZE_MB = 50; // Maximum cache size in MB

interface CacheEntry {
  data: RawSaleRow[];
  timestamp: number;
  period: { from: string; to: string };
}

interface CacheStore {
  entries: Record<string, CacheEntry>;
  version: number;
}

interface CacheMeta {
  totalEntries: number;
  totalSizeMB: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

function generateCacheKey(dateFrom: Date, dateTo: Date): string {
  const fromStr = dateFrom.toISOString().split('T')[0];
  const toStr = dateTo.toISOString().split('T')[0];
  return `${fromStr}_${toStr}`;
}

function getStorageSize(obj: unknown): number {
  const str = JSON.stringify(obj);
  // Size in bytes, then convert to MB
  return new Blob([str]).size / (1024 * 1024);
}

function loadCacheFromStorage(): CacheStore {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CacheStore;
      // Clean expired entries on load
      const now = Date.now();
      const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
      
      const validEntries: Record<string, CacheEntry> = {};
      for (const [key, entry] of Object.entries(parsed.entries)) {
        if (now - entry.timestamp < maxAge) {
          validEntries[key] = entry;
        }
      }
      
      return { ...parsed, entries: validEntries };
    }
  } catch (error) {
    console.error('Error loading cache:', error);
  }
  return { entries: {}, version: 1 };
}

function saveCacheToStorage(cache: CacheStore): void {
  try {
    // Check size before saving
    const size = getStorageSize(cache);
    if (size > MAX_CACHE_SIZE_MB) {
      console.warn(`Cache size (${size.toFixed(2)}MB) exceeds limit. Pruning oldest entries...`);
      // Remove oldest entries until under limit
      const sortedEntries = Object.entries(cache.entries)
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      while (getStorageSize({ ...cache, entries: Object.fromEntries(sortedEntries) }) > MAX_CACHE_SIZE_MB && sortedEntries.length > 0) {
        sortedEntries.shift();
      }
      
      cache.entries = Object.fromEntries(sortedEntries);
    }
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving cache:', error);
    // If quota exceeded, clear oldest entries
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearCache();
    }
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_META_KEY);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

export function useErpCache() {
  const [cacheMeta, setCacheMeta] = useState<CacheMeta>({
    totalEntries: 0,
    totalSizeMB: 0,
    oldestEntry: null,
    newestEntry: null,
  });

  // Update cache metadata
  const updateCacheMeta = useCallback(() => {
    const cache = loadCacheFromStorage();
    const entries = Object.values(cache.entries);
    
    if (entries.length === 0) {
      setCacheMeta({
        totalEntries: 0,
        totalSizeMB: 0,
        oldestEntry: null,
        newestEntry: null,
      });
      return;
    }

    const timestamps = entries.map(e => e.timestamp);
    const sizeMB = getStorageSize(cache);

    setCacheMeta({
      totalEntries: entries.length,
      totalSizeMB: parseFloat(sizeMB.toFixed(2)),
      oldestEntry: new Date(Math.min(...timestamps)),
      newestEntry: new Date(Math.max(...timestamps)),
    });
  }, []);

  // Initialize meta on mount
  useEffect(() => {
    updateCacheMeta();
  }, [updateCacheMeta]);

  // Get cached data for a period
  const getCachedData = useCallback((dateFrom: Date, dateTo: Date): RawSaleRow[] | null => {
    const cache = loadCacheFromStorage();
    const key = generateCacheKey(dateFrom, dateTo);
    const entry = cache.entries[key];
    
    if (!entry) return null;
    
    // Check if expired
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    
    if (now - entry.timestamp > maxAge) {
      console.log(`[Cache] Entry expired for ${key}`);
      return null;
    }
    
    console.log(`[Cache] Hit for ${key} - ${entry.data.length} records`);
    return entry.data;
  }, []);

  // Save data to cache
  const setCachedData = useCallback((dateFrom: Date, dateTo: Date, data: RawSaleRow[]): void => {
    const cache = loadCacheFromStorage();
    const key = generateCacheKey(dateFrom, dateTo);
    
    // Enforce max entries limit
    const entries = Object.entries(cache.entries);
    if (entries.length >= MAX_CACHE_ENTRIES && !cache.entries[key]) {
      // Remove oldest entry
      const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        delete cache.entries[oldest[0]];
        console.log(`[Cache] Removed oldest entry: ${oldest[0]}`);
      }
    }
    
    cache.entries[key] = {
      data,
      timestamp: Date.now(),
      period: { 
        from: dateFrom.toISOString().split('T')[0], 
        to: dateTo.toISOString().split('T')[0] 
      },
    };
    
    saveCacheToStorage(cache);
    updateCacheMeta();
    console.log(`[Cache] Saved ${data.length} records for ${key}`);
  }, [updateCacheMeta]);

  // Clear all cache
  const clearAllCache = useCallback(() => {
    clearCache();
    updateCacheMeta();
    console.log('[Cache] All cache cleared');
  }, [updateCacheMeta]);

  // Get cache info for a specific period
  const getCacheInfo = useCallback((dateFrom: Date, dateTo: Date): { isCached: boolean; cachedAt: Date | null; recordCount: number } => {
    const cache = loadCacheFromStorage();
    const key = generateCacheKey(dateFrom, dateTo);
    const entry = cache.entries[key];
    
    if (!entry) {
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
    
    // Check if expired
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    
    if (now - entry.timestamp > maxAge) {
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
    
    return {
      isCached: true,
      cachedAt: new Date(entry.timestamp),
      recordCount: entry.data.length,
    };
  }, []);

  return {
    getCachedData,
    setCachedData,
    clearAllCache,
    getCacheInfo,
    cacheMeta,
    updateCacheMeta,
    maxCacheEntries: MAX_CACHE_ENTRIES,
    maxCacheAgeHours: MAX_CACHE_AGE_HOURS,
    maxCacheSizeMB: MAX_CACHE_SIZE_MB,
  };
}
