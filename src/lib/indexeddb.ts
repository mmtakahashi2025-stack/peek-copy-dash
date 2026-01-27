/**
 * IndexedDB utility for browser-side caching
 * Provides instant data access (0ms latency) for repeat visits
 */

const DB_NAME = 'combo-iguassu-cache';
const DB_VERSION = 1;
const STORE_ERP_MONTHLY = 'erp-monthly';
const STORE_META = 'cache-meta';

export interface LocalCacheEntry {
  key: string;           // "2026-01" format
  data: unknown[];       // Raw sale rows
  timestamp: number;     // When saved to local cache
  checksum: string;      // Hash for detecting changes
  recordCount: number;   // Number of records
}

export interface LocalCacheMeta {
  lastSync: number;
  totalRecords: number;
  monthsCached: string[];
}

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Calculate a simple checksum for data to detect changes
 * Uses record count + sum of values for fast comparison
 */
export function calculateChecksum(data: unknown[]): string {
  const count = data.length;
  const totalRevenue = data.reduce<number>((sum, row) => {
    const r = row as Record<string, unknown>;
    return sum + (typeof r['Líquido'] === 'number' ? r['Líquido'] : 0);
  }, 0);
  return `${count}-${totalRevenue.toFixed(2)}`;
}

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  // Return existing promise if already opening
  if (dbPromise) return dbPromise;
  
  // Return existing instance if already open
  if (dbInstance) return Promise.resolve(dbInstance);
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[IndexedDB] Error opening database:', request.error);
      dbPromise = null;
      reject(request.error);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      
      // Handle database being closed unexpectedly
      dbInstance.onclose = () => {
        console.log('[IndexedDB] Database connection closed');
        dbInstance = null;
        dbPromise = null;
      };
      
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create store for monthly ERP data
      if (!db.objectStoreNames.contains(STORE_ERP_MONTHLY)) {
        const store = db.createObjectStore(STORE_ERP_MONTHLY, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] Created erp-monthly store');
      }
      
      // Create store for metadata
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
        console.log('[IndexedDB] Created cache-meta store');
      }
    };
  });
  
  return dbPromise;
}

/**
 * Get data for a specific month from local cache
 */
export async function getLocalMonthData(year: number, month: number): Promise<LocalCacheEntry | null> {
  try {
    const db = await openDB();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ERP_MONTHLY, 'readonly');
      const store = transaction.objectStore(STORE_ERP_MONTHLY);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result as LocalCacheEntry | undefined;
        if (result) {
          console.log(`[IndexedDB] Found local cache for ${key}: ${result.recordCount} records`);
        }
        resolve(result || null);
      };
      
      request.onerror = () => {
        console.error(`[IndexedDB] Error getting ${key}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] getLocalMonthData error:', error);
    return null;
  }
}

/**
 * Save data for a specific month to local cache
 */
export async function setLocalMonthData(year: number, month: number, data: unknown[]): Promise<boolean> {
  try {
    const db = await openDB();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    const entry: LocalCacheEntry = {
      key,
      data,
      timestamp: Date.now(),
      checksum: calculateChecksum(data),
      recordCount: data.length,
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ERP_MONTHLY, 'readwrite');
      const store = transaction.objectStore(STORE_ERP_MONTHLY);
      const request = store.put(entry);
      
      request.onsuccess = () => {
        console.log(`[IndexedDB] Saved local cache for ${key}: ${data.length} records`);
        resolve(true);
      };
      
      request.onerror = () => {
        console.error(`[IndexedDB] Error saving ${key}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] setLocalMonthData error:', error);
    return false;
  }
}

/**
 * Get all cached months from local storage
 */
export async function getAllLocalMonths(): Promise<LocalCacheEntry[]> {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ERP_MONTHLY, 'readonly');
      const store = transaction.objectStore(STORE_ERP_MONTHLY);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const results = request.result as LocalCacheEntry[];
        console.log(`[IndexedDB] Found ${results.length} months in local cache`);
        resolve(results);
      };
      
      request.onerror = () => {
        console.error('[IndexedDB] Error getting all months:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] getAllLocalMonths error:', error);
    return [];
  }
}

/**
 * Get multiple months from local cache in a single transaction
 */
export async function getMultipleLocalMonths(
  months: { year: number; month: number }[]
): Promise<Map<string, LocalCacheEntry>> {
  try {
    const db = await openDB();
    const result = new Map<string, LocalCacheEntry>();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ERP_MONTHLY, 'readonly');
      const store = transaction.objectStore(STORE_ERP_MONTHLY);
      
      let completed = 0;
      
      for (const { year, month } of months) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const request = store.get(key);
        
        request.onsuccess = () => {
          const entry = request.result as LocalCacheEntry | undefined;
          if (entry) {
            result.set(key, entry);
          }
          completed++;
          if (completed === months.length) {
            console.log(`[IndexedDB] Batch loaded ${result.size}/${months.length} months from local cache`);
            resolve(result);
          }
        };
        
        request.onerror = () => {
          completed++;
          if (completed === months.length) {
            resolve(result);
          }
        };
      }
      
      // Handle empty months array
      if (months.length === 0) {
        resolve(result);
      }
      
      transaction.onerror = () => {
        console.error('[IndexedDB] Transaction error:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] getMultipleLocalMonths error:', error);
    return new Map();
  }
}

/**
 * Delete a specific month from local cache
 */
export async function deleteLocalMonthData(year: number, month: number): Promise<boolean> {
  try {
    const db = await openDB();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ERP_MONTHLY, 'readwrite');
      const store = transaction.objectStore(STORE_ERP_MONTHLY);
      const request = store.delete(key);
      
      request.onsuccess = () => {
        console.log(`[IndexedDB] Deleted local cache for ${key}`);
        resolve(true);
      };
      
      request.onerror = () => {
        console.error(`[IndexedDB] Error deleting ${key}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] deleteLocalMonthData error:', error);
    return false;
  }
}

/**
 * Clear all local cache
 */
export async function clearAllLocalCache(): Promise<boolean> {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ERP_MONTHLY, STORE_META], 'readwrite');
      
      const erpStore = transaction.objectStore(STORE_ERP_MONTHLY);
      erpStore.clear();
      
      const metaStore = transaction.objectStore(STORE_META);
      metaStore.clear();
      
      transaction.oncomplete = () => {
        console.log('[IndexedDB] All local cache cleared');
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.error('[IndexedDB] Error clearing cache:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] clearAllLocalCache error:', error);
    return false;
  }
}

/**
 * Get local cache statistics
 */
export async function getLocalCacheStats(): Promise<{
  totalRecords: number;
  totalMonths: number;
  totalSizeEstimateMB: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  monthKeys: string[];
}> {
  try {
    const months = await getAllLocalMonths();
    
    if (months.length === 0) {
      return {
        totalRecords: 0,
        totalMonths: 0,
        totalSizeEstimateMB: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
        monthKeys: [],
      };
    }
    
    const totalRecords = months.reduce((sum, m) => sum + m.recordCount, 0);
    const timestamps = months.map(m => m.timestamp);
    const monthKeys = months.map(m => m.key).sort();
    
    // Estimate ~500 bytes per record
    const totalSizeEstimateMB = (totalRecords * 500) / (1024 * 1024);
    
    return {
      totalRecords,
      totalMonths: months.length,
      totalSizeEstimateMB: parseFloat(totalSizeEstimateMB.toFixed(2)),
      oldestTimestamp: Math.min(...timestamps),
      newestTimestamp: Math.max(...timestamps),
      monthKeys,
    };
  } catch (error) {
    console.error('[IndexedDB] getLocalCacheStats error:', error);
    return {
      totalRecords: 0,
      totalMonths: 0,
      totalSizeEstimateMB: 0,
      oldestTimestamp: null,
      newestTimestamp: null,
      monthKeys: [],
    };
  }
}

/**
 * Check if IndexedDB is available in this browser
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
