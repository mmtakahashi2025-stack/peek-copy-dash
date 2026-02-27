import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/contexts/UserRoleContext';

export interface MonthlyAggregate {
  year: number;
  month: number;
  filial: string;
  colaborador: string | null;
  faturamento: number;
  lucro: number;
  quantidade_vendas: number;
}

export interface ChartDataPoint {
  mes: string;
  faturamento: number;
  faturamentoAnterior: number;
  lucro: number;
  lucroAnterior: number;
}

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function useChartAggregates() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [isLoading, setIsLoading] = useState(false);
  const [aggregates, setAggregates] = useState<MonthlyAggregate[]>([]);

  // Fetch pre-calculated aggregates for specified years (ultra-fast: ~36 rows instead of 150k)
  const fetchAggregates = useCallback(async (
    years: number[],
    filialId?: string,
    colaboradorId?: string
  ): Promise<MonthlyAggregate[]> => {
    if (!user) return [];
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('erp_monthly_aggregates')
        .select('year, month, filial, colaborador, faturamento, total_lucro, quantidade_vendas')
        .in('year', years)
        .order('year', { ascending: true })
        .order('month', { ascending: true });

      // Filter by filial - always apply filter to avoid duplication
      if (filialId === 'todas' || !filialId) {
        // When "todas" is selected, use the pre-calculated total
        query = query.eq('filial', 'todas');
      } else {
        // When a specific filial is selected
        query = query.eq('filial', filialId);
      }
      
      // Filter by colaborador if specified
      if (colaboradorId && colaboradorId !== 'todos') {
        query = query.eq('colaborador', colaboradorId);
      } else {
        // When no colaborador filter, get aggregates with null colaborador (totals per filial)
        query = query.is('colaborador', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Aggregates] Error fetching:', error);
        return [];
      }

      const result = (data || []).map(row => ({
        year: row.year,
        month: row.month,
        filial: row.filial,
        colaborador: row.colaborador,
        faturamento: Number(row.faturamento),
        lucro: Number((row as any).total_lucro || 0),
        quantidade_vendas: row.quantidade_vendas,
      }));

      setAggregates(result);
      console.log(`[Aggregates] Loaded ${result.length} aggregates for years ${years.join(', ')}`);
      return result;
    } catch (error) {
      console.error('[Aggregates] Unexpected error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Transform aggregates into chart-ready data (12 months comparison)
  const getYearlyChartData = useCallback((
    aggregateData: MonthlyAggregate[],
    currentYear: number,
    previousYear: number
  ): ChartDataPoint[] => {
    return meses.map((mes, index) => {
      const month = index + 1;
      
      // Sum all matching aggregates for current year
      const currentYearAggregates = aggregateData.filter(a => a.year === currentYear && a.month === month);
      const currentYearFaturamento = currentYearAggregates.reduce((sum, a) => sum + a.faturamento, 0);
      const currentYearLucro = currentYearAggregates.reduce((sum, a) => sum + a.lucro, 0);
      
      // Sum all matching aggregates for previous year
      const previousYearAggregates = aggregateData.filter(a => a.year === previousYear && a.month === month);
      const previousYearFaturamento = previousYearAggregates.reduce((sum, a) => sum + a.faturamento, 0);
      const previousYearLucro = previousYearAggregates.reduce((sum, a) => sum + a.lucro, 0);
      
      return {
        mes,
        faturamento: Math.round(currentYearFaturamento),
        faturamentoAnterior: Math.round(previousYearFaturamento),
        lucro: Math.round(currentYearLucro),
        lucroAnterior: Math.round(previousYearLucro),
      };
    });
  }, []);

  // Check if aggregates exist for given years
  const hasAggregates = useCallback(async (years: number[]): Promise<boolean> => {
    if (!user) return false;
    
    const { count, error } = await supabase
      .from('erp_monthly_aggregates')
      .select('id', { count: 'exact', head: true })
      .in('year', years);

    if (error) {
      console.error('[Aggregates] Error checking existence:', error);
      return false;
    }

    return (count || 0) > 0;
  }, [user]);

  // Calculate and save aggregates from raw data (called when cache is updated)
  const calculateAndSaveAggregates = useCallback(async (
    year: number, 
    month: number, 
    data: RawSaleRow[]
  ): Promise<boolean> => {
    if (!user || !isAdmin) {
      console.log('[Aggregates] Only admins can save aggregates');
      return false;
    }

    try {
      // NOTE: NO deduplication - use all records as per ERP validation
      // Group by filial + colaborador
      const aggregatesMap = new Map<string, {
        filial: string;
        colaborador: string | null;
        faturamento: number;
        lucro: number;
        vendas: number;
      }>();

      // Also track totals per filial (colaborador = null)
      const filialTotals = new Map<string, {
        filial: string;
        faturamento: number;
        lucro: number;
        vendas: number;
      }>();

      data.forEach(row => {
        const filial = row.Filial || 'todas';
        const colaborador = row.Emissor || null;
        const liquido = row.Líquido || 0;
        const lucro = row.Lucro || 0;
        
        // CORRECTED: Both Faturamento and Lucro EXCLUDE PC types (validated against ERP)
        const isPC = row.Tipo === 'PC';
        if (isPC) return; // Skip PC items entirely

        // Per colaborador aggregate
        if (colaborador) {
          const key = `${filial}|${colaborador}`;
          if (!aggregatesMap.has(key)) {
            aggregatesMap.set(key, { filial, colaborador, faturamento: 0, lucro: 0, vendas: 0 });
          }
          const agg = aggregatesMap.get(key)!;
          agg.faturamento += liquido;
          agg.lucro += lucro;
          agg.vendas += 1;
        }

        // Per filial total (colaborador = null)
        if (!filialTotals.has(filial)) {
          filialTotals.set(filial, { filial, faturamento: 0, lucro: 0, vendas: 0 });
        }
        const ft = filialTotals.get(filial)!;
        ft.faturamento += liquido;
        ft.lucro += lucro;
        ft.vendas += 1;
      });

      console.log(`[Aggregates] Frontend: ${data.length} raw records`);

      // Build rows for upsert
      const rows: {
        year: number;
        month: number;
        filial: string;
        colaborador: string | null;
        faturamento: number;
        total_lucro: number;
        quantidade_vendas: number;
        updated_at: string;
      }[] = [];

      // Add per-colaborador rows
      aggregatesMap.forEach(agg => {
        rows.push({
          year,
          month,
          filial: agg.filial,
          colaborador: agg.colaborador,
          faturamento: agg.faturamento,
          total_lucro: agg.lucro,
          quantidade_vendas: agg.vendas,
          updated_at: new Date().toISOString(),
        });
      });

      // Add filial totals (colaborador = null)
      filialTotals.forEach(ft => {
        rows.push({
          year,
          month,
          filial: ft.filial,
          colaborador: null,
          faturamento: ft.faturamento,
          total_lucro: ft.lucro,
          quantidade_vendas: ft.vendas,
          updated_at: new Date().toISOString(),
        });
      });

      // Add global total (filial = 'todas', colaborador = null)
      const globalTotal = Array.from(filialTotals.values()).reduce(
        (acc, ft) => ({ faturamento: acc.faturamento + ft.faturamento, lucro: acc.lucro + ft.lucro, vendas: acc.vendas + ft.vendas }),
        { faturamento: 0, lucro: 0, vendas: 0 }
      );
      rows.push({
        year,
        month,
        filial: 'todas',
        colaborador: null,
        faturamento: globalTotal.faturamento,
        total_lucro: globalTotal.lucro,
        quantidade_vendas: globalTotal.vendas,
        updated_at: new Date().toISOString(),
      });

      // Delete existing aggregates for this month before inserting
      // (simpler than trying to handle the complex unique constraint with COALESCE)
      await supabase
        .from('erp_monthly_aggregates')
        .delete()
        .eq('year', year)
        .eq('month', month);

      // Insert all new aggregates
      const { error } = await supabase
        .from('erp_monthly_aggregates')
        .insert(rows);

      if (error) {
        console.error(`[Aggregates] Error saving ${year}-${month}:`, error);
        return false;
      }

      console.log(`[Aggregates] Saved ${rows.length} aggregates for ${year}-${month}`);
      return true;
    } catch (error) {
      console.error(`[Aggregates] Unexpected error saving ${year}-${month}:`, error);
      return false;
    }
  }, [user, isAdmin]);

  return {
    aggregates,
    isLoading,
    fetchAggregates,
    getYearlyChartData,
    hasAggregates,
    calculateAndSaveAggregates,
  };
}
