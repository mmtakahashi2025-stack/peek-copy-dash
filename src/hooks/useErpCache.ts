import { useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';

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
  const [cacheMeta, setCacheMeta] = useState<CacheMeta>({
    totalEntries: 0,
    totalSizeMB: 0,
    oldestEntry: null,
    newestEntry: null,
    monthsCached: [],
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load cache metadata from Supabase
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
      const { data, error } = await supabase
        .from('erp_cache')
        .select('year, month, record_count, created_at, updated_at')
        .eq('user_id', user.id)
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

  // Load a single month from Supabase cache
  const loadMonthFromCache = useCallback(async (year: number, month: number): Promise<MonthlyCacheEntry | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('erp_cache')
        .select('data, record_count, updated_at')
        .eq('user_id', user.id)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();

      if (error) {
        console.error(`[Cache] Error loading month ${year}-${month}:`, error);
        return null;
      }

      if (!data) return null;

      const timestamp = new Date(data.updated_at).getTime();
      const now = Date.now();
      const maxAge = MAX_CACHE_AGE_HOURS * 60 * 60 * 1000;

      // Check if expired (only for months within refresh range)
      if (isMonthWithinRefreshRange(year, month) && now - timestamp > maxAge) {
        console.log(`[Cache] Month ${year}-${month} expired (within refresh range)`);
        return null;
      }

      // Cast data properly - it's stored as JSONB
      const rawData = data.data as unknown;
      if (!Array.isArray(rawData)) {
        console.error(`[Cache] Invalid data format for month ${year}-${month}`);
        return null;
      }

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
  }, [user]);

  // Save a single month to Supabase cache using upsert to avoid duplicate key errors
  const saveMonthToCache = useCallback(async (year: number, month: number, data: RawSaleRow[]): Promise<void> => {
    if (!user) return;

    try {
      // Use upsert to handle both insert and update in a single operation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase
        .from('erp_cache') as any)
        .upsert({
          user_id: user.id,
          year,
          month,
          data: data,
          record_count: data.length,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,year,month',
        });

      if (error) {
        console.error(`[Cache] Error saving month ${year}-${month}:`, error);
        return;
      }

      console.log(`[Cache] Saved month ${year}-${month}: ${data.length} records to Supabase`);
    } catch (error) {
      console.error(`[Cache] Error saving month ${year}-${month}:`, error);
    }
  }, [user]);

  // Check if a specific month is cached and valid
  const isMonthCached = useCallback(async (year: number, month: number): Promise<boolean> => {
    const entry = await loadMonthFromCache(year, month);
    return entry !== null;
  }, [loadMonthFromCache]);

  // Check if a month needs refresh (is within last 3 months and expired or not cached)
  const monthNeedsRefresh = useCallback(async (year: number, month: number): Promise<boolean> => {
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
  }, [isMonthCached, loadMonthFromCache]);

  // Get cached data for a specific month
  const getMonthData = useCallback(async (year: number, month: number): Promise<RawSaleRow[] | null> => {
    const entry = await loadMonthFromCache(year, month);
    return entry?.data || null;
  }, [loadMonthFromCache]);

  // Save data for a specific month
  const setMonthData = useCallback(async (year: number, month: number, data: RawSaleRow[]): Promise<void> => {
    await saveMonthToCache(year, month, data);
    await updateCacheMeta();
  }, [saveMonthToCache, updateCacheMeta]);

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

  // Set cached data (splits into monthly caches)
  const setCachedData = useCallback(async (dateFrom: Date, dateTo: Date, data: RawSaleRow[]): Promise<void> => {
    if (!user) return;
    
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
      
      // Save each month (in parallel for speed)
      const savePromises = Array.from(monthlyData).map(([key, monthData]) => {
        const [yearStr, monthStr] = key.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        return setMonthData(year, month, monthData);
      });
      
      await Promise.all(savePromises);
      
      // Update consolidated cache metadata
      if (user) {
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
            onConflict: 'user_id',
          });
      }
      
      console.log(`[Cache] Saved ${data.length} records across ${monthlyData.size} months to Supabase`);
    } finally {
      setIsLoading(false);
    }
  }, [user, setMonthData]);

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

  // Clear all cache for current user
  const clearAllCache = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      const { error: cacheError } = await supabase
        .from('erp_cache')
        .delete()
        .eq('user_id', user.id);
        
      if (cacheError) {
        console.error('[Cache] Error clearing cache:', cacheError);
      }
      
      const { error: consolidatedError } = await supabase
        .from('erp_consolidated_cache')
        .delete()
        .eq('user_id', user.id);
        
      if (consolidatedError) {
        console.error('[Cache] Error clearing consolidated cache:', consolidatedError);
      }
      
      await updateCacheMeta();
      console.log('[Cache] All Supabase cache cleared');
    } finally {
      setIsLoading(false);
    }
  }, [user, updateCacheMeta]);

  // Get cache info for display
  const getCacheInfo = useCallback(async (dateFrom: Date, dateTo: Date): Promise<{ isCached: boolean; cachedAt: Date | null; recordCount: number }> => {
    if (!user) {
      return { isCached: false, cachedAt: null, recordCount: 0 };
    }
    
    try {
      const { data, error } = await supabase
        .from('erp_consolidated_cache')
        .select('updated_at, total_records')
        .eq('user_id', user.id)
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
    setMonthData,
    isMonthCached,
    monthNeedsRefresh,
    getMonthsToRefresh,
    getCachedMonths,
    isMonthWithinRefreshRange,
    // Constants
    maxCacheAgeHours: MAX_CACHE_AGE_HOURS,
    maxCacheSizeMB: Infinity, // No limit with Supabase
    monthsToRefresh: MONTHS_TO_REFRESH,
  };
}

// Export utility for external use
export { isMonthWithinRefreshRange };
