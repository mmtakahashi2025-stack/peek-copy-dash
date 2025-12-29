import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

interface SheetDataContextType {
  rawData: RawSaleRow[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  diagnostic: DiagnosticInfo;
  filiais: FilialData[];
  colaboradores: string[];
  getKpis: (filialId: string, dateFilter?: DateFilter, leadsRecebidos?: number) => KpiData[];
  getColaboradores: (filialId: string, colaboradorId?: string) => ColaboradorData[];
  getEvolucao: () => EvolucaoData[];
  getProdutos: (filialId: string) => ProdutoData[];
  loadErpData: (dateFrom?: Date, dateTo?: Date) => Promise<void>;
  refreshData: () => Promise<void>;
  fetchExcellencePercentage: (dateFilter?: DateFilter) => Promise<number | null>;
  fetchLeadsTotal: (dateFilter?: DateFilter) => Promise<number | null>;
}

const SheetDataContext = createContext<SheetDataContextType | undefined>(undefined);

const ERP_DATA_KEY = 'dashboard_erp_data';
const ERP_PERIOD_KEY = 'dashboard_erp_period';

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
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo>({
    lastAttempt: null,
    lastSuccess: null,
    lastError: null,
    recordsLoaded: 0,
    period: null,
    status: 'idle',
  });

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

  // Load saved data on mount
  useEffect(() => {
    const savedData = sessionStorage.getItem(ERP_DATA_KEY);
    const savedPeriod = sessionStorage.getItem(ERP_PERIOD_KEY);
    
    if (savedData) {
      try {
        setRawData(JSON.parse(savedData));
        setIsConnected(true);
      } catch {
        console.error('Failed to parse saved ERP data');
      }
    }
    
    if (savedPeriod) {
      try {
        const period = JSON.parse(savedPeriod);
        setCurrentPeriod({
          dateFrom: new Date(period.dateFrom),
          dateTo: new Date(period.dateTo),
        });
      } catch {
        console.error('Failed to parse saved period');
      }
    }
  }, []);

  // Subscribe to realtime updates from other users
  useEffect(() => {
    const channel = supabase
      .channel('erp-data-sync')
      .on('broadcast', { event: 'erp-updated' }, (payload) => {
        console.log('Received ERP update from another user');
        const { data } = payload.payload as { data: RawSaleRow[] };
        
        if (!Array.isArray(data) || data.length === 0 || data.length > 50000) {
          console.error('Invalid broadcast data received - rejecting');
          return;
        }
        
        setRawData(data);
        setIsConnected(true);
        sessionStorage.setItem(ERP_DATA_KEY, JSON.stringify(data));
        toast.info('Dados atualizados por outro usuário');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const broadcastUpdate = useCallback(async (data: RawSaleRow[]) => {
    const channel = supabase.channel('erp-data-sync');
    await channel.send({
      type: 'broadcast',
      event: 'erp-updated',
      payload: { data },
    });
  }, []);

  const loadErpData = useCallback(async (dateFrom?: Date, dateTo?: Date, broadcast = true) => {
    setIsLoading(true);
    setError(null);
    
    const now = new Date();
    const startDate = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateTo || now;
    
    setDiagnostic(prev => ({
      ...prev,
      lastAttempt: new Date(),
      status: 'loading',
      period: { from: formatDateForErp(startDate), to: formatDateForErp(endDate) },
    }));

    try {
      const { data: response, error: funcError } = await supabase.functions.invoke('fetch-erp-data', {
        body: { 
          startDate: formatDateForErp(startDate),
          endDate: formatDateForErp(endDate)
        }
      });

      if (funcError) {
        throw new Error(funcError.message || 'Erro ao buscar dados do ERP');
      }

      if (response?.error) {
        throw new Error(response.error);
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
      
      // Save to sessionStorage
      sessionStorage.setItem(ERP_DATA_KEY, JSON.stringify(data));
      sessionStorage.setItem(ERP_PERIOD_KEY, JSON.stringify({ dateFrom: startDate, dateTo: endDate }));
      
      // Broadcast to other users
      if (broadcast) {
        await broadcastUpdate(data);
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
  }, [broadcastUpdate]);

  const refreshData = useCallback(async () => {
    if (currentPeriod) {
      await loadErpData(currentPeriod.dateFrom, currentPeriod.dateTo, true);
    } else {
      await loadErpData();
    }
  }, [currentPeriod, loadErpData]);

  // Get unique filiais
  const filiais: FilialData[] = [
    { id: 'todas', nome: 'Todas as Filiais' },
    ...Array.from(new Set(rawData.map(r => r.Filial)))
      .filter(Boolean)
      .map(f => ({ id: normalizeFilialId(f), nome: f }))
  ];

  // Get unique colaboradores (Emissor)
  const colaboradores = Array.from(new Set(rawData.map(r => r.Emissor))).filter(Boolean);

  // Calculate KPIs
  const getKpis = useCallback((filialId: string, dateFilter?: DateFilter, leadsRecebidos?: number): KpiData[] => {
    let filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Filter by date if provided
    if (dateFilter?.dateFrom || dateFilter?.dateTo) {
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
        const toDate = dateFilter.dateTo;
        
        if (fromDate && rowDate < fromDate) return false;
        if (toDate && rowDate > toDate) return false;
        
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

    // Aggregate data
    const vendaIds = new Set(filteredData.map(r => r['Venda #']));
    const totalVendas = vendaIds.size;
    const totalFaturamento = filteredData.reduce((sum, r) => sum + (r.Líquido || 0), 0);
    const totalLucro = filteredData.reduce((sum, r) => sum + (r.Lucro || 0), 0);
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
      byEmissor[emissor].faturamento += row.Líquido || 0;
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
      getKpis,
      getColaboradores,
      getEvolucao,
      getProdutos,
      loadErpData,
      refreshData,
      fetchExcellencePercentage,
      fetchLeadsTotal,
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
