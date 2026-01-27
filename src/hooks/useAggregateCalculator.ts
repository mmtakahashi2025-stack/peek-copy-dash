import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

// Helper to parse date from row
function parseRowDate(dataVenda: number | string): Date | null {
  if (!dataVenda) return null;
  
  if (typeof dataVenda === 'number') {
    if (dataVenda > 40000) {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + dataVenda * 24 * 60 * 60 * 1000);
    }
    return null;
  } else if (typeof dataVenda === 'string') {
    if (dataVenda.includes('/')) {
      const parts = dataVenda.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    }
    if (dataVenda.includes('-')) {
      const parts = dataVenda.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
      }
    }
    const parsed = new Date(dataVenda);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

function normalizeFilialId(filial: string): string {
  return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function useAggregateCalculator() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  // Calculate and save all three levels of aggregates for a month
  const calculateAllAggregates = useCallback(async (
    year: number,
    month: number,
    data: RawSaleRow[]
  ): Promise<{ monthly: boolean; daily: boolean; rankings: boolean }> => {
    if (!user || !isAdmin) {
      console.log('[AggregateCalculator] Only admins can save aggregates');
      return { monthly: false, daily: false, rankings: false };
    }

    const results = { monthly: false, daily: false, rankings: false };

    try {
      // ========================================
      // LEVEL 1: MONTHLY AGGREGATES (existing)
      // ========================================
      const monthlyMap = new Map<string, {
        filial: string;
        colaborador: string | null;
        faturamento: number;
        vendas: number;
      }>();

      const filialTotals = new Map<string, {
        filial: string;
        faturamento: number;
        vendas: number;
      }>();

      // ========================================
      // LEVEL 2: DAILY AGGREGATES (new)
      // ========================================
      const dailyMap = new Map<string, {
        date: string;
        filial: string;
        colaborador: string | null;
        faturamento: number;
        vendas: number;
      }>();

      const filialDailyTotals = new Map<string, Map<string, { faturamento: number; vendas: number }>>();
      const globalDailyTotals = new Map<string, { faturamento: number; vendas: number }>();

      // ========================================
      // LEVEL 3: RANKING CACHE (new)
      // ========================================
      const colaboradorTotals = new Map<string, { nome: string; faturamento: number; vendas: number }>();
      const produtoTotals = new Map<string, { nome: string; quantidade: number }>();
      const filialColabTotals = new Map<string, Map<string, { nome: string; faturamento: number; vendas: number }>>();
      const filialProdTotals = new Map<string, Map<string, { nome: string; quantidade: number }>>();

      // Single pass through data to calculate all aggregates
      data.forEach(row => {
        if (row.Tipo === 'PC') return; // Exclude Pacote

        const rowDate = parseRowDate(row['Data Venda']);
        const dateStr = rowDate ? rowDate.toISOString().split('T')[0] : null;
        
        const filial = normalizeFilialId(row.Filial || 'todas');
        const colaborador = row.Emissor || null;
        const produto = row.Item || 'Desconhecido';
        const liquido = row.Líquido || 0;
        const quantidade = row.Quantidade || 0;

        // MONTHLY: Per colaborador
        if (colaborador) {
          const key = `${filial}|${colaborador}`;
          if (!monthlyMap.has(key)) {
            monthlyMap.set(key, { filial, colaborador, faturamento: 0, vendas: 0 });
          }
          const agg = monthlyMap.get(key)!;
          agg.faturamento += liquido;
          agg.vendas += 1;
        }

        // MONTHLY: Per filial total
        if (!filialTotals.has(filial)) {
          filialTotals.set(filial, { filial, faturamento: 0, vendas: 0 });
        }
        const ft = filialTotals.get(filial)!;
        ft.faturamento += liquido;
        ft.vendas += 1;

        // DAILY: Only if we have a valid date
        if (dateStr) {
          // Per colaborador
          if (colaborador) {
            const key = `${dateStr}|${filial}|${colaborador}`;
            if (!dailyMap.has(key)) {
              dailyMap.set(key, { date: dateStr, filial, colaborador, faturamento: 0, vendas: 0 });
            }
            const entry = dailyMap.get(key)!;
            entry.faturamento += liquido;
            entry.vendas += 1;
          }

          // Per filial daily totals
          if (!filialDailyTotals.has(filial)) {
            filialDailyTotals.set(filial, new Map());
          }
          const filialMap = filialDailyTotals.get(filial)!;
          if (!filialMap.has(dateStr)) {
            filialMap.set(dateStr, { faturamento: 0, vendas: 0 });
          }
          const fdt = filialMap.get(dateStr)!;
          fdt.faturamento += liquido;
          fdt.vendas += 1;

          // Global daily totals
          if (!globalDailyTotals.has(dateStr)) {
            globalDailyTotals.set(dateStr, { faturamento: 0, vendas: 0 });
          }
          const gt = globalDailyTotals.get(dateStr)!;
          gt.faturamento += liquido;
          gt.vendas += 1;
        }

        // RANKING: Global colaborador
        const colabName = colaborador || 'Desconhecido';
        if (!colaboradorTotals.has(colabName)) {
          colaboradorTotals.set(colabName, { nome: colabName, faturamento: 0, vendas: 0 });
        }
        const ct = colaboradorTotals.get(colabName)!;
        ct.faturamento += liquido;
        ct.vendas += 1;

        // RANKING: Global produto
        if (!produtoTotals.has(produto)) {
          produtoTotals.set(produto, { nome: produto, quantidade: 0 });
        }
        const pt = produtoTotals.get(produto)!;
        pt.quantidade += quantidade;

        // RANKING: Per-filial colaborador
        if (!filialColabTotals.has(filial)) {
          filialColabTotals.set(filial, new Map());
        }
        const fct = filialColabTotals.get(filial)!;
        if (!fct.has(colabName)) {
          fct.set(colabName, { nome: colabName, faturamento: 0, vendas: 0 });
        }
        const fcEntry = fct.get(colabName)!;
        fcEntry.faturamento += liquido;
        fcEntry.vendas += 1;

        // RANKING: Per-filial produto
        if (!filialProdTotals.has(filial)) {
          filialProdTotals.set(filial, new Map());
        }
        const fpt = filialProdTotals.get(filial)!;
        if (!fpt.has(produto)) {
          fpt.set(produto, { nome: produto, quantidade: 0 });
        }
        const fpEntry = fpt.get(produto)!;
        fpEntry.quantidade += quantidade;
      });

      // ========================================
      // SAVE MONTHLY AGGREGATES
      // ========================================
      const monthlyRows: {
        year: number;
        month: number;
        filial: string;
        colaborador: string | null;
        faturamento: number;
        quantidade_vendas: number;
        updated_at: string;
      }[] = [];

      monthlyMap.forEach(agg => {
        monthlyRows.push({
          year, month,
          filial: agg.filial,
          colaborador: agg.colaborador,
          faturamento: agg.faturamento,
          quantidade_vendas: agg.vendas,
          updated_at: new Date().toISOString(),
        });
      });

      filialTotals.forEach(ft => {
        monthlyRows.push({
          year, month,
          filial: ft.filial,
          colaborador: null,
          faturamento: ft.faturamento,
          quantidade_vendas: ft.vendas,
          updated_at: new Date().toISOString(),
        });
      });

      const globalTotal = Array.from(filialTotals.values()).reduce(
        (acc, ft) => ({ faturamento: acc.faturamento + ft.faturamento, vendas: acc.vendas + ft.vendas }),
        { faturamento: 0, vendas: 0 }
      );
      monthlyRows.push({
        year, month,
        filial: 'todas',
        colaborador: null,
        faturamento: globalTotal.faturamento,
        quantidade_vendas: globalTotal.vendas,
        updated_at: new Date().toISOString(),
      });

      await supabase.from('erp_monthly_aggregates').delete().eq('year', year).eq('month', month);
      const { error: monthlyError } = await supabase.from('erp_monthly_aggregates').insert(monthlyRows);
      results.monthly = !monthlyError;
      if (monthlyError) {
        console.error(`[AggregateCalculator] Monthly error ${year}-${month}:`, monthlyError);
      } else {
        console.log(`[AggregateCalculator] Saved ${monthlyRows.length} monthly aggregates for ${year}-${month}`);
      }

      // ========================================
      // SAVE DAILY AGGREGATES
      // ========================================
      const dailyRows: {
        date: string;
        filial: string;
        colaborador: string | null;
        faturamento: number;
        quantidade_vendas: number;
      }[] = [];

      dailyMap.forEach(entry => {
        dailyRows.push({
          date: entry.date,
          filial: entry.filial,
          colaborador: entry.colaborador,
          faturamento: entry.faturamento,
          quantidade_vendas: entry.vendas,
        });
      });

      filialDailyTotals.forEach((dates, filial) => {
        dates.forEach((totals, dateStr) => {
          dailyRows.push({
            date: dateStr,
            filial,
            colaborador: null,
            faturamento: totals.faturamento,
            quantidade_vendas: totals.vendas,
          });
        });
      });

      globalDailyTotals.forEach((totals, dateStr) => {
        dailyRows.push({
          date: dateStr,
          filial: 'todas',
          colaborador: null,
          faturamento: totals.faturamento,
          quantidade_vendas: totals.vendas,
        });
      });

      if (dailyRows.length > 0) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        await supabase.from('erp_daily_aggregates').delete().gte('date', startDate).lte('date', endDate);
        const { error: dailyError } = await supabase.from('erp_daily_aggregates').insert(dailyRows);
        results.daily = !dailyError;
        if (dailyError) {
          console.error(`[AggregateCalculator] Daily error ${year}-${month}:`, dailyError);
        } else {
          console.log(`[AggregateCalculator] Saved ${dailyRows.length} daily aggregates for ${year}-${month}`);
        }
      } else {
        results.daily = true; // No data to save is not an error
      }

      // ========================================
      // SAVE RANKING CACHE
      // ========================================
      const rankingRows: {
        year: number;
        month: number;
        ranking_type: string;
        filial: string;
        ranking_data: { nome: string; faturamento?: number; vendas?: number; quantidade?: number }[];
      }[] = [];

      // Global rankings
      const globalColabRanking = Array.from(colaboradorTotals.values())
        .sort((a, b) => b.faturamento - a.faturamento)
        .slice(0, 10);

      const globalProdRanking = Array.from(produtoTotals.values())
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

      rankingRows.push({
        year, month,
        ranking_type: 'colaborador',
        filial: 'todas',
        ranking_data: globalColabRanking,
      });

      rankingRows.push({
        year, month,
        ranking_type: 'produto',
        filial: 'todas',
        ranking_data: globalProdRanking,
      });

      // Per-filial rankings
      filialColabTotals.forEach((colabMap, filial) => {
        const ranking = Array.from(colabMap.values())
          .sort((a, b) => b.faturamento - a.faturamento)
          .slice(0, 10);
        
        rankingRows.push({
          year, month,
          ranking_type: 'colaborador',
          filial,
          ranking_data: ranking,
        });
      });

      filialProdTotals.forEach((prodMap, filial) => {
        const ranking = Array.from(prodMap.values())
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10);
        
        rankingRows.push({
          year, month,
          ranking_type: 'produto',
          filial,
          ranking_data: ranking,
        });
      });

      await supabase.from('erp_ranking_cache').delete().eq('year', year).eq('month', month);
      const { error: rankingError } = await supabase.from('erp_ranking_cache').insert(rankingRows);
      results.rankings = !rankingError;
      if (rankingError) {
        console.error(`[AggregateCalculator] Ranking error ${year}-${month}:`, rankingError);
      } else {
        console.log(`[AggregateCalculator] Saved ${rankingRows.length} ranking entries for ${year}-${month}`);
      }

      return results;
    } catch (error) {
      console.error(`[AggregateCalculator] Unexpected error ${year}-${month}:`, error);
      return results;
    }
  }, [user, isAdmin]);

  return {
    calculateAllAggregates,
  };
}
