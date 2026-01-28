import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawSaleRow {
  Filial: string;
  Emissor: string;
  'Venda #': number;
  'Data Venda': number | string;
  Item: string;
  Tipo: string;
  Quantidade: number;
  Líquido: number;
}

function normalizeFilialId(filial: string): string {
  return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdminResult } = await supabase.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!isAdminResult) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { year, month, forceAll = false } = body;

    console.log(`[Aggregates] Starting recalculation: year=${year}, month=${month}, forceAll=${forceAll}`);

    // Determine which months to process
    let monthsToProcess: { year: number; month: number }[] = [];
    
    if (forceAll) {
      // Process all months in cache
      const { data: cacheMonths } = await supabase
        .from('erp_cache')
        .select('year, month')
        .order('year', { ascending: true })
        .order('month', { ascending: true });
      
      monthsToProcess = cacheMonths || [];
    } else if (year && month) {
      monthsToProcess = [{ year, month }];
    } else {
      return new Response(JSON.stringify({ 
        error: 'Specify year/month or forceAll=true' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Aggregates] Processing ${monthsToProcess.length} months`);

    const results = {
      processed: 0,
      dailyAggregates: 0,
      rankingEntries: 0,
      errors: [] as string[],
    };

    for (const period of monthsToProcess) {
      try {
        // Fetch raw data from cache
        const { data: cacheData, error: cacheError } = await supabase
          .from('erp_cache')
          .select('data')
          .eq('year', period.year)
          .eq('month', period.month)
          .limit(1)
          .maybeSingle();

        if (cacheError || !cacheData) {
          console.log(`[Aggregates] No cache for ${period.year}-${period.month}`);
          continue;
        }

        const rawData = cacheData.data as RawSaleRow[];
        if (!Array.isArray(rawData) || rawData.length === 0) {
          continue;
        }

        // ========================================
        // DAILY AGGREGATES
        // ========================================
        const dailyMap = new Map<string, {
          date: string;
          filial: string;
          colaborador: string | null;
          faturamento: number;
          lucro: number;
          vendas: number;
        }>();

        const filialDailyTotals = new Map<string, Map<string, { faturamento: number; lucro: number; vendas: number }>>();
        const globalDailyTotals = new Map<string, { faturamento: number; lucro: number; vendas: number }>();

        // Monthly aggregates for erp_monthly_aggregates table
        const monthlyMap = new Map<string, {
          filial: string;
          colaborador: string | null;
          faturamento: number;
          lucro: number;
          vendas: number;
        }>();
        const filialMonthlyTotals = new Map<string, { faturamento: number; lucro: number; vendas: number }>();
        let globalMonthlyTotal = { faturamento: 0, lucro: 0, vendas: 0 };

        rawData.forEach(row => {
          if (row.Tipo === 'PC') return; // Exclude Pacote

          const rowDate = parseRowDate(row['Data Venda']);
          if (!rowDate) return;

          const dateStr = rowDate.toISOString().split('T')[0];
          const filial = normalizeFilialId(row.Filial || 'todas');
          const colaborador = row.Emissor || null;
          const liquido = row.Líquido || 0;
          // Lucro calculation: using a simplified margin (can be adjusted based on business logic)
          // For now, assuming lucro is part of the raw data or we calculate a default margin
          const lucro = liquido * 0.2; // Default 20% margin - adjust as needed

          // Per colaborador - DAILY
          if (colaborador) {
            const key = `${dateStr}|${filial}|${colaborador}`;
            if (!dailyMap.has(key)) {
              dailyMap.set(key, { date: dateStr, filial, colaborador, faturamento: 0, lucro: 0, vendas: 0 });
            }
            const entry = dailyMap.get(key)!;
            entry.faturamento += liquido;
            entry.lucro += lucro;
            entry.vendas += 1;
          }

          // Filial totals - DAILY (colaborador = null)
          if (!filialDailyTotals.has(filial)) {
            filialDailyTotals.set(filial, new Map());
          }
          const filialMap = filialDailyTotals.get(filial)!;
          if (!filialMap.has(dateStr)) {
            filialMap.set(dateStr, { faturamento: 0, lucro: 0, vendas: 0 });
          }
          const ft = filialMap.get(dateStr)!;
          ft.faturamento += liquido;
          ft.lucro += lucro;
          ft.vendas += 1;

          // Global totals - DAILY
          if (!globalDailyTotals.has(dateStr)) {
            globalDailyTotals.set(dateStr, { faturamento: 0, lucro: 0, vendas: 0 });
          }
          const gt = globalDailyTotals.get(dateStr)!;
          gt.faturamento += liquido;
          gt.lucro += lucro;
          gt.vendas += 1;

          // === MONTHLY AGGREGATES ===
          // Per colaborador - MONTHLY
          if (colaborador) {
            const monthKey = `${filial}|${colaborador}`;
            if (!monthlyMap.has(monthKey)) {
              monthlyMap.set(monthKey, { filial, colaborador, faturamento: 0, lucro: 0, vendas: 0 });
            }
            const mEntry = monthlyMap.get(monthKey)!;
            mEntry.faturamento += liquido;
            mEntry.lucro += lucro;
            mEntry.vendas += 1;
          }

          // Filial totals - MONTHLY (colaborador = null)
          if (!filialMonthlyTotals.has(filial)) {
            filialMonthlyTotals.set(filial, { faturamento: 0, lucro: 0, vendas: 0 });
          }
          const fmt = filialMonthlyTotals.get(filial)!;
          fmt.faturamento += liquido;
          fmt.lucro += lucro;
          fmt.vendas += 1;

          // Global total - MONTHLY
          globalMonthlyTotal.faturamento += liquido;
          globalMonthlyTotal.lucro += lucro;
          globalMonthlyTotal.vendas += 1;
        });

        // Build daily aggregate rows
        const dailyRows: {
          date: string;
          filial: string;
          colaborador: string | null;
          faturamento: number;
          quantidade_vendas: number;
        }[] = [];

        // Per colaborador
        dailyMap.forEach(entry => {
          dailyRows.push({
            date: entry.date,
            filial: entry.filial,
            colaborador: entry.colaborador,
            faturamento: entry.faturamento,
            quantidade_vendas: entry.vendas,
          });
        });

        // Per filial (colaborador = null)
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

        // Global (filial = 'todas', colaborador = null)
        globalDailyTotals.forEach((totals, dateStr) => {
          dailyRows.push({
            date: dateStr,
            filial: 'todas',
            colaborador: null,
            faturamento: totals.faturamento,
            quantidade_vendas: totals.vendas,
          });
        });

        // Delete existing and insert new
        const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
        const lastDay = new Date(period.year, period.month, 0).getDate();
        const endDate = `${period.year}-${String(period.month).padStart(2, '0')}-${lastDay}`;

        await supabase
          .from('erp_daily_aggregates')
          .delete()
          .gte('date', startDate)
          .lte('date', endDate);

        if (dailyRows.length > 0) {
          const { error: insertError } = await supabase
            .from('erp_daily_aggregates')
            .insert(dailyRows);

          if (insertError) {
            console.error(`[Aggregates] Error inserting daily for ${period.year}-${period.month}:`, insertError);
            results.errors.push(`Daily ${period.year}-${period.month}: ${insertError.message}`);
          } else {
            results.dailyAggregates += dailyRows.length;
          }
        }

        // ========================================
        // MONTHLY AGGREGATES (with total_lucro)
        // ========================================
        const monthlyRows: {
          year: number;
          month: number;
          filial: string;
          colaborador: string | null;
          faturamento: number;
          total_lucro: number;
          quantidade_vendas: number;
        }[] = [];

        // Per colaborador
        monthlyMap.forEach(entry => {
          monthlyRows.push({
            year: period.year,
            month: period.month,
            filial: entry.filial,
            colaborador: entry.colaborador,
            faturamento: entry.faturamento,
            total_lucro: entry.lucro,
            quantidade_vendas: entry.vendas,
          });
        });

        // Per filial (colaborador = null)
        filialMonthlyTotals.forEach((totals, filial) => {
          monthlyRows.push({
            year: period.year,
            month: period.month,
            filial,
            colaborador: null,
            faturamento: totals.faturamento,
            total_lucro: totals.lucro,
            quantidade_vendas: totals.vendas,
          });
        });

        // Global (filial = 'todas', colaborador = null)
        monthlyRows.push({
          year: period.year,
          month: period.month,
          filial: 'todas',
          colaborador: null,
          faturamento: globalMonthlyTotal.faturamento,
          total_lucro: globalMonthlyTotal.lucro,
          quantidade_vendas: globalMonthlyTotal.vendas,
        });

        // Delete existing and insert new monthly aggregates
        await supabase
          .from('erp_monthly_aggregates')
          .delete()
          .eq('year', period.year)
          .eq('month', period.month);

        if (monthlyRows.length > 0) {
          const { error: monthlyError } = await supabase
            .from('erp_monthly_aggregates')
            .insert(monthlyRows);

          if (monthlyError) {
            console.error(`[Aggregates] Error inserting monthly for ${period.year}-${period.month}:`, monthlyError);
            results.errors.push(`Monthly ${period.year}-${period.month}: ${monthlyError.message}`);
          }
        }

        // ========================================
        // RANKING CACHE
        // ========================================
        const colaboradorTotals = new Map<string, { nome: string; faturamento: number; vendas: number }>();
        const produtoTotals = new Map<string, { nome: string; quantidade: number }>();

        // Also track per-filial rankings
        const filialColabTotals = new Map<string, Map<string, { nome: string; faturamento: number; vendas: number }>>();
        const filialProdTotals = new Map<string, Map<string, { nome: string; quantidade: number }>>();

        rawData.forEach(row => {
          if (row.Tipo === 'PC') return;

          const filial = normalizeFilialId(row.Filial || 'todas');
          const colaborador = row.Emissor || 'Desconhecido';
          const produto = row.Item || 'Desconhecido';
          const liquido = row.Líquido || 0;
          const quantidade = row.Quantidade || 0;

          // Global colaborador ranking
          if (!colaboradorTotals.has(colaborador)) {
            colaboradorTotals.set(colaborador, { nome: colaborador, faturamento: 0, vendas: 0 });
          }
          const ct = colaboradorTotals.get(colaborador)!;
          ct.faturamento += liquido;
          ct.vendas += 1;

          // Global produto ranking
          if (!produtoTotals.has(produto)) {
            produtoTotals.set(produto, { nome: produto, quantidade: 0 });
          }
          const pt = produtoTotals.get(produto)!;
          pt.quantidade += quantidade;

          // Per-filial colaborador
          if (!filialColabTotals.has(filial)) {
            filialColabTotals.set(filial, new Map());
          }
          const fct = filialColabTotals.get(filial)!;
          if (!fct.has(colaborador)) {
            fct.set(colaborador, { nome: colaborador, faturamento: 0, vendas: 0 });
          }
          const fcEntry = fct.get(colaborador)!;
          fcEntry.faturamento += liquido;
          fcEntry.vendas += 1;

          // Per-filial produto
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

        // Build ranking rows
        const rankingRows: {
          year: number;
          month: number;
          ranking_type: string;
          filial: string;
          ranking_data: unknown;
        }[] = [];

        // Global rankings (filial = 'todas')
        const globalColabRanking = Array.from(colaboradorTotals.values())
          .sort((a, b) => b.faturamento - a.faturamento)
          .slice(0, 10);

        const globalProdRanking = Array.from(produtoTotals.values())
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10);

        rankingRows.push({
          year: period.year,
          month: period.month,
          ranking_type: 'colaborador',
          filial: 'todas',
          ranking_data: globalColabRanking,
        });

        rankingRows.push({
          year: period.year,
          month: period.month,
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
            year: period.year,
            month: period.month,
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
            year: period.year,
            month: period.month,
            ranking_type: 'produto',
            filial,
            ranking_data: ranking,
          });
        });

        // Delete existing and insert new rankings
        await supabase
          .from('erp_ranking_cache')
          .delete()
          .eq('year', period.year)
          .eq('month', period.month);

        if (rankingRows.length > 0) {
          const { error: rankingError } = await supabase
            .from('erp_ranking_cache')
            .insert(rankingRows);

          if (rankingError) {
            console.error(`[Aggregates] Error inserting rankings for ${period.year}-${period.month}:`, rankingError);
            results.errors.push(`Ranking ${period.year}-${period.month}: ${rankingError.message}`);
          } else {
            results.rankingEntries += rankingRows.length;
          }
        }

        results.processed++;
        console.log(`[Aggregates] Processed ${period.year}-${period.month}: ${dailyRows.length} daily, ${rankingRows.length} rankings`);

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Aggregates] Error processing ${period.year}-${period.month}:`, errMsg);
        results.errors.push(`${period.year}-${period.month}: ${errMsg}`);
      }
    }

    console.log(`[Aggregates] Complete: ${results.processed} months, ${results.dailyAggregates} daily, ${results.rankingEntries} rankings`);

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Aggregates] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
