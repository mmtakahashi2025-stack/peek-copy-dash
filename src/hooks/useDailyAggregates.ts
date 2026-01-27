import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DailyAggregate {
  date: string;
  filial: string;
  colaborador: string | null;
  faturamento: number;
  quantidade_vendas: number;
}

export interface DailyChartDataPoint {
  dia: string;
  diaSemana?: string;
  faturamento: number;
}

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function useDailyAggregates() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch daily aggregates for a specific month (ultra-fast: ~31 rows instead of ~20k raw records)
  const fetchDailyAggregates = useCallback(async (
    year: number,
    month: number,
    filialId?: string,
    colaboradorId?: string
  ): Promise<DailyAggregate[]> => {
    if (!user) return [];
    
    setIsLoading(true);
    try {
      // Build date range for the month
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      
      let query = supabase
        .from('erp_daily_aggregates')
        .select('date, filial, colaborador, faturamento, quantidade_vendas')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      // Filter by filial
      if (filialId === 'todas' || !filialId) {
        query = query.eq('filial', 'todas');
      } else {
        query = query.eq('filial', filialId);
      }
      
      // Filter by colaborador
      if (colaboradorId && colaboradorId !== 'todos') {
        query = query.eq('colaborador', colaboradorId);
      } else {
        query = query.is('colaborador', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[DailyAggregates] Error fetching:', error);
        return [];
      }

      const result = (data || []).map(row => ({
        date: row.date,
        filial: row.filial,
        colaborador: row.colaborador,
        faturamento: Number(row.faturamento),
        quantidade_vendas: row.quantidade_vendas,
      }));

      console.log(`[DailyAggregates] Loaded ${result.length} daily aggregates for ${year}-${month}`);
      return result;
    } catch (error) {
      console.error('[DailyAggregates] Unexpected error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Transform daily aggregates into chart-ready monthly data (all days in month)
  const getMonthlyChartData = useCallback((
    aggregates: DailyAggregate[],
    year: number,
    month: number
  ): DailyChartDataPoint[] => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyMap = new Map<string, number>();
    
    aggregates.forEach(agg => {
      const dayStr = agg.date.split('-')[2]; // Get day part
      dailyMap.set(dayStr, (dailyMap.get(dayStr) || 0) + agg.faturamento);
    });
    
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dayStr = String(dayNum).padStart(2, '0');
      return {
        dia: dayStr,
        faturamento: Math.round(dailyMap.get(dayStr) || 0),
      };
    });
  }, []);

  // Transform daily aggregates into chart-ready weekly data (specific week)
  const getWeeklyChartData = useCallback((
    aggregates: DailyAggregate[],
    year: number,
    month: number,
    startDay: number,
    endDay: number
  ): DailyChartDataPoint[] => {
    const dailyMap = new Map<number, number>();
    
    aggregates.forEach(agg => {
      const day = parseInt(agg.date.split('-')[2], 10);
      if (day >= startDay && day <= endDay) {
        dailyMap.set(day, (dailyMap.get(day) || 0) + agg.faturamento);
      }
    });
    
    const result: DailyChartDataPoint[] = [];
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      result.push({
        dia: String(day).padStart(2, '0'),
        diaSemana: diasSemana[date.getDay()],
        faturamento: Math.round(dailyMap.get(day) || 0),
      });
    }
    
    return result;
  }, []);

  // Check if daily aggregates exist for a given month
  const hasDailyAggregates = useCallback(async (year: number, month: number): Promise<boolean> => {
    if (!user) return false;
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    
    const { count, error } = await supabase
      .from('erp_daily_aggregates')
      .select('id', { count: 'exact', head: true })
      .eq('date', startDate);

    if (error) {
      console.error('[DailyAggregates] Error checking existence:', error);
      return false;
    }

    return (count || 0) > 0;
  }, [user]);

  return {
    isLoading,
    fetchDailyAggregates,
    getMonthlyChartData,
    getWeeklyChartData,
    hasDailyAggregates,
  };
}
