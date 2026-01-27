import { useCallback, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useChartAggregates } from '@/hooks/useChartAggregates';
import {
  getLocalMonthData,
  setLocalMonthData,
  getMultipleLocalMonths,
  clearAllLocalCache as clearLocalIndexedDB,
  getLocalCacheStats,
  isIndexedDBAvailable,
  calculateChecksum,
} from '@/lib/indexeddb';

// Cache configuration
const MAX_CACHE_AGE_HOURS = 24;
const MONTHS_TO_REFRESH = 3; // Only refresh last 3 months

interface MonthlyCacheEntry {
  data: RawSaleRow[];
  timestamp: number;
  year: number;
  month: number;
  recordCount: number;
}

interface CacheMeta {
  totalEntries: number;
  totalSizeMB: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  monthsCached: string[];
}

interface LocalCacheStats {
  totalRecords: number;
  totalMonths: number;
  totalSizeEstimateMB: number;
  isAvailable: boolean;
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

export function useErpCache() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { calculateAndSaveAggregates } = useChartAggregates();
  const [cacheMeta, setCacheMeta] = useState<CacheMeta>({
    totalEntries: 0,
    totalSizeMB: 0,
    oldestEntry: null,
    newestEntry: null,
    monthsCached: [],
  });
  const [localCacheStats, setLocalCacheStats] = useState<LocalCacheStats>({
    totalRecords: 0,
    totalMonths: 0,
    totalSizeEstimateMB: 0,
    isAvailable: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  
  // Track pending background syncs
  const pendingSyncs = useRef<Set<string>>(new Set());

  // Initialize local cache stats
  useEffect(() => {
    const initLocalCache = async () => {
      if (!isIndexedDBAvailable()) {
        console.warn('[Cache] IndexedDB not available - using Supabase only');
        return;
      }
      
      const stats = await getLocalCacheStats();
      setLocalCacheStats({
        totalRecords: stats.totalRecords,
        totalMonths: stats.totalMonths,
        totalSizeEstimateMB: stats.totalSizeEstimateMB,
        isAvailable: true,
      });
      
      console.log(`[Cache] Local IndexedDB ready: ${stats.totalMonths} months, ${stats.totalRecords} records`);
    };
    
    initLocalCache();
  }, []);

  // Load cache metadata from Supabase (global cache - no user_id filter)
  const updateCacheMeta = useCallback(async () => {
    if (!user) {
      setCacheMeta({
        totalEntries: 0,
        totalSizeMB: 0,
        oldestEntry: null,
        newestEntry: null,
        monthsCached: [],
      });
      return;
    }

    try {
      // Otimizado: seleciona apenas campos necessários (sem created_at)
      const { data, error } = await supabase
        .from('erp_cache')
        .select('year, month, record_count, updated_at')
        .order('year', { ascending: true })
        .order('month', { ascending: true });

      if (error) {
        console.error('[Cache] Error loading cache meta:', error);
        return;
      }

      if (!data || data.length === 0) {
        setCacheMeta({
          totalEntries: 0,
          totalSizeMB: 0,
          oldestEntry: null,
          newestEntry: null,
          monthsCached: [],
        });
        return;
      }

      const timestamps = data.map(d => new Date(d.updated_at).getTime());
      const monthsCached = data.map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
      const totalRecords = data.reduce((sum, d) => sum + d.record_count, 0);
      
      // Estimate size: ~500 bytes per record on average
      const estimatedSizeMB = (totalRecords * 500) / (1024 * 1024);

      setCacheMeta({
        totalEntries: data.length,
        totalSizeMB: parseFloat(estimatedSizeMB.toFixed(2)),
        oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
        newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
        monthsCached,
      });
    } catch (error) {
      console.error('[Cache] Error updating cache meta:', error);
    }
  }, [user]);

  // Initialize meta on mount
  useEffect(() => {
    updateCacheMeta();
  }, [updateCacheMeta]);

  // Load a single month from Supabase cache (global cache - no user_id filter)
  // For non-admin users, ignore expiration and return stale data
  const loadMonthFromCache = useCallback(async (year: number, month: number): Promise<MonthlyCacheEntry | null> => {
    // Fallback: fetch user directly if not available via hook (race condition fix)
    let currentUser = user;
    if (!currentUser) {
      const { data } = await supabase.auth.getUser();
      currentUser = data.user;
    }
    
    if (!currentUser) {
      console.log(`[Cache] loadMonthFromCache(${year}-${month}): User not available`);
      return null;
    }

    try {
      // Otimizado: usa limit(1) para hint de índice
      const { data, error } = await supabase
        .from('erp_cache')
        .select('data, record_count, updated_at')
        .eq('year', year)
        .eq('month', month)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(`[Cache] Error loading month ${year}-${month}:`, error);
        return null;
      }

      if (!data) {
        console.log(`[Cache] No cached data for ${year}-${month}`);
        return null;
      }

      const timestamp = new Date(data.updated_at).getTime();
      const now = Date.now();
      const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;

      // Check if expired (only for ADMINS and months within refresh range)
      // Non-admin users always get cached data even if expired (stale read)
      if (isAdmin && isMonthWithinRefreshRange(year, month) && now - timestamp > maxAge) {
        console.log(`[Cache] Month ${year}-${month} expired (within refresh range, admin mode)`);
        return null;
      }

      // Cast data properly - it's stored as JSONB
      const rawData = data.data as unknown;
      if (!Array.isArray(rawData)) {
        console.error(`[Cache] Invalid data format for month ${year}-${month}`);
        return null;
      }

      console.log(`[Cache] Loaded ${year}-${month}: ${data.record_count} records`);
      return {
        data: rawData as RawSaleRow[],
        timestamp,
        year,
        month,
        recordCount: data.record_count,
      };
    } catch (error) {
      console.error(`[Cache] Error loading month ${year}-${month}:`, error);
      return null;
    }
  }, [user, isAdmin]);

  // Save a single month to Supabase cache using upsert (only admins can write)
  const saveMonthToCache = useCallback(async (year: number, month: number, data: RawSaleRow[]): Promise<boolean> => {
    if (!user) return false;
    
    // Only admins can write to cache
    if (!isAdmin) {
      console.log('[Cache] Non-admin user cannot write to cache');
      return false;
    }

    try {
      // Validate data before saving
      if (!Array.isArray(data)) {
        console.error(`[Cache] Invalid data format for month ${year}-${month}: not an array`);
        return false;
      }
      
      // Use upsert to handle both insert and update in a single operation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase
        .from('erp_cache') as any)
        .upsert({
          user_id: user.id, // Records who last updated
          year,
          month,
          data: data,
          record_count: data.length,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'year,month',
        });

      if (error) {
        console.error(`[Cache] Error saving month ${year}-${month}:`, error);
        // Don't throw, just log and return false to indicate failure
        return false;
      }

      console.log(`[Cache] Saved month ${year}-${month}: ${data.length} records to Supabase`);
      return true;
    } catch (error) {
      console.error(`[Cache] Unexpected error saving month ${year}-${month}:`, error);
      return false;
    }
  }, [user, isAdmin]);

  // Check if a specific month is cached and valid
  const isMonthCached = useCallback(async (year: number, month: number): Promise<boolean> => {
    const entry = await loadMonthFromCache(year, month);
    return entry !== null;
  }, [loadMonthFromCache]);

  // Check if a month needs refresh (is within last 3 months and expired or not cached)
  // Non-admin users never need refresh - they always use cached data
  const monthNeedsRefresh = useCallback(async (year: number, month: number): Promise<boolean> => {
    // Non-admin users never need to refresh - they use whatever is cached
    if (!isAdmin) {
      const cached = await isMonthCached(year, month);
      return !cached; // Only return true if not cached at all (to trigger fetch attempt that will use stale data)
    }
    
    // If not within refresh range, never needs refresh (use cache forever)
    if (!isMonthWithinRefreshRange(year, month)) {
      const cached = await isMonthCached(year, month);
      return !cached; // Only refresh if not cached at all
    }
    
    // Within refresh range - check if cached and not expired
    const entry = await loadMonthFromCache(year, month);
    if (!entry) return true;
    
    const now = Date.now();
    const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
    return now - entry.timestamp > maxAge;
  }, [isMonthCached, loadMonthFromCache, isAdmin]);

  // Get cached data for a specific month - LOCAL FIRST, then Supabase
  const getMonthData = useCallback(async (year: number, month: number): Promise<RawSaleRow[] | null> => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    // LAYER 1: Try local IndexedDB first (instant - 0ms)
    if (isIndexedDBAvailable()) {
      try {
        const localEntry = await getLocalMonthData(year, month);
        if (localEntry) {
          console.log(`[Cache] ⚡ INSTANT from IndexedDB: ${key} (${localEntry.recordCount} records)`);
          
          // Background sync: check if Supabase has newer data
          if (!pendingSyncs.current.has(key)) {
            pendingSyncs.current.add(key);
            
            // Non-blocking background check
            (async () => {
              try {
                const { data } = await supabase
                  .from('erp_cache')
                  .select('record_count, updated_at')
                  .eq('year', year)
                  .eq('month', month)
                  .limit(1)
                  .maybeSingle();
                
                if (data) {
                  const supabaseTimestamp = new Date(data.updated_at).getTime();
                  // If Supabase is newer, sync in background
                  if (supabaseTimestamp > localEntry.timestamp) {
                    console.log(`[Cache] 🔄 Background sync needed for ${key}: Supabase is ${Math.round((supabaseTimestamp - localEntry.timestamp) / 60000)}min newer`);
                    // Could trigger a refresh here, but for now just log
                  }
                }
              } finally {
                pendingSyncs.current.delete(key);
              }
            })();
          }
          
          return localEntry.data as RawSaleRow[];
        }
      } catch (err) {
        console.warn(`[Cache] IndexedDB error for ${key}, falling back to Supabase:`, err);
      }
    }
    
    // LAYER 2: Fallback to Supabase (network request)
    const entry = await loadMonthFromCache(year, month);
    if (!entry) {
      console.log(`[Cache] getMonthData(${year}-${month}): No data found (user: ${user ? 'yes' : 'no'})`);
      return null;
    }
    
    // Save to local cache for next time (instant access)
    if (isIndexedDBAvailable()) {
      setLocalMonthData(year, month, entry.data).catch(err => {
        console.warn(`[Cache] Failed to save to IndexedDB:`, err);
      });
    }
    
    return entry.data;
  }, [loadMonthFromCache, user]);

  // Batch load multiple months - LOCAL FIRST, then Supabase
  const getMultipleMonthsData = useCallback(async (
    months: { year: number; month: number }[]
  ): Promise<Map<string, RawSaleRow[]>> => {
    let currentUser = user;
    if (!currentUser) {
      const { data } = await supabase.auth.getUser();
      currentUser = data.user;
    }
    
    if (!currentUser) return new Map();
    
    const result = new Map<string, RawSaleRow[]>();
    const missingMonths: { year: number; month: number }[] = [];
    
    // LAYER 1: Try local IndexedDB first (instant - 0ms)
    if (isIndexedDBAvailable()) {
      try {
        const localEntries = await getMultipleLocalMonths(months);
        
        for (const { year, month } of months) {
          const key = `${year}-${String(month).padStart(2, '0')}`;
          const localEntry = localEntries.get(key);
          
          if (localEntry) {
            result.set(`${year}-${month}`, localEntry.data as RawSaleRow[]);
          } else {
            missingMonths.push({ year, month });
          }
        }
        
        if (result.size > 0) {
          console.log(`[Cache] ⚡ INSTANT from IndexedDB: ${result.size}/${months.length} months`);
        }
        
        // If we have all months locally, return immediately
        if (missingMonths.length === 0) {
          return result;
        }
      } catch (err) {
        console.warn('[Cache] IndexedDB batch error, falling back to Supabase:', err);
        missingMonths.push(...months);
      }
    } else {
      missingMonths.push(...months);
    }
    
    // LAYER 2: Fetch missing months from Supabase
    if (missingMonths.length > 0) {
      try {
        // Build OR conditions for all requested months
        const orConditions = missingMonths.map(m => `and(year.eq.${m.year},month.eq.${m.month})`).join(',');
        
        const { data, error } = await supabase
          .from('erp_cache')
          .select('year, month, data, record_count')
          .or(orConditions);
        
        if (error || !data) {
          console.error('[Cache] Error loading multiple months from Supabase:', error);
          return result;
        }
        
        for (const row of data) {
          const key = `${row.year}-${row.month}`;
          const rawData = row.data as unknown;
          if (Array.isArray(rawData)) {
            result.set(key, rawData as RawSaleRow[]);
            console.log(`[Cache] Batch loaded from Supabase ${key}: ${row.record_count} records`);
            
            // Save to local cache for next time
            if (isIndexedDBAvailable()) {
              setLocalMonthData(row.year, row.month, rawData as RawSaleRow[]).catch(err => {
                console.warn(`[Cache] Failed to save ${key} to IndexedDB:`, err);
              });
            }
          }
        }
        
        console.log(`[Cache] Batch loaded ${result.size}/${months.length} months (${missingMonths.length} from Supabase)`);
      } catch (error) {
        console.error('[Cache] Error in batch load:', error);
      }
    }
    
    return result;
  }, [user]);

  // Save data for a specific month (saves to both local and Supabase)
  const setMonthData = useCallback(async (year: number, month: number, data: RawSaleRow[]): Promise<boolean> => {
    // Save to Supabase first
    const success = await saveMonthToCache(year, month, data);
    if (success) {
      // Also save to local IndexedDB for instant access next time
      if (isIndexedDBAvailable()) {
        setLocalMonthData(year, month, data).catch(err => {
          console.warn(`[Cache] Failed to save ${year}-${month} to IndexedDB:`, err);
        });
        
        // Update local stats
        const stats = await getLocalCacheStats();
        setLocalCacheStats({
          totalRecords: stats.totalRecords,
          totalMonths: stats.totalMonths,
          totalSizeEstimateMB: stats.totalSizeEstimateMB,
          isAvailable: true,
        });
      }
      
      // Also calculate and save aggregates for fast chart loading
      await calculateAndSaveAggregates(year, month, data);
      await updateCacheMeta();
    }
    return success;
  }, [saveMonthToCache, updateCacheMeta, calculateAndSaveAggregates]);

  // Get all cached data for a date range (combines monthly caches)
  const getCachedData = useCallback(async (dateFrom: Date, dateTo: Date): Promise<RawSaleRow[] | null> => {
    if (!user) return null;
    
    setIsLoading(true);
    
    try {
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
        const monthData = await getMonthData(year, month);
        
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
        // Normalize dateTo to end of day (23:59:59.999) to include all sales from that day
        const dateToEndOfDay = new Date(dateTo);
        dateToEndOfDay.setHours(23, 59, 59, 999);
        
        const filtered = allData.filter(row => {
          const dataVenda = row['Data Venda'];
          if (!dataVenda) return true;
          
          let rowDate: Date | null = null;
          if (typeof dataVenda === 'string') {
            rowDate = new Date(dataVenda);
          }
          
          if (!rowDate || isNaN(rowDate.getTime())) return true;
          
          return rowDate >= dateFrom && rowDate <= dateToEndOfDay;
        });
        
        console.log(`[Cache] Combined ${allData.length} records from Supabase cache, filtered to ${filtered.length}`);
        return filtered;
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, getMonthData]);

  // Set cached data (splits into monthly caches) - only admins can write
  const setCachedData = useCallback(async (dateFrom: Date, dateTo: Date, data: RawSaleRow[]): Promise<void> => {
    if (!user) return;
    
    // Only admins can write to cache
    if (!isAdmin) {
      console.log('[Cache] Non-admin user cannot write to cache');
      return;
    }
    
    setIsLoading(true);
    
    try {
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
      
      // Save each month sequentially to avoid race conditions
      // (parallel upserts can cause issues even with unique constraints)
      let successCount = 0;
      let failCount = 0;
      
      for (const [key, monthData] of monthlyData) {
        const [yearStr, monthStr] = key.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const success = await setMonthData(year, month, monthData);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }
      
      if (failCount > 0) {
        console.warn(`[Cache] ${failCount} months failed to save, ${successCount} succeeded`);
      }
      
      // Update consolidated cache metadata
      if (user && isAdmin) {
        const uniqueSales = new Set(data.map(row => row['Venda #'])).size;
        const totalRevenue = data.reduce((sum, row) => sum + (row['Líquido'] || 0), 0);
        
        await supabase
          .from('erp_consolidated_cache')
          .upsert({
            user_id: user.id,
            start_date: dateFrom.toISOString().split('T')[0],
            end_date: dateTo.toISOString().split('T')[0],
            unique_sales: uniqueSales,
            total_revenue: totalRevenue,
            total_records: data.length,
          }, {
            onConflict: 'start_date,end_date',
          });
      }
      
      console.log(`[Cache] Saved ${data.length} records across ${monthlyData.size} months to Supabase`);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdmin, setMonthData]);

  // Get months that need to be refreshed for a date range
  const getMonthsToRefresh = useCallback(async (dateFrom: Date, dateTo: Date): Promise<{ year: number; month: number; label: string }[]> => {
    const startYear = dateFrom.getFullYear();
    const startMonth = dateFrom.getMonth() + 1;
    const endYear = dateTo.getFullYear();
    const endMonth = dateTo.getMonth() + 1;
    
    const monthsToRefresh: { year: number; month: number; label: string }[] = [];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    let year = startYear;
    let month = startMonth;
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const needsRefresh = await monthNeedsRefresh(year, month);
      if (needsRefresh) {
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
  const getCachedMonths = useCallback(async (dateFrom: Date, dateTo: Date): Promise<{ year: number; month: number; data: RawSaleRow[] }[]> => {
    const startYear = dateFrom.getFullYear();
    const startMonth = dateFrom.getMonth() + 1;
    const endYear = dateTo.getFullYear();
    const endMonth = dateTo.getMonth() + 1;
    
    const cachedMonths: { year: number; month: number; data: RawSaleRow[] }[] = [];
    
    let year = startYear;
    let month = startMonth;
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const needsRefresh = await monthNeedsRefresh(year, month);
      if (!needsRefresh) {
        const data = await getMonthData(year, month);
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

  // Clear all cache (only admins can clear Supabase, anyone can clear local)
  const clearAllCache = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      // Always clear local IndexedDB cache
      if (isIndexedDBAvailable()) {
        await clearLocalIndexedDB();
        setLocalCacheStats({
          totalRecords: 0,
          totalMonths: 0,
          totalSizeEstimateMB: 0,
          isAvailable: true,
        });
        console.log('[Cache] Local IndexedDB cache cleared');
      }
      
      // Only admins can clear Supabase cache
      if (isAdmin) {
        const { error: cacheError } = await supabase
          .from('erp_cache')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
          
        if (cacheError) {
          console.error('[Cache] Error clearing Supabase cache:', cacheError);
        }
        
        const { error: consolidatedError } = await supabase
          .from('erp_consolidated_cache')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
          
        if (consolidatedError) {
          console.error('[Cache] Error clearing consolidated cache:', consolidatedError);
        }
        
        await updateCacheMeta();
        console.log('[Cache] All Supabase cache cleared');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdmin, updateCacheMeta]);

  // Get cache info for display (global cache)
  const getCacheInfo = useCallback(async (dateFrom: Date, dateTo: Date): Promise<{ isCached: boolean; cachedAt: Date | null; recordCount: number }> => {
    if (!user) {
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
    
    try {
      const { data, error } = await supabase
        .from('erp_consolidated_cache')
        .select('updated_at, total_records')
        .maybeSingle();
        
      if (error || !data) {
        return { isCached: false, cachedAt: null, recordCount: 0 };
      }
      
      const cachedAt = new Date(data.updated_at);
      const now = Date.now();
      const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;
      
      if (now - cachedAt.getTime() > maxAge) {
        return { isCached: false, cachedAt: null, recordCount: 0 };
      }
      
      return {
        isCached: true,
        cachedAt,
        recordCount: data.total_records,
      };
    } catch (error) {
      console.error('[Cache] Error getting cache info:', error);
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
  }, [user]);

  return {
    getCachedData,
    setCachedData,
    clearAllCache,
    getCacheInfo,
    cacheMeta,
    updateCacheMeta,
    isLoading,
    // New methods for smart caching
    getMonthData,
    getMultipleMonthsData,
    setMonthData,
    isMonthCached,
    monthNeedsRefresh,
    getMonthsToRefresh,
    getCachedMonths,
    isMonthWithinRefreshRange,
    // Local cache stats
    localCacheStats,
    // Admin status
    isAdmin,
    // Constants
    maxCacheAgeHours: MAX_CACHE_AGE_HOURS,
    maxCacheSizeMB: Infinity, // No limit with Supabase
    monthsToRefresh: MONTHS_TO_REFRESH,
  };
}

// Export utility for external use
export { isMonthWithinRefreshRange };
