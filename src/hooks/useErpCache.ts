import { useCallback, useState, useEffect } from 'react';
import { RawSaleRow } from '@/contexts/SheetDataContext';

// Cache configuration
const MONTHLY_CACHE_PREFIX = 'erp_month_';
const CONSOLIDATED_CACHE_KEY = 'erp_consolidated_cache';
const CACHE_META_KEY = 'erp_cache_meta_v2';
const MAX_CACHE_AGE_HOURS = 24;
const MAX_CACHE_SIZE_MB = 50;
const MONTHS_TO_REFRESH = 3; // Only refresh last 3 months

interface MonthlyCacheEntry {
  data: RawSaleRow[];
  timestamp: number;
  year: number;
  month: number;
  recordCount: number;
}

interface ConsolidatedCache {
  timestamp: number;
  period: { from: string; to: string };
  monthKeys: string[];
  totalRecords: number;
}

interface CacheMeta {
  totalEntries: number;
  totalSizeMB: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  monthsCached: string[];
}

// Generate key for a specific month
function getMonthKey(year: number, month: number): string {
  return `${MONTHLY_CACHE_PREFIX}${year}_${String(month).padStart(2, '0')}`;
}

// Parse month key to get year and month
function parseMonthKey(key: string): { year: number; month: number } | null {
  const match = key.match(/erp_month_(\d{4})_(\d{2})/);
  if (!match) return null;
  return { year: parseInt(match[1]), month: parseInt(match[2]) };
}

// Check if a month is within the last N months to refresh
function isMonthWithinRefreshRange(year: number, month: number, monthsToRefresh: number = MONTHS_TO_REFRESH): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  
  // Calculate how many months ago this month is
  const monthsAgo = (currentYear - year) * 12 + (currentMonth - month);
  
  return monthsAgo >= 0 && monthsAgo < monthsToRefresh;
}

// Get storage size estimate
function getStorageSize(obj: unknown): number {
  const str = JSON.stringify(obj);
  return new Blob([str]).size / (1024 * 1024);
}

// Get all monthly cache keys from localStorage
function getAllMonthlyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(MONTHLY_CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  return keys.sort();
}

// Load a single month from cache
function loadMonthFromCache(year: number, month: number): MonthlyCacheEntry | null {
  try {
    const key = getMonthKey(year, month);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const entry = JSON.parse(stored) as MonthlyCacheEntry;
    
    // Check if expired (only for months within refresh range)
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    
    if (isMonthWithinRefreshRange(year, month) && now - entry.timestamp > maxAge) {
      console.log(`[Cache] Month ${year}-${month} expired (within refresh range)`);
      return null;
    }
    
    return entry;
  } catch (error) {
    console.error(`[Cache] Error loading month ${year}-${month}:`, error);
    return null;
  }
}

// Save a single month to cache
function saveMonthToCache(year: number, month: number, data: RawSaleRow[]): void {
  try {
    const key = getMonthKey(year, month);
    const entry: MonthlyCacheEntry = {
      data,
      timestamp: Date.now(),
      year,
      month,
      recordCount: data.length,
    };
    
    localStorage.setItem(key, JSON.stringify(entry));
    console.log(`[Cache] Saved month ${year}-${month}: ${data.length} records`);
  } catch (error) {
    console.error(`[Cache] Error saving month ${year}-${month}:`, error);
    
    // If quota exceeded, try to clear oldest months
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      pruneOldestMonths(3);
      try {
        const key = getMonthKey(year, month);
        const entry: MonthlyCacheEntry = {
          data,
          timestamp: Date.now(),
          year,
          month,
          recordCount: data.length,
        };
        localStorage.setItem(key, JSON.stringify(entry));
      } catch {
        console.error('[Cache] Still failed after pruning');
      }
    }
  }
}

// Prune oldest months from cache
function pruneOldestMonths(count: number): void {
  const keys = getAllMonthlyKeys();
  const toRemove = keys.slice(0, count);
  
  for (const key of toRemove) {
    localStorage.removeItem(key);
    console.log(`[Cache] Pruned old month: ${key}`);
  }
}

// Load consolidated cache metadata
function loadConsolidatedCache(): ConsolidatedCache | null {
  try {
    const stored = localStorage.getItem(CONSOLIDATED_CACHE_KEY);
    if (!stored) return null;
    
    const cache = JSON.parse(stored) as ConsolidatedCache;
    
    // Check if expired (24h)
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    
    if (now - cache.timestamp > maxAge) {
      console.log('[Cache] Consolidated cache expired');
      return null;
    }
    
    return cache;
  } catch (error) {
    console.error('[Cache] Error loading consolidated cache:', error);
    return null;
  }
}

// Save consolidated cache metadata
function saveConsolidatedCache(period: { from: string; to: string }, monthKeys: string[], totalRecords: number): void {
  try {
    const cache: ConsolidatedCache = {
      timestamp: Date.now(),
      period,
      monthKeys,
      totalRecords,
    };
    localStorage.setItem(CONSOLIDATED_CACHE_KEY, JSON.stringify(cache));
    console.log(`[Cache] Saved consolidated cache: ${totalRecords} records from ${monthKeys.length} months`);
  } catch (error) {
    console.error('[Cache] Error saving consolidated cache:', error);
  }
}

// Calculate total cache size
function calculateTotalCacheSize(): number {
  let totalSize = 0;
  const keys = getAllMonthlyKeys();
  
  for (const key of keys) {
    const item = localStorage.getItem(key);
    if (item) {
      totalSize += getStorageSize(JSON.parse(item));
    }
  }
  
  return totalSize;
}

// Prune cache if over size limit
function pruneCacheIfNeeded(): void {
  let size = calculateTotalCacheSize();
  
  while (size > MAX_CACHE_SIZE_MB) {
    const keys = getAllMonthlyKeys();
    if (keys.length === 0) break;
    
    localStorage.removeItem(keys[0]);
    console.log(`[Cache] Pruned ${keys[0]} to reduce size`);
    size = calculateTotalCacheSize();
  }
}

export function useErpCache() {
  const [cacheMeta, setCacheMeta] = useState<CacheMeta>({
    totalEntries: 0,
    totalSizeMB: 0,
    oldestEntry: null,
    newestEntry: null,
    monthsCached: [],
  });

  // Update cache metadata
  const updateCacheMeta = useCallback(() => {
    const keys = getAllMonthlyKeys();
    
    if (keys.length === 0) {
      setCacheMeta({
        totalEntries: 0,
        totalSizeMB: 0,
        oldestEntry: null,
        newestEntry: null,
        monthsCached: [],
      });
      return;
    }

    const timestamps: number[] = [];
    const monthsCached: string[] = [];
    
    for (const key of keys) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const entry = JSON.parse(stored) as MonthlyCacheEntry;
          timestamps.push(entry.timestamp);
          monthsCached.push(`${entry.year}-${String(entry.month).padStart(2, '0')}`);
        }
      } catch {
        // Skip invalid entries
      }
    }

    const sizeMB = calculateTotalCacheSize();

    setCacheMeta({
      totalEntries: keys.length,
      totalSizeMB: parseFloat(sizeMB.toFixed(2)),
      oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
      newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
      monthsCached: monthsCached.sort(),
    });
  }, []);

  // Initialize meta on mount
  useEffect(() => {
    updateCacheMeta();
  }, [updateCacheMeta]);

  // Check if a specific month is cached and valid
  const isMonthCached = useCallback((year: number, month: number): boolean => {
    const entry = loadMonthFromCache(year, month);
    return entry !== null;
  }, []);

  // Check if a month needs refresh (is within last 3 months and expired or not cached)
  const monthNeedsRefresh = useCallback((year: number, month: number): boolean => {
    // If not within refresh range, never needs refresh (use cache forever)
    if (!isMonthWithinRefreshRange(year, month)) {
      return !isMonthCached(year, month); // Only refresh if not cached at all
    }
    
    // Within refresh range - check if cached and not expired
    const entry = loadMonthFromCache(year, month);
    if (!entry) return true;
    
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    return now - entry.timestamp > maxAge;
  }, [isMonthCached]);

  // Get cached data for a specific month
  const getMonthData = useCallback((year: number, month: number): RawSaleRow[] | null => {
    const entry = loadMonthFromCache(year, month);
    return entry?.data || null;
  }, []);

  // Save data for a specific month
  const setMonthData = useCallback((year: number, month: number, data: RawSaleRow[]): void => {
    saveMonthToCache(year, month, data);
    pruneCacheIfNeeded();
    updateCacheMeta();
  }, [updateCacheMeta]);

  // Get all cached data for a date range (combines monthly caches)
  const getCachedData = useCallback((dateFrom: Date, dateTo: Date): RawSaleRow[] | null => {
    const startYear = dateFrom.getFullYear();
    const startMonth = dateFrom.getMonth() + 1;
    const endYear = dateTo.getFullYear();
    const endMonth = dateTo.getMonth() + 1;
    
    const allData: RawSaleRow[] = [];
    let allMonthsCached = true;
    
    // Iterate through all months in range
    let year = startYear;
    let month = startMonth;
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const monthData = getMonthData(year, month);
      
      if (!monthData) {
        // If this month is not within refresh range, we can't proceed without it
        if (!isMonthWithinRefreshRange(year, month)) {
          console.log(`[Cache] Missing old month ${year}-${month}, cannot use cache`);
          allMonthsCached = false;
          break;
        }
        // If within refresh range, we'll need to fetch it
        console.log(`[Cache] Missing recent month ${year}-${month}`);
        allMonthsCached = false;
      } else {
        allData.push(...monthData);
      }
      
      // Move to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    
    // Filter data to exact date range
    if (allMonthsCached && allData.length > 0) {
      const filtered = allData.filter(row => {
        const dataVenda = row['Data Venda'];
        if (!dataVenda) return true;
        
        let rowDate: Date | null = null;
        if (typeof dataVenda === 'string') {
          rowDate = new Date(dataVenda);
        }
        
        if (!rowDate || isNaN(rowDate.getTime())) return true;
        
        return rowDate >= dateFrom && rowDate <= dateTo;
      });
      
      console.log(`[Cache] Combined ${allData.length} records from monthly caches, filtered to ${filtered.length}`);
      return filtered;
    }
    
    return null;
  }, [getMonthData]);

  // Set cached data (splits into monthly caches)
  const setCachedData = useCallback((dateFrom: Date, dateTo: Date, data: RawSaleRow[]): void => {
    // Group data by month
    const monthlyData = new Map<string, RawSaleRow[]>();
    
    for (const row of data) {
      const dataVenda = row['Data Venda'];
      if (!dataVenda) continue;
      
      let rowDate: Date | null = null;
      if (typeof dataVenda === 'string') {
        rowDate = new Date(dataVenda);
      }
      
      if (!rowDate || isNaN(rowDate.getTime())) continue;
      
      const year = rowDate.getFullYear();
      const month = rowDate.getMonth() + 1;
      const key = `${year}-${month}`;
      
      if (!monthlyData.has(key)) {
        monthlyData.set(key, []);
      }
      monthlyData.get(key)!.push(row);
    }
    
    // Save each month
    for (const [key, monthData] of monthlyData) {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      setMonthData(year, month, monthData);
    }
    
    // Save consolidated cache metadata
    const periodStr = {
      from: dateFrom.toISOString().split('T')[0],
      to: dateTo.toISOString().split('T')[0],
    };
    saveConsolidatedCache(periodStr, Array.from(monthlyData.keys()), data.length);
    
    console.log(`[Cache] Saved ${data.length} records across ${monthlyData.size} months`);
  }, [setMonthData]);

  // Get months that need to be refreshed for a date range
  const getMonthsToRefresh = useCallback((dateFrom: Date, dateTo: Date): { year: number; month: number; label: string }[] => {
    const startYear = dateFrom.getFullYear();
    const startMonth = dateFrom.getMonth() + 1;
    const endYear = dateTo.getFullYear();
    const endMonth = dateTo.getMonth() + 1;
    
    const monthsToRefresh: { year: number; month: number; label: string }[] = [];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    let year = startYear;
    let month = startMonth;
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      if (monthNeedsRefresh(year, month)) {
        monthsToRefresh.push({
          year,
          month,
          label: `${monthNames[month - 1]}/${year}`,
        });
      }
      
      // Move to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    
    return monthsToRefresh;
  }, [monthNeedsRefresh]);

  // Get cached months for a date range (months that don't need refresh)
  const getCachedMonths = useCallback((dateFrom: Date, dateTo: Date): { year: number; month: number; data: RawSaleRow[] }[] => {
    const startYear = dateFrom.getFullYear();
    const startMonth = dateFrom.getMonth() + 1;
    const endYear = dateTo.getFullYear();
    const endMonth = dateTo.getMonth() + 1;
    
    const cachedMonths: { year: number; month: number; data: RawSaleRow[] }[] = [];
    
    let year = startYear;
    let month = startMonth;
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      if (!monthNeedsRefresh(year, month)) {
        const data = getMonthData(year, month);
        if (data) {
          cachedMonths.push({ year, month, data });
        }
      }
      
      // Move to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    
    return cachedMonths;
  }, [monthNeedsRefresh, getMonthData]);

  // Clear all cache
  const clearAllCache = useCallback(() => {
    const keys = getAllMonthlyKeys();
    for (const key of keys) {
      localStorage.removeItem(key);
    }
    localStorage.removeItem(CONSOLIDATED_CACHE_KEY);
    localStorage.removeItem(CACHE_META_KEY);
    updateCacheMeta();
    console.log('[Cache] All cache cleared');
  }, [updateCacheMeta]);

  // Get cache info for display
  const getCacheInfo = useCallback((dateFrom: Date, dateTo: Date): { isCached: boolean; cachedAt: Date | null; recordCount: number } => {
    const consolidated = loadConsolidatedCache();
    
    if (!consolidated) {
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
    
    return {
      isCached: true,
      cachedAt: new Date(consolidated.timestamp),
      recordCount: consolidated.totalRecords,
    };
  }, []);

  return {
    getCachedData,
    setCachedData,
    clearAllCache,
    getCacheInfo,
    cacheMeta,
    updateCacheMeta,
    // New methods for smart caching
    getMonthData,
    setMonthData,
    isMonthCached,
    monthNeedsRefresh,
    getMonthsToRefresh,
    getCachedMonths,
    isMonthWithinRefreshRange,
    // Constants
    maxCacheAgeHours: MAX_CACHE_AGE_HOURS,
    maxCacheSizeMB: MAX_CACHE_SIZE_MB,
    monthsToRefresh: MONTHS_TO_REFRESH,
  };
}

// Export utility for external use
export { isMonthWithinRefreshRange };
