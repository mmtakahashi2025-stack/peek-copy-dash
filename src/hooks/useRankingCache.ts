import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RankingColaborador {
  nome: string;
  iniciais: string;
  vendas: number;
  faturamento: number;
  faturamentoFormatado: string;
  conversao: string;
  cor: string;
}

export interface RankingProduto {
  nome: string;
  quantidade: number;
}

export interface RankingCacheEntry {
  year: number;
  month: number;
  ranking_type: 'colaborador' | 'produto';
  filial: string;
  ranking_data: RankingColaborador[] | RankingProduto[];
}

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

export function useRankingCache() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch pre-calculated ranking from cache (ultra-fast: 1 row, ~1KB)
  const fetchRankingColaboradores = useCallback(async (
    year: number,
    month: number,
    filialId: string = 'todas'
  ): Promise<RankingColaborador[]> => {
    if (!user) return [];
    
    setIsLoading(true);
    try {
      const filialFilter = filialId === 'todas' || !filialId ? 'todas' : filialId;
      
      const { data, error } = await supabase
        .from('erp_ranking_cache')
        .select('ranking_data')
        .eq('year', year)
        .eq('month', month)
        .eq('ranking_type', 'colaborador')
        .eq('filial', filialFilter)
        .maybeSingle();

      if (error) {
        console.error('[RankingCache] Error fetching colaboradores:', error);
        return [];
      }

      if (!data || !data.ranking_data) {
        console.log(`[RankingCache] No colaborador ranking for ${year}-${month} ${filialFilter}`);
        return [];
      }

      // Transform raw ranking data to UI format
      const rawRanking = data.ranking_data as unknown as { nome: string; faturamento: number; vendas: number }[];
      
      return rawRanking.map((item, index) => ({
        nome: item.nome,
        iniciais: getInitials(item.nome),
        vendas: item.vendas,
        faturamento: item.faturamento,
        faturamentoFormatado: formatCurrency(item.faturamento),
        conversao: '--', // Not available in aggregate (would need leads data)
        cor: colors[index % colors.length],
      }));
    } catch (error) {
      console.error('[RankingCache] Unexpected error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch pre-calculated product ranking from cache
  const fetchRankingProdutos = useCallback(async (
    year: number,
    month: number,
    filialId: string = 'todas'
  ): Promise<RankingProduto[]> => {
    if (!user) return [];
    
    setIsLoading(true);
    try {
      const filialFilter = filialId === 'todas' || !filialId ? 'todas' : filialId;
      
      const { data, error } = await supabase
        .from('erp_ranking_cache')
        .select('ranking_data')
        .eq('year', year)
        .eq('month', month)
        .eq('ranking_type', 'produto')
        .eq('filial', filialFilter)
        .maybeSingle();

      if (error) {
        console.error('[RankingCache] Error fetching produtos:', error);
        return [];
      }

      if (!data || !data.ranking_data) {
        console.log(`[RankingCache] No produto ranking for ${year}-${month} ${filialFilter}`);
        return [];
      }

      return data.ranking_data as unknown as RankingProduto[];
    } catch (error) {
      console.error('[RankingCache] Unexpected error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Check if ranking cache exists for a given period
  const hasRankingCache = useCallback(async (year: number, month: number): Promise<boolean> => {
    if (!user) return false;
    
    const { count, error } = await supabase
      .from('erp_ranking_cache')
      .select('id', { count: 'exact', head: true })
      .eq('year', year)
      .eq('month', month);

    if (error) {
      console.error('[RankingCache] Error checking existence:', error);
      return false;
    }

    return (count || 0) > 0;
  }, [user]);

  return {
    isLoading,
    fetchRankingColaboradores,
    fetchRankingProdutos,
    hasRankingCache,
  };
}
