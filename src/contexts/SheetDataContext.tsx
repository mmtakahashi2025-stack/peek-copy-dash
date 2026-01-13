import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useErpCache } from '@/hooks/useErpCache';

// Types for raw sale data (from ERP or sheet)
export interface RawSaleRow {
  Filial: string;
  Emissor: string;
  'Venda #': number;
  'Data Venda': number | string;
  'Resumo Recebimentos': string;
  Item: string;
  Tipo: string;
  Quantidade: number;
  'Valor Unitário': number;
  Bruto: number;
  'Desc. (rateio)': number;
  Líquido: number;
  Comissão: number;
  Custo: number;
  Lucro: number;
  '% Lucro': number;
}

// Types for KPI targets from database
interface KpiTarget {
  kpi_type: string;
  target_value: number;
}

// Types for processed data
export interface KpiData {
  id: string;
  title: string;
  value: string;
  rawValue?: number;
  meta?: string;
  targetValue?: number;
  previousValue?: string;
  variation: number;
  isPositive: boolean;
  notFound?: boolean;
  source?: 'erp' | 'database';
}

export interface ColaboradorData {
  id: number;
  nome: string;
  iniciais: string;
  vendas: number;
  conversao: string;
  faturamento: string;
  cor: string;
  filial: string;
}

export interface EvolucaoData {
  mes: string;
  vendas: number;
  faturamento: number;
  leads: number;
}

export interface FilialData {
  id: string;
  nome: string;
}

export interface ProdutoData {
  id: number;
  nome: string;
  quantidade: number;
}

export interface DateFilter {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface DiagnosticInfo {
  lastAttempt: Date | null;
  lastSuccess: Date | null;
  lastError: string | null;
  recordsLoaded: number;
  period: { from: string; to: string } | null;
  status: 'idle' | 'loading' | 'success' | 'error';
}

export interface LoginTestResult {
  success: boolean;
  loginSuccess?: boolean;
  cookiesComplete?: boolean;
  user?: {
    name: string;
    email: string;
    id: number;
    empresaId: number;
  };
  session?: {
    hasToken: boolean;
    tokenPreview: string;
    hasERPSession: boolean;
    hasDeviceId: boolean;
    setCookieCount: number;
  };
  message?: string;
  error?: string;
}

export interface UserErpCredentials {
  email: string;
  password: string | null;
  hasPassword: boolean;
}

interface CacheMeta {
  totalEntries: number;
  totalSizeMB: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export interface LoadingProgressState {
  isActive: boolean;
  totalMonths: number;
  completedMonths: number;
  currentMonth: string | null;
  recordsLoaded: number;
  errors: string[];
  isCancelled: boolean;
}

interface SheetDataContextType {
  rawData: RawSaleRow[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  diagnostic: DiagnosticInfo;
  filiais: FilialData[];
  colaboradores: string[];
  erpCredentials: UserErpCredentials | null;
  cacheMeta: CacheMeta;
  loadingProgress: LoadingProgressState;
  getKpis: (filialId: string, dateFilter?: DateFilter, leadsRecebidos?: number) => KpiData[];
  getColaboradores: (filialId: string, colaboradorId?: string) => ColaboradorData[];
  getEvolucao: () => EvolucaoData[];
  getProdutos: (filialId: string) => ProdutoData[];
  loadErpData: (dateFrom?: Date, dateTo?: Date, forceRefresh?: boolean) => Promise<void>;
  cancelLoading: () => void;
  refreshData: () => Promise<void>;
  testErpLogin: () => Promise<LoginTestResult>;
  fetchExcellencePercentage: (dateFilter?: DateFilter) => Promise<number | null>;
  fetchLeadsTotal: (dateFilter?: DateFilter) => Promise<number | null>;
  refreshErpCredentials: () => Promise<void>;
  clearCache: () => Promise<void>;
  getCacheInfo: (dateFrom: Date, dateTo: Date) => Promise<{ isCached: boolean; cachedAt: Date | null; recordCount: number }>;
}

const SheetDataContext = createContext<SheetDataContextType | undefined>(undefined);

// Note: Removed sessionStorage caching for security - sensitive data stays in memory only

const colors = ['bg-primary', 'bg-success', 'bg-warning', 'bg-chart-4', 'bg-chart-5', 'bg-primary/80', 'bg-success/80', 'bg-warning/80'];

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function normalizeFilialId(filial: string): string {
  return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function formatDateForErp(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function SheetDataProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawData] = useState<RawSaleRow[]>([]);
  const [kpiTargets, setKpiTargets] = useState<KpiTarget[]>([]);
  const [excellencePercentage, setExcellencePercentage] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState<{ dateFrom: Date; dateTo: Date } | null>(null);
  const [erpCredentials, setErpCredentials] = useState<UserErpCredentials | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo>({
    lastAttempt: null,
    lastSuccess: null,
    lastError: null,
    recordsLoaded: 0,
    period: null,
    status: 'idle',
  });
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgressState>({
    isActive: false,
    totalMonths: 0,
    completedMonths: 0,
    currentMonth: null,
    recordsLoaded: 0,
    errors: [],
    isCancelled: false,
  });
  const [cancelRequested, setCancelRequested] = useState(false);

  // Cancel loading function
  const cancelLoading = useCallback(() => {
    setCancelRequested(true);
    setLoadingProgress(prev => ({ ...prev, isCancelled: true }));
    toast.info('Cancelando carregamento...');
  }, []);

  // Cache hook with smart monthly caching
  const { 
    getCachedData, 
    setCachedData, 
    clearAllCache, 
    getCacheInfo, 
    cacheMeta,
    getMonthsToRefresh,
    getCachedMonths,
    setMonthData,
    monthsToRefresh: MONTHS_TO_REFRESH_CONFIG,
  } = useErpCache();

  // Fetch ERP credentials from profile using secure RPC function
  const refreshErpCredentials = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErpCredentials(null);
      return;
    }

    // Use the secure RPC function to get decrypted password
    const { data: decryptedPassword, error } = await supabase.rpc('get_erp_password', {
      target_user_id: user.id
    });

    if (error) {
      console.error('Error fetching ERP credentials:', error);
      setErpCredentials({
        email: user.email || '',
        password: null,
        hasPassword: false,
      });
      return;
    }

    setErpCredentials({
      email: user.email || '',
      password: decryptedPassword || null,
      hasPassword: !!decryptedPassword,
    });
  }, []);

  // Load credentials on mount and auth changes
  useEffect(() => {
    refreshErpCredentials();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshErpCredentials();
    });

    return () => subscription.unsubscribe();
  }, [refreshErpCredentials]);

  // Fetch KPI targets from database
  useEffect(() => {
    const fetchTargets = async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from('kpi_targets')
        .select('kpi_type, target_value')
        .eq('month', now.getMonth() + 1)
        .eq('year', now.getFullYear());
      
      if (!error && data) {
        setKpiTargets(data);
      }
    };
    
    fetchTargets();
  }, []);

  // Function to fetch excellence percentage for a specific date range
  const fetchExcellencePercentage = useCallback(async (dateFilter?: DateFilter): Promise<number | null> => {
    const now = new Date();
    const startDate = dateFilter?.dateFrom 
      ? dateFilter.dateFrom.toISOString().split('T')[0]
      : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = dateFilter?.dateTo 
      ? dateFilter.dateTo.toISOString().split('T')[0]
      : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: evaluations, error: evalError } = await supabase
      .from('excellence_evaluations')
      .select('id')
      .gte('evaluation_date', startDate)
      .lte('evaluation_date', endDate);

    if (evalError || !evaluations || evaluations.length === 0) {
      return null;
    }

    const evalIds = evaluations.map(e => e.id);

    const { data: scores, error: scoresError } = await supabase
      .from('excellence_scores')
      .select('score')
      .in('evaluation_id', evalIds);

    if (scoresError || !scores) {
      return null;
    }

    const validScores = scores.filter(s => s.score !== null && s.score !== -1);
    const positiveScores = validScores.filter(s => s.score === 1).length;
    const percentage = validScores.length > 0 ? (positiveScores / validScores.length) * 100 : null;
    
    return percentage;
  }, []);

  // Function to fetch leads total for a specific date range
  const fetchLeadsTotal = useCallback(async (dateFilter?: DateFilter): Promise<number | null> => {
    const now = new Date();
    const startDate = dateFilter?.dateFrom 
      ? dateFilter.dateFrom.toISOString().split('T')[0]
      : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = dateFilter?.dateTo 
      ? dateFilter.dateTo.toISOString().split('T')[0]
      : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('lead_records')
      .select('leads_count')
      .gte('record_date', startDate)
      .lte('record_date', endDate);

    if (error || !data || data.length === 0) {
      return null;
    }

    const total = data.reduce((sum, r) => sum + (r.leads_count || 0), 0);
    return total;
  }, []);

  // Fetch excellence evaluations from database
  useEffect(() => {
    const fetchExcellenceData = async () => {
      const percentage = await fetchExcellencePercentage();
      setExcellencePercentage(percentage);
    };

    fetchExcellenceData();
  }, [fetchExcellencePercentage]);

  // Note: We no longer cache sensitive ERP data in sessionStorage for security reasons.
  // Data is kept in React state only and fetched fresh on each session.

  // Subscribe to realtime updates from other users
  // NOTE: We only notify the user, but don't replace local data because:
  // 1. Realtime broadcast has payload size limits (~2MB) which can truncate large datasets
  // 2. Each user should manage their own data loading from the database cache
  useEffect(() => {
    const channel = supabase
      .channel('erp-data-sync')
      .on('broadcast', { event: 'erp-updated' }, (payload) => {
        console.log('Received ERP update from another user');
        const { recordCount, period } = payload.payload as { recordCount?: number; period?: string };
        
        // Only show notification, don't replace local data to avoid truncation issues
        if (recordCount && recordCount > 0) {
          toast.info(`Novos dados disponíveis (${recordCount.toLocaleString('pt-BR')} registros de ${period || 'período recente'})`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Broadcast a notification to other users (metadata only, not full data)
  const broadcastUpdate = useCallback(async (recordCount: number, period: string) => {
    const channel = supabase.channel('erp-data-sync-broadcast');
    try {
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'erp-updated',
        payload: { recordCount, period },
      });
    } catch (err) {
      console.warn('[Broadcast] Failed to send update:', err);
    } finally {
      // Always cleanup the channel after sending
      await supabase.removeChannel(channel);
    }
  }, []);

  // Helper: Generate monthly periods
  const generateMonthlyPeriods = useCallback((start: Date, end: Date) => {
    const periods: { start: Date; end: Date; label: string }[] = [];
    let current = new Date(start);
    
    while (current <= end) {
      const periodStart = new Date(current.getFullYear(), current.getMonth(), periods.length === 0 ? start.getDate() : 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const periodEnd = monthEnd > end ? end : monthEnd;
      
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const label = `${monthNames[current.getMonth()]}/${current.getFullYear()}`;
      
      periods.push({ start: periodStart, end: periodEnd, label });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return periods;
  }, []);

  // Progressive loading with smart caching - only fetches months that need refresh
  const loadErpDataProgressive = useCallback(async (startDate: Date, endDate: Date, forceRefresh = false) => {
    // Get months that need refresh vs cached months (now async)
    const monthsToRefresh = forceRefresh 
      ? generateMonthlyPeriods(startDate, endDate).map(p => ({
          year: p.start.getFullYear(),
          month: p.start.getMonth() + 1,
          label: p.label,
        }))
      : await getMonthsToRefresh(startDate, endDate);
    
    const cachedMonths = forceRefresh ? [] : await getCachedMonths(startDate, endDate);
    
    // Start with cached data
    const allData: RawSaleRow[] = [];
    for (const cached of cachedMonths) {
      allData.push(...cached.data);
    }
    
    console.log(`[Cache] Using ${cachedMonths.length} cached months, need to fetch ${monthsToRefresh.length} months`);
    
    // If no months need refresh, use cache only
    if (monthsToRefresh.length === 0) {
      setRawData(allData);
      setIsConnected(true);
      setCurrentPeriod({ dateFrom: startDate, dateTo: endDate });
      setDiagnostic(prev => ({
        ...prev,
        lastSuccess: new Date(),
        lastError: null,
        recordsLoaded: allData.length,
        status: 'success',
      }));
      toast.success(`${allData.length.toLocaleString('pt-BR')} registros carregados do cache (Supabase)`);
      return;
    }
    
    setCancelRequested(false);
    setLoadingProgress({
      isActive: true,
      totalMonths: monthsToRefresh.length,
      completedMonths: 0,
      currentMonth: monthsToRefresh[0]?.label || null,
      recordsLoaded: allData.length,
      errors: [],
      isCancelled: false,
    });

    const errors: string[] = [];
    const fetchedData: RawSaleRow[] = [];
    
    // Process months sequentially to reduce server load
    for (let i = 0; i < monthsToRefresh.length; i++) {
      // Check for cancellation
      if (cancelRequested) {
        toast.info('Carregamento cancelado');
        break;
      }
      
      const monthInfo = monthsToRefresh[i];
      
      // Update current month label
      setLoadingProgress(prev => ({
        ...prev,
        currentMonth: monthInfo.label,
      }));
      
      // Calculate period dates for this month
      const periodStart = new Date(monthInfo.year, monthInfo.month - 1, 1);
      const periodEnd = new Date(monthInfo.year, monthInfo.month, 0); // Last day of month
      
      // Check if we're fetching the complete month (from day 1 to last day)
      const isCompleteMonth = periodStart >= startDate && periodEnd <= endDate;
      
      // For ERP fetch, always get the full month to ensure cache integrity
      // Only use partial range if this is a truly partial request
      const actualStart = isCompleteMonth ? periodStart : (periodStart < startDate ? startDate : periodStart);
      const actualEnd = isCompleteMonth ? periodEnd : (periodEnd > endDate ? endDate : periodEnd);
      
      const MAX_RETRIES = 2;
      let lastError = '';
      let monthData: RawSaleRow[] = [];
      let success = false;
      
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const requestBody: Record<string, string> = {
            startDate: formatDateForErp(actualStart),
            endDate: formatDateForErp(actualEnd),
            usePagination: 'false',
          };

          if (erpCredentials?.email && erpCredentials?.password) {
            requestBody.email = erpCredentials.email;
            requestBody.password = erpCredentials.password;
          }

          const { data: response, error: funcError } = await supabase.functions.invoke('fetch-erp-data', {
            body: requestBody
          });

          if (funcError) {
            throw new Error(funcError.message);
          }

          if (response?.success === false) {
            throw new Error(response.error || 'Erro no ERP');
          }

          monthData = (response?.data || []) as RawSaleRow[];
          success = true;
          
          // Only save to cache if we fetched the COMPLETE month
          // This prevents partial data from being cached as if it were complete
          if (isCompleteMonth) {
            await setMonthData(monthInfo.year, monthInfo.month, monthData);
            console.log(`[Cache] Saved complete month ${monthInfo.label}: ${monthData.length} records`);
          } else {
            console.log(`[Cache] Skipped saving partial month ${monthInfo.label} (${actualStart.getDate()}/${actualStart.getMonth()+1} - ${actualEnd.getDate()}/${actualEnd.getMonth()+1})`);
          }
          
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Erro';
          const isRateLimit = lastError.toLowerCase().includes('rate') || lastError.includes('429') || lastError.includes('too many');
          const isTimeout = lastError.toLowerCase().includes('timeout');
          
          console.warn(`[ERP] ${monthInfo.label} tentativa ${attempt + 1}/${MAX_RETRIES + 1} falhou:`, lastError);
          
          // Wait before retry (exponential backoff, longer for rate limits)
          if (attempt < MAX_RETRIES) {
            const baseDelay = isRateLimit ? 5000 : isTimeout ? 3000 : 2000;
            await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
          }
        }
      }
      
      if (success) {
        fetchedData.push(...monthData);
      } else {
        errors.push(`${monthInfo.label}: ${lastError}`);
      }

      setLoadingProgress(prev => ({
        ...prev,
        completedMonths: i + 1,
        recordsLoaded: allData.length + fetchedData.length,
        errors,
      }));
      
      // Small delay between months to reduce server load
      if (i < monthsToRefresh.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // Handle cancellation - reset state properly
    if (cancelRequested) {
      setCancelRequested(false);
      setLoadingProgress(prev => ({ ...prev, isActive: false, isCancelled: true }));
      setIsLoading(false);
      // Don't update rawData with partial data on cancellation
      // Keep previous data intact
      setDiagnostic(prev => ({
        ...prev,
        status: 'idle',
        lastError: 'Carregamento cancelado pelo usuário',
      }));
      return;
    }
    
    // Combine cached and fetched data
    const combinedData = [...allData, ...fetchedData];

    setRawData(combinedData);
    setIsConnected(true);
    setCurrentPeriod({ dateFrom: startDate, dateTo: endDate });
    
    setDiagnostic(prev => ({
      ...prev,
      lastSuccess: new Date(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
      recordsLoaded: combinedData.length,
      status: errors.length === monthsToRefresh.length ? 'error' : 'success',
    }));

    const MAX_ROWS_BACKGROUND_OPS = 50000;
    if (combinedData.length <= MAX_ROWS_BACKGROUND_OPS) {
      const periodLabel = `${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')}`;
      setTimeout(() => {
        void broadcastUpdate(combinedData.length, periodLabel);
      }, 0);
    }

    setTimeout(() => {
      setLoadingProgress(prev => ({ ...prev, isActive: false }));
    }, 2000);

    setIsLoading(false);
    
    const cachedCount = allData.length;
    const fetchedCount = fetchedData.length;
    
    if (errors.length === 0) {
      if (cachedCount > 0 && fetchedCount > 0) {
        toast.success(`${combinedData.length.toLocaleString('pt-BR')} registros (${cachedCount.toLocaleString('pt-BR')} do cache + ${fetchedCount.toLocaleString('pt-BR')} do ERP)`);
      } else if (cachedCount > 0) {
        toast.success(`${cachedCount.toLocaleString('pt-BR')} registros carregados do cache`);
      } else {
        toast.success(`${fetchedCount.toLocaleString('pt-BR')} registros carregados do ERP`);
      }
    } else if (errors.length < monthsToRefresh.length) {
      toast.warning(`${combinedData.length.toLocaleString('pt-BR')} registros carregados (${errors.length} meses com erro)`);
    } else {
      toast.error('Falha ao carregar dados do ERP');
    }
  }, [erpCredentials, broadcastUpdate, generateMonthlyPeriods, getMonthsToRefresh, getCachedMonths, setMonthData, cancelRequested]);

  // Single request loading (for small date ranges)
  const loadErpDataSingle = useCallback(async (startDate: Date, endDate: Date) => {
    try {
      const requestBody: Record<string, string> = {
        startDate: formatDateForErp(startDate),
        endDate: formatDateForErp(endDate),
      };

      if (erpCredentials?.email && erpCredentials?.password) {
        requestBody.email = erpCredentials.email;
        requestBody.password = erpCredentials.password;
      }

      const { data: response, error: funcError } = await supabase.functions.invoke('fetch-erp-data', {
        body: requestBody
      });

      if (funcError) {
        throw new Error(funcError.message || 'Erro ao buscar dados do ERP');
      }

      if (response?.success === false) {
        if (response.needsCredentials) {
          throw new Error('Configure sua senha do ERP para carregar os dados.');
        }
        if (response.invalidCredentials) {
          throw new Error('Credenciais inválidas. Verifique sua senha do ERP.');
        }
        throw new Error(response.error || 'Erro desconhecido do ERP');
      }

      if (!response?.data || !Array.isArray(response.data)) {
        throw new Error('Resposta inválida do ERP - dados não encontrados');
      }

      const data = response.data as RawSaleRow[];
      setRawData(data);
      setIsConnected(true);
      setCurrentPeriod({ dateFrom: startDate, dateTo: endDate });

      setDiagnostic(prev => ({
        ...prev,
        lastSuccess: new Date(),
        lastError: null,
        recordsLoaded: data.length,
        status: 'success',
      }));

      const MAX_ROWS_BACKGROUND_OPS = 20000;
      if (data.length <= MAX_ROWS_BACKGROUND_OPS) {
        setTimeout(() => {
          try {
            setCachedData(startDate, endDate, data);
          } catch (e) {
            console.error('[Cache] Failed to persist cache', e);
          }
        }, 0);

        const periodLabel = `${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')}`;
        setTimeout(() => {
          void broadcastUpdate(data.length, periodLabel);
        }, 0);
      }

      toast.success(`${data.length} registros carregados do ERP`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      setDiagnostic(prev => ({
        ...prev,
        lastError: errorMessage,
        status: 'error',
      }));
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [erpCredentials, broadcastUpdate, setCachedData]);

  const loadErpData = useCallback(async (dateFrom?: Date, dateTo?: Date, forceRefresh = false) => {
    const now = new Date();
    const startDate = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateTo || now;
    
    // Validate maximum period (12 months max to prevent ERP overload)
    const MAX_MONTHS = 12;
    const diffMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    
    if (diffMonths > MAX_MONTHS) {
      toast.error(`Período máximo permitido: ${MAX_MONTHS} meses. Selecione um intervalo menor.`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    setDiagnostic(prev => ({
      ...prev,
      lastAttempt: new Date(),
      status: 'loading',
      period: { from: formatDateForErp(startDate), to: formatDateForErp(endDate) },
    }));

    const isLargeRange = diffMonths >= 1;

    if (isLargeRange) {
      // Use smart progressive loading with cache awareness
      await loadErpDataProgressive(startDate, endDate, forceRefresh);
    } else {
      // For small ranges, check cache first (now async)
      if (!forceRefresh) {
        const cachedData = await getCachedData(startDate, endDate);
        if (cachedData && cachedData.length > 0) {
          console.log(`[Cache] Using cached data: ${cachedData.length} records`);
          setRawData(cachedData);
          setIsConnected(true);
          setCurrentPeriod({ dateFrom: startDate, dateTo: endDate });
          setDiagnostic(prev => ({
            ...prev,
            lastSuccess: new Date(),
            lastError: null,
            recordsLoaded: cachedData.length,
            status: 'success',
            period: { from: formatDateForErp(startDate), to: formatDateForErp(endDate) },
          }));
          setIsLoading(false);
          toast.success(`${cachedData.length} registros carregados do cache (Supabase)`);
          return;
        }
      }
      await loadErpDataSingle(startDate, endDate);
    }
  }, [getCachedData, loadErpDataProgressive, loadErpDataSingle]);

  const refreshData = useCallback(async () => {
    if (currentPeriod) {
      await loadErpData(currentPeriod.dateFrom, currentPeriod.dateTo, true);
    } else {
      await loadErpData();
    }
  }, [currentPeriod, loadErpData]);

  const testErpLogin = useCallback(async (): Promise<LoginTestResult> => {
    try {
      const { data: response, error: funcError } = await supabase.functions.invoke('test-erp-login');

      if (funcError) {
        return { success: false, error: funcError.message };
      }

      return response as LoginTestResult;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, []);

  // Get unique filiais
  const filiais: FilialData[] = useMemo(() => {
    return [
      { id: 'todas', nome: 'Todas as Filiais' },
      ...Array.from(new Set(rawData.map(r => r.Filial)))
        .filter(Boolean)
        .map(f => ({ id: normalizeFilialId(f), nome: f }))
    ];
  }, [rawData]);

  // Get unique colaboradores (Emissor)
  const colaboradores = useMemo(() => {
    return Array.from(new Set(rawData.map(r => r.Emissor))).filter(Boolean);
  }, [rawData]);

  // Calculate KPIs
  const getKpis = useCallback((filialId: string, dateFilter?: DateFilter, leadsRecebidos?: number): KpiData[] => {
    let filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Filter by date if provided
    if (dateFilter?.dateFrom || dateFilter?.dateTo) {
      // Normalize dateTo to end of day (23:59:59.999) to include all sales from that day
      const toDateEndOfDay = dateFilter.dateTo 
        ? new Date(dateFilter.dateTo.getFullYear(), dateFilter.dateTo.getMonth(), dateFilter.dateTo.getDate(), 23, 59, 59, 999)
        : undefined;
      
      filteredData = filteredData.filter(r => {
        const dataVenda = r['Data Venda'];
        if (!dataVenda) return true;
        
        let rowDate: Date | null = null;
        
        if (typeof dataVenda === 'string') {
          // Parse ISO date format (2025-01-01 09:32:33)
          rowDate = new Date(dataVenda);
        } else if (typeof dataVenda === 'number') {
          const now = new Date();
          rowDate = new Date(now.getFullYear(), now.getMonth(), dataVenda);
        }
        
        if (!rowDate || isNaN(rowDate.getTime())) return true;
        
        const fromDate = dateFilter.dateFrom;
        
        if (fromDate && rowDate < fromDate) return false;
        if (toDateEndOfDay && rowDate > toDateEndOfDay) return false;
        
        return true;
      });
    }

    const getTarget = (kpiType: string): number | undefined => {
      const target = kpiTargets.find(t => t.kpi_type === kpiType);
      return target?.target_value;
    };

    const formatTarget = (kpiType: string, value: number | undefined): string | undefined => {
      if (value === undefined) return undefined;
      if (kpiType === 'faturamento' || kpiType === 'ticket-medio') {
        return formatCurrency(value);
      }
      if (kpiType === 'lucro' || kpiType === 'padrao-exc' || kpiType === 'conversao') {
        return `${value}%`;
      }
      return formatNumber(value);
    };

    if (filteredData.length === 0) {
      return [
        { 
          id: 'padrao-exc', 
          title: 'Padrão Exc. %', 
          value: excellencePercentage !== null ? `${excellencePercentage.toFixed(1)}%` : '--',
          rawValue: excellencePercentage ?? undefined,
          meta: formatTarget('padrao_exc', getTarget('padrao_exc')) || '90%', 
          targetValue: getTarget('padrao_exc'), 
          variation: 0, 
          isPositive: excellencePercentage !== null ? excellencePercentage >= 90 : true, 
          notFound: excellencePercentage === null,
          source: 'database' as const,
        },
        { id: 'leads', title: 'Leads', value: '--', meta: formatTarget('leads', getTarget('leads')), targetValue: getTarget('leads'), variation: 0, isPositive: true, notFound: true, source: 'database' as const },
        { id: 'vendas', title: 'Vendas', value: '--', meta: formatTarget('vendas', getTarget('vendas')), targetValue: getTarget('vendas'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
        { id: 'conversao', title: 'Conversão', value: '--', meta: formatTarget('conversao', getTarget('conversao')), targetValue: getTarget('conversao'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
        { id: 'faturamento', title: 'Faturamento', value: '--', meta: formatTarget('faturamento', getTarget('faturamento')), targetValue: getTarget('faturamento'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
        { id: 'ticket-medio', title: 'Ticket Médio', value: '--', meta: formatTarget('ticket-medio', getTarget('ticket-medio')), targetValue: getTarget('ticket-medio'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
        { id: 'pa', title: 'P.A', value: '--', meta: formatTarget('pa', getTarget('pa')), targetValue: getTarget('pa'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
        { id: 'lucro', title: 'Lucro %', value: '--', meta: formatTarget('lucro', getTarget('lucro')), targetValue: getTarget('lucro'), variation: 0, isPositive: true, notFound: true, source: 'erp' as const },
      ];
    }

    // Aggregate data - exclude 'PC' (Pacote) type items from revenue calculation
    // as they are bundle items and their value is already included in sub-items
    const vendaIds = new Set(filteredData.map(r => r['Venda #']));
    const totalVendas = vendaIds.size;
    const revenueData = filteredData.filter(r => r.Tipo !== 'PC');
    const totalFaturamento = revenueData.reduce((sum, r) => sum + (r.Líquido || 0), 0);
    const totalLucro = revenueData.reduce((sum, r) => sum + (r.Lucro || 0), 0);
    const totalQuantidade = filteredData.reduce((sum, r) => sum + (r.Quantidade || 0), 0);
    const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;
    const lucroPercent = totalFaturamento > 0 ? (totalLucro / totalFaturamento) * 100 : 0;
    const pa = totalVendas > 0 ? totalQuantidade / totalVendas : 0;

    return [
      {
        id: 'padrao-exc',
        title: 'Padrão Exc. %',
        value: excellencePercentage !== null ? `${excellencePercentage.toFixed(1)}%` : '--',
        rawValue: excellencePercentage ?? undefined,
        meta: formatTarget('padrao_exc', getTarget('padrao_exc')) || '90%',
        targetValue: getTarget('padrao_exc'),
        variation: 0,
        isPositive: excellencePercentage !== null ? excellencePercentage >= 90 : true,
        notFound: excellencePercentage === null,
        source: 'database' as const,
      },
      {
        id: 'leads',
        title: 'Leads',
        value: '--',
        meta: formatTarget('leads', getTarget('leads')),
        targetValue: getTarget('leads'),
        variation: 0,
        isPositive: true,
        notFound: true,
        source: 'database' as const,
      },
      {
        id: 'vendas',
        title: 'Vendas',
        value: formatNumber(totalVendas),
        rawValue: totalVendas,
        meta: formatTarget('vendas', getTarget('vendas')),
        targetValue: getTarget('vendas'),
        previousValue: undefined,
        variation: 0,
        isPositive: true,
        notFound: false,
        source: 'erp' as const,
      },
      {
        id: 'conversao',
        title: 'Conversão',
        value: leadsRecebidos && leadsRecebidos > 0 
          ? `${((totalVendas / leadsRecebidos) * 100).toFixed(1)}%` 
          : '--',
        rawValue: leadsRecebidos && leadsRecebidos > 0 
          ? (totalVendas / leadsRecebidos) * 100 
          : undefined,
        meta: formatTarget('conversao', getTarget('conversao')),
        targetValue: getTarget('conversao'),
        variation: 0,
        isPositive: true,
        notFound: !leadsRecebidos || leadsRecebidos === 0,
        source: 'database' as const,
      },
      {
        id: 'faturamento',
        title: 'Faturamento',
        value: formatCurrency(totalFaturamento),
        rawValue: totalFaturamento,
        meta: formatTarget('faturamento', getTarget('faturamento')),
        targetValue: getTarget('faturamento'),
        previousValue: undefined,
        variation: 0,
        isPositive: true,
        notFound: false,
        source: 'erp' as const,
      },
      {
        id: 'ticket-medio',
        title: 'Ticket Médio',
        value: `R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        rawValue: ticketMedio,
        meta: formatTarget('ticket-medio', getTarget('ticket-medio')),
        targetValue: getTarget('ticket-medio'),
        previousValue: undefined,
        variation: 0,
        isPositive: true,
        notFound: false,
        source: 'erp' as const,
      },
      {
        id: 'pa',
        title: 'P.A',
        value: pa.toFixed(1),
        rawValue: pa,
        meta: formatTarget('pa', getTarget('pa')),
        targetValue: getTarget('pa'),
        previousValue: undefined,
        variation: 0,
        isPositive: true,
        notFound: false,
        source: 'erp' as const,
      },
      {
        id: 'lucro',
        title: 'Lucro %',
        value: `${lucroPercent.toFixed(1)}%`,
        rawValue: lucroPercent,
        meta: formatTarget('lucro', getTarget('lucro')),
        targetValue: getTarget('lucro'),
        previousValue: undefined,
        variation: 0,
        isPositive: lucroPercent > 0,
        notFound: false,
        source: 'erp' as const,
      },
    ];
  }, [rawData, kpiTargets, excellencePercentage]);

  // Calculate colaboradores ranking
  const getColaboradores = useCallback((filialId: string, colaboradorId?: string): ColaboradorData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    const byEmissor: Record<string, { vendas: Set<number>; faturamento: number; filial: string }> = {};
    
    filteredData.forEach(row => {
      const emissor = row.Emissor;
      if (!emissor) return;
      
      if (!byEmissor[emissor]) {
        byEmissor[emissor] = { vendas: new Set(), faturamento: 0, filial: row.Filial };
      }
      byEmissor[emissor].vendas.add(row['Venda #']);
      // Exclude 'PC' (Pacote) type items from revenue calculation
      if (row.Tipo !== 'PC') {
        byEmissor[emissor].faturamento += row.Líquido || 0;
      }
    });

    const result = Object.entries(byEmissor)
      .map(([nome, data], index) => ({
        id: index + 1,
        nome,
        iniciais: getInitials(nome),
        vendas: data.vendas.size,
        conversao: '-',
        faturamento: formatCurrency(data.faturamento),
        cor: colors[index % colors.length],
        filial: normalizeFilialId(data.filial),
      }))
      .sort((a, b) => b.vendas - a.vendas);

    if (colaboradorId && colaboradorId !== 'todos') {
      return result.filter(c => c.id.toString() === colaboradorId);
    }

    return result;
  }, [rawData]);

  // Calculate monthly evolution
  const getEvolucao = useCallback((): EvolucaoData[] => {
    return [];
  }, []);

  // Calculate product ranking
  const getProdutos = useCallback((filialId: string): ProdutoData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    const byProduto: Record<string, number> = {};
    
    filteredData.forEach(row => {
      const item = row.Item;
      if (!item) return;
      
      const quantidade = row.Quantidade || 0;
      byProduto[item] = (byProduto[item] || 0) + quantidade;
    });

    return Object.entries(byProduto)
      .map(([nome, quantidade], index) => ({
        id: index + 1,
        nome,
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [rawData]);

  return (
    <SheetDataContext.Provider value={{
      rawData,
      isLoading,
      error,
      isConnected,
      diagnostic,
      filiais,
      colaboradores,
      erpCredentials,
      cacheMeta,
      loadingProgress,
      getKpis,
      getColaboradores,
      getEvolucao,
      getProdutos,
      loadErpData,
      cancelLoading,
      refreshData,
      testErpLogin,
      fetchExcellencePercentage,
      fetchLeadsTotal,
      refreshErpCredentials,
      clearCache: clearAllCache,
      getCacheInfo,
    }}>
      {children}
    </SheetDataContext.Provider>
  );
}

export function useSheetData() {
  const context = useContext(SheetDataContext);
  if (context === undefined) {
    throw new Error('useSheetData must be used within a SheetDataProvider');
  }
  return context;
}
