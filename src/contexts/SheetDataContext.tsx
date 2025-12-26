import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types for raw sheet data
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

interface SheetDataContextType {
  rawData: RawSaleRow[];
  isLoading: boolean;
  error: string | null;
  sheetUrl: string | null;
  filiais: FilialData[];
  colaboradores: string[];
  getKpis: (filialId: string) => KpiData[];
  getColaboradores: (filialId: string, colaboradorId?: string) => ColaboradorData[];
  getEvolucao: () => EvolucaoData[];
  getProdutos: (filialId: string) => ProdutoData[];
  loadSheet: (url: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const SheetDataContext = createContext<SheetDataContextType | undefined>(undefined);

const SHEET_URL_KEY = 'dashboard_sheet_url';
const SHEET_DATA_KEY = 'dashboard_sheet_data';

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

export function SheetDataProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawData] = useState<RawSaleRow[]>([]);
  const [kpiTargets, setKpiTargets] = useState<KpiTarget[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

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

  // Load saved data on mount - using sessionStorage for security (clears on tab close)
  useEffect(() => {
    const savedUrl = sessionStorage.getItem(SHEET_URL_KEY);
    const savedData = sessionStorage.getItem(SHEET_DATA_KEY);
    
    if (savedUrl) {
      setSheetUrl(savedUrl);
    }
    
    if (savedData) {
      try {
        setRawData(JSON.parse(savedData));
      } catch {
        console.error('Failed to parse saved data');
      }
    }
  }, []);

  // Validate broadcast data structure to prevent data corruption attacks
  const isValidBroadcastData = (data: unknown): data is RawSaleRow[] => {
    if (!Array.isArray(data) || data.length === 0 || data.length > 10000) {
      return false;
    }
    // Validate all rows have expected structure
    return data.every(row => 
      typeof row === 'object' && 
      row !== null &&
      'Filial' in row &&
      'Emissor' in row
    );
  };

  // Validate URL is a Google Sheets URL
  const isValidSheetUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === 'docs.google.com' && 
             parsedUrl.pathname.includes('/spreadsheets/');
    } catch {
      return false;
    }
  };

  // Subscribe to realtime updates from other users
  useEffect(() => {
    const channel = supabase
      .channel('sheet-data-sync')
      .on('broadcast', { event: 'sheet-updated' }, (payload) => {
        console.log('Received sheet update from another user');
        const { data, url } = payload.payload as { data: RawSaleRow[]; url: string };
        
        // Validate data structure to prevent data corruption attacks
        if (!isValidBroadcastData(data)) {
          console.error('Invalid broadcast data received - rejecting');
          return;
        }

        // Validate URL to prevent malicious URLs
        if (!isValidSheetUrl(url)) {
          console.error('Invalid sheet URL in broadcast - rejecting');
          return;
        }
        
        setRawData(data);
        setSheetUrl(url);
        sessionStorage.setItem(SHEET_URL_KEY, url);
        sessionStorage.setItem(SHEET_DATA_KEY, JSON.stringify(data));
        toast.info('Dados atualizados por outro usuário');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const broadcastUpdate = useCallback(async (data: RawSaleRow[], url: string) => {
    const channel = supabase.channel('sheet-data-sync');
    await channel.send({
      type: 'broadcast',
      event: 'sheet-updated',
      payload: { data, url },
    });
  }, []);

  const loadSheet = useCallback(async (url: string, broadcast = true) => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate URL before making the request
      if (!isValidSheetUrl(url)) {
        throw new Error('URL inválida. Use uma URL do Google Sheets.');
      }

      const { data: response, error: funcError } = await supabase.functions.invoke('fetch-sheets', {
        body: { sheetUrl: url }
      });

      if (funcError) {
        const ctx = (funcError as any)?.context;
        const status = ctx?.status as number | undefined;
        const body = ctx?.body as unknown;

        let serverError: string | undefined;
        if (body) {
          try {
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
            serverError = (parsed as any)?.error;
          } catch {
            // ignore
          }
        }

        if (status === 401) {
          throw new Error('Sessão expirada. Faça login novamente para carregar a planilha.');
        }

        if (serverError) {
          throw new Error(serverError);
        }

        throw new Error(funcError.message || 'Erro ao buscar dados');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      const data = response.data as RawSaleRow[];
      setRawData(data);
      setSheetUrl(url);
      
      // Save to sessionStorage (more secure - clears on tab close)
      sessionStorage.setItem(SHEET_URL_KEY, url);
      sessionStorage.setItem(SHEET_DATA_KEY, JSON.stringify(data));
      
      // Broadcast to other users
      if (broadcast) {
        await broadcastUpdate(data, url);
      }
      
      toast.success(`${data.length} registros carregados da planilha`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [broadcastUpdate]);

  const refreshData = useCallback(async () => {
    if (sheetUrl) {
      await loadSheet(sheetUrl, true);
    }
  }, [sheetUrl, loadSheet]);

  // Get unique filiais
  const filiais: FilialData[] = [
    { id: 'todas', nome: 'Todas as Filiais' },
    ...Array.from(new Set(rawData.map(r => r.Filial)))
      .filter(Boolean)
      .map(f => ({ id: normalizeFilialId(f), nome: f }))
  ];

  // Get unique colaboradores (Emissor)
  const colaboradores = Array.from(new Set(rawData.map(r => r.Emissor))).filter(Boolean);

  // Calculate KPIs - maintaining the original 8 KPIs
  const getKpis = useCallback((filialId: string): KpiData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Helper to get target for a KPI type
    const getTarget = (kpiType: string): number | undefined => {
      const target = kpiTargets.find(t => t.kpi_type === kpiType);
      return target?.target_value;
    };

    // Helper to format target value for display
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
      // Return all 8 KPIs with notFound state
      return [
        { id: 'padrao-exc', title: 'Padrão Exc. %', value: '--', meta: formatTarget('padrao-exc', getTarget('padrao-exc')) || '90%', targetValue: getTarget('padrao-exc'), variation: 0, isPositive: true, notFound: true },
        { id: 'leads', title: 'Leads', value: '--', meta: formatTarget('leads', getTarget('leads')), targetValue: getTarget('leads'), variation: 0, isPositive: true, notFound: true },
        { id: 'vendas', title: 'Vendas', value: '--', meta: formatTarget('vendas', getTarget('vendas')), targetValue: getTarget('vendas'), variation: 0, isPositive: true, notFound: true },
        { id: 'conversao', title: 'Conversão', value: '--', meta: formatTarget('conversao', getTarget('conversao')), targetValue: getTarget('conversao'), variation: 0, isPositive: true, notFound: true },
        { id: 'faturamento', title: 'Faturamento', value: '--', meta: formatTarget('faturamento', getTarget('faturamento')), targetValue: getTarget('faturamento'), variation: 0, isPositive: true, notFound: true },
        { id: 'ticket-medio', title: 'Ticket Médio', value: '--', meta: formatTarget('ticket-medio', getTarget('ticket-medio')), targetValue: getTarget('ticket-medio'), variation: 0, isPositive: true, notFound: true },
        { id: 'pa', title: 'P.A', value: '--', meta: formatTarget('pa', getTarget('pa')), targetValue: getTarget('pa'), variation: 0, isPositive: true, notFound: true },
        { id: 'lucro', title: 'Lucro %', value: '--', meta: formatTarget('lucro', getTarget('lucro')), targetValue: getTarget('lucro'), variation: 0, isPositive: true, notFound: true },
      ];
    }

    // Aggregate data from spreadsheet
    const vendaIds = new Set(filteredData.map(r => r['Venda #']));
    const totalVendas = vendaIds.size;
    const totalFaturamento = filteredData.reduce((sum, r) => sum + (r.Líquido || 0), 0);
    const totalLucro = filteredData.reduce((sum, r) => sum + (r.Lucro || 0), 0);
    const totalQuantidade = filteredData.reduce((sum, r) => sum + (r.Quantidade || 0), 0);
    const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;
    const lucroPercent = totalFaturamento > 0 ? (totalLucro / totalFaturamento) * 100 : 0;
    const pa = totalVendas > 0 ? totalQuantidade / totalVendas : 0;

    // Return the 8 original KPIs - mark as notFound if data is not available in spreadsheet
    return [
      {
        id: 'padrao-exc',
        title: 'Padrão Exc. %',
        value: '--',
        meta: formatTarget('padrao-exc', getTarget('padrao-exc')) || '90%',
        targetValue: getTarget('padrao-exc'),
        variation: 0,
        isPositive: true,
        notFound: true, // Not available in spreadsheet
      },
      {
        id: 'leads',
        title: 'Leads',
        value: '--',
        meta: formatTarget('leads', getTarget('leads')),
        targetValue: getTarget('leads'),
        variation: 0,
        isPositive: true,
        notFound: true, // Not available in spreadsheet
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
      },
      {
        id: 'conversao',
        title: 'Conversão',
        value: '--',
        meta: formatTarget('conversao', getTarget('conversao')),
        targetValue: getTarget('conversao'),
        variation: 0,
        isPositive: true,
        notFound: true, // Needs leads to calculate
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
      },
    ];
  }, [rawData, kpiTargets]);

  // Calculate colaboradores ranking
  const getColaboradores = useCallback((filialId: string, colaboradorId?: string): ColaboradorData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Group by emissor
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
    // For now, return empty as the date field needs proper parsing
    // The data shows "Data Venda" as numbers (likely day of month)
    return [];
  }, [rawData]);

  // Calculate product ranking
  const getProdutos = useCallback((filialId: string): ProdutoData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Group by Item and sum Quantidade
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
      sheetUrl,
      filiais,
      colaboradores,
      getKpis,
      getColaboradores,
      getEvolucao,
      getProdutos,
      loadSheet,
      refreshData,
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
