import { useCallback, useState, useEffect } from 'react';
import {
  getLocalMonthData,
  setLocalMonthData,
  getMultipleLocalMonths,
  clearAllLocalCache,
  getLocalCacheStats,
  calculateChecksum,
  isIndexedDBAvailable,
  LocalCacheEntry,
} from '@/lib/indexeddb';
import { RawSaleRow } from '@/contexts/SheetDataContext';

export interface LocalCacheStats {
  totalRecords: number;
  totalMonths: number;
  totalSizeEstimateMB: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  monthKeys: string[];
  isAvailable: boolean;
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'synced' | 'offline';
  lastSync: Date | null;
  pendingUpdates: number;
}

/**
 * Hook for managing browser-side IndexedDB cache
 * Provides instant data access with background sync capabilities
 */
export function useLocalCache() {
  const [localStats, setLocalStats] = useState<LocalCacheStats>({
    totalRecords: 0,
    totalMonths: 0,
    totalSizeEstimateMB: 0,
    oldestTimestamp: null,
    newestTimestamp: null,
    monthKeys: [],
    isAvailable: false,
  });
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'idle',
    lastSync: null,
    pendingUpdates: 0,
  });

  // Check IndexedDB availability and load initial stats
  useEffect(() => {
    const init = async () => {
      const available = isIndexedDBAvailable();
      if (!available) {
        console.warn('[LocalCache] IndexedDB not available in this browser');
        setLocalStats(prev => ({ ...prev, isAvailable: false }));
        return;
      }
      
      const stats = await getLocalCacheStats();
      setLocalStats({
        ...stats,
        isAvailable: true,
      });
      
      console.log(`[LocalCache] Initialized with ${stats.totalMonths} months, ${stats.totalRecords} records`);
    };
    
    init();
  }, []);

  /**
   * Get data for a single month from local cache
   * Returns null if not found (will need to fetch from Supabase)
   */
  const getLocalMonth = useCallback(async (
    year: number,
    month: number
  ): Promise<{ data: RawSaleRow[]; checksum: string; timestamp: number } | null> => {
    if (!isIndexedDBAvailable()) return null;
    
    try {
      const entry = await getLocalMonthData(year, month);
      if (!entry) return null;
      
      return {
        data: entry.data as RawSaleRow[],
        checksum: entry.checksum,
        timestamp: entry.timestamp,
      };
    } catch (error) {
      console.error(`[LocalCache] Error getting month ${year}-${month}:`, error);
      return null;
    }
  }, []);

  /**
   * Save data for a single month to local cache
   */
  const setLocalMonth = useCallback(async (
    year: number,
    month: number,
    data: RawSaleRow[]
  ): Promise<boolean> => {
    if (!isIndexedDBAvailable()) return false;
    
    try {
      const success = await setLocalMonthData(year, month, data);
      
      if (success) {
        // Update local stats
        const stats = await getLocalCacheStats();
        setLocalStats(prev => ({
          ...prev,
          ...stats,
        }));
      }
      
      return success;
    } catch (error) {
      console.error(`[LocalCache] Error saving month ${year}-${month}:`, error);
      return false;
    }
  }, []);

  /**
   * Get multiple months from local cache in a single operation
   * Returns a Map of key -> data for found months
   */
  const getLocalMonths = useCallback(async (
    months: { year: number; month: number }[]
  ): Promise<Map<string, { data: RawSaleRow[]; checksum: string; timestamp: number }>> => {
    if (!isIndexedDBAvailable()) return new Map();
    
    try {
      const entries = await getMultipleLocalMonths(months);
      const result = new Map<string, { data: RawSaleRow[]; checksum: string; timestamp: number }>();
      
      for (const [key, entry] of entries) {
        result.set(key, {
          data: entry.data as RawSaleRow[],
          checksum: entry.checksum,
          timestamp: entry.timestamp,
        });
      }
      
      return result;
    } catch (error) {
      console.error('[LocalCache] Error getting multiple months:', error);
      return new Map();
    }
  }, []);

  /**
   * Clear all local cache data
   */
  const clearLocal = useCallback(async (): Promise<boolean> => {
    if (!isIndexedDBAvailable()) return false;
    
    try {
      const success = await clearAllLocalCache();
      
      if (success) {
        setLocalStats({
          totalRecords: 0,
          totalMonths: 0,
          totalSizeEstimateMB: 0,
          oldestTimestamp: null,
          newestTimestamp: null,
          monthKeys: [],
          isAvailable: true,
        });
      }
      
      return success;
    } catch (error) {
      console.error('[LocalCache] Error clearing cache:', error);
      return false;
    }
  }, []);

  /**
   * Refresh local cache statistics
   */
  const refreshStats = useCallback(async () => {
    if (!isIndexedDBAvailable()) return;
    
    const stats = await getLocalCacheStats();
    setLocalStats(prev => ({
      ...prev,
      ...stats,
    }));
  }, []);

  /**
   * Check if local data needs sync with Supabase
   * Compares checksums to detect changes without downloading full data
   */
  const needsSync = useCallback((
    localChecksum: string,
    remoteRecordCount: number,
    remoteTotalRevenue?: number
  ): boolean => {
    // Parse local checksum
    const [localCount, localRevenue] = localChecksum.split('-').map(Number);
    
    // Compare record count first (fast check)
    if (localCount !== remoteRecordCount) {
      return true;
    }
    
    // If we have revenue info, compare that too
    if (remoteTotalRevenue !== undefined) {
      // Allow small floating point differences
      const revenueDiff = Math.abs(localRevenue - remoteTotalRevenue);
      if (revenueDiff > 0.01) {
        return true;
      }
    }
    
    return false;
  }, []);

  /**
   * Update sync status
   */
  const setSyncing = useCallback((syncing: boolean) => {
    setSyncStatus(prev => ({
      ...prev,
      status: syncing ? 'syncing' : 'synced',
      lastSync: syncing ? prev.lastSync : new Date(),
    }));
  }, []);

  /**
   * Mark as offline
   */
  const setOffline = useCallback(() => {
    setSyncStatus(prev => ({
      ...prev,
      status: 'offline',
    }));
  }, []);

  return {
    // Data operations
    getLocalMonth,
    setLocalMonth,
    getLocalMonths,
    clearLocal,
    
    // Stats and status
    localStats,
    syncStatus,
    refreshStats,
    
    // Sync helpers
    needsSync,
    setSyncing,
    setOffline,
    calculateChecksum,
    
    // Availability
    isAvailable: localStats.isAvailable,
  };
}
