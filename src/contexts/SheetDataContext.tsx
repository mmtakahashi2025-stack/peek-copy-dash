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

// Types for processed data
export interface KpiData {
  id: string;
  title: string;
  value: string;
  meta?: string;
  previousValue?: string;
  variation: number;
  isPositive: boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  // Load saved data on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem(SHEET_URL_KEY);
    const savedData = localStorage.getItem(SHEET_DATA_KEY);
    
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

  const loadSheet = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: response, error: funcError } = await supabase.functions.invoke('fetch-sheets', {
        body: { sheetUrl: url }
      });

      if (funcError) {
        throw new Error(funcError.message || 'Erro ao buscar dados');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      const data = response.data as RawSaleRow[];
      setRawData(data);
      setSheetUrl(url);
      
      // Save to localStorage
      localStorage.setItem(SHEET_URL_KEY, url);
      localStorage.setItem(SHEET_DATA_KEY, JSON.stringify(data));
      
      toast.success(`${data.length} registros carregados da planilha`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (sheetUrl) {
      await loadSheet(sheetUrl);
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

  // Calculate KPIs
  const getKpis = useCallback((filialId: string): KpiData[] => {
    const filteredData = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    if (filteredData.length === 0) {
      return [];
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
        id: 'vendas',
        title: 'Vendas',
        value: formatNumber(totalVendas),
        variation: 0,
        isPositive: true,
      },
      {
        id: 'faturamento',
        title: 'Faturamento',
        value: formatCurrency(totalFaturamento),
        variation: 0,
        isPositive: true,
      },
      {
        id: 'lucro',
        title: 'Lucro',
        value: formatCurrency(totalLucro),
        variation: 0,
        isPositive: true,
      },
      {
        id: 'lucro-percent',
        title: 'Lucro %',
        value: `${lucroPercent.toFixed(1)}%`,
        variation: 0,
        isPositive: lucroPercent > 0,
      },
      {
        id: 'ticket-medio',
        title: 'Ticket Médio',
        value: `R$ ${ticketMedio.toFixed(2)}`,
        variation: 0,
        isPositive: true,
      },
      {
        id: 'pa',
        title: 'P.A',
        value: pa.toFixed(1),
        variation: 0,
        isPositive: true,
      },
      {
        id: 'itens',
        title: 'Itens Vendidos',
        value: formatNumber(totalQuantidade),
        variation: 0,
        isPositive: true,
      },
      {
        id: 'custo',
        title: 'Custo Total',
        value: formatCurrency(filteredData.reduce((sum, r) => sum + (r.Custo || 0), 0)),
        variation: 0,
        isPositive: true,
      },
    ];
  }, [rawData]);

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
