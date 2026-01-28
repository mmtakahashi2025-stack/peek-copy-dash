import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChartAggregates, MonthlyAggregate, ChartDataPoint } from '@/hooks/useChartAggregates';
import { useDailyAggregates } from '@/hooks/useDailyAggregates';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
  };
}

const chartConfig: ChartConfig = {
  faturamento: {
    label: 'Faturamento Atual',
    color: 'hsl(var(--primary))',
  },
  faturamentoAnterior: {
    label: 'Período Anterior',
    color: 'hsl(var(--muted-foreground))',
  },
  lucro: {
    label: 'Lucro Atual',
    color: 'hsl(var(--success))',
  },
  lucroAnterior: {
    label: 'Lucro Anterior',
    color: 'hsl(var(--muted-foreground))',
  },
};

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesesCompletos = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Custom tooltip content for annual comparison with trend indicators and lucro
const AnnualTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length < 2) return null;
  
  const faturamento = payload.find((p: any) => p.dataKey === 'faturamento')?.value || 0;
  const faturamentoAnterior = payload.find((p: any) => p.dataKey === 'faturamentoAnterior')?.value || 0;
  const lucro = payload.find((p: any) => p.dataKey === 'lucro')?.value || 0;
  const lucroAnterior = payload.find((p: any) => p.dataKey === 'lucroAnterior')?.value || 0;
  
  const variacaoFaturamento = faturamentoAnterior > 0 ? ((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100 : 0;
  const variacaoLucro = lucroAnterior > 0 ? ((lucro - lucroAnterior) / lucroAnterior) * 100 : 0;
  
  const isGrowthFat = faturamento > faturamentoAnterior;
  const isDeclineFat = faturamento < faturamentoAnterior;
  const isGrowthLucro = lucro > lucroAnterior;
  const isDeclineLucro = lucro < lucroAnterior;
  
  return (
    <div className="bg-background border border-border/50 rounded-lg p-2.5 shadow-xl text-xs min-w-[180px]">
      <p className="font-medium mb-2 border-b pb-1">{label}</p>
      
      {/* Faturamento */}
      <div className="mb-2">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Faturamento</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isGrowthFat && <TrendingUp className="h-3 w-3 text-success" />}
          {isDeclineFat && <TrendingDown className="h-3 w-3 text-destructive" />}
          {!isGrowthFat && !isDeclineFat && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span className={`font-medium ${isGrowthFat ? 'text-success' : isDeclineFat ? 'text-destructive' : 'text-foreground'}`}>
            {formatCurrencyFull(faturamento)}
          </span>
          {faturamentoAnterior > 0 && (
            <span className={`text-[10px] ${isGrowthFat ? 'text-success' : isDeclineFat ? 'text-destructive' : 'text-muted-foreground'}`}>
              ({isGrowthFat ? '+' : ''}{variacaoFaturamento.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
      
      {/* Lucro */}
      <div className="mb-2">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Lucro</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isGrowthLucro && <TrendingUp className="h-3 w-3 text-success" />}
          {isDeclineLucro && <TrendingDown className="h-3 w-3 text-destructive" />}
          {!isGrowthLucro && !isDeclineLucro && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span className={`font-medium ${isGrowthLucro ? 'text-success' : isDeclineLucro ? 'text-destructive' : 'text-foreground'}`}>
            {formatCurrencyFull(lucro)}
          </span>
          {lucroAnterior > 0 && (
            <span className={`text-[10px] ${isGrowthLucro ? 'text-success' : isDeclineLucro ? 'text-destructive' : 'text-muted-foreground'}`}>
              ({isGrowthLucro ? '+' : ''}{variacaoLucro.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
      
      {/* Ano anterior */}
      <div className="border-t pt-1.5 text-muted-foreground">
        <span className="text-[10px] uppercase tracking-wide">Ano anterior</span>
        <div className="mt-0.5 space-y-0.5">
          <div className="text-[11px]">Fat: {formatCurrencyFull(faturamentoAnterior)}</div>
          <div className="text-[11px]">Lucro: {formatCurrencyFull(lucroAnterior)}</div>
        </div>
      </div>
    </div>
  );
};

interface SalesEvolutionChartProps {
  filialId?: string;
  colaboradorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  compareEnabled?: boolean;
  compareDateFrom?: Date;
  compareDateTo?: Date;
}

// Helper to parse date from row
const parseRowDate = (dataVenda: number | string): Date | null => {
  if (!dataVenda) return null;
  
  if (typeof dataVenda === 'number') {
    if (dataVenda > 40000) {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + dataVenda * 24 * 60 * 60 * 1000);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), dataVenda);
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
};

// Normalize filial ID for comparison
const normalizeFilialId = (filial: string): string => {
  return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export function SalesEvolutionChart({ 
  filialId = 'todas',
  colaboradorId = 'todos',
  dateFrom,
  dateTo,
  compareEnabled = false,
  compareDateFrom,
  compareDateTo,
}: SalesEvolutionChartProps) {
  const { user, loading: authLoading } = useAuth();
  const { fetchAggregates, getYearlyChartData, isLoading: isLoadingAggregates } = useChartAggregates();
  const { fetchDailyAggregates, getMonthlyChartData, isLoading: isLoadingDailyAggregates } = useDailyAggregates();
  
  // State
  const [activeTab, setActiveTab] = useState<'anual' | 'mensal'>('anual');
  const [viewMode, setViewMode] = useState<'faturamento' | 'lucro'>('faturamento');
  const [selectedMonth, setSelectedMonth] = useState(() => 
    dateFrom ? dateFrom.getMonth() : new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  const [selectedYearForAnnual, setSelectedYearForAnnual] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  
  // Data states
  const [yearlyAggregates, setYearlyAggregates] = useState<MonthlyAggregate[]>([]);
  const [dailyData, setDailyData] = useState<{ dia: string; faturamento: number }[]>([]);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  
  // Track loaded years to avoid duplicate calls
  const loadedYearsRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  
  // Sync internal state when dashboard filters change
  useEffect(() => {
    if (dateFrom && !isInitialMountRef.current) {
      setSelectedMonth(dateFrom.getMonth());
      setSelectedYear(dateFrom.getFullYear());
      setSelectedYearForAnnual(dateFrom.getFullYear());
    }
    isInitialMountRef.current = false;
  }, [dateFrom]);
  
  // Determine comparison year based on filter or default to previous year
  const previousYear = useMemo(() => {
    if (compareEnabled && compareDateFrom) {
      return compareDateFrom.getFullYear();
    }
    return selectedYearForAnnual - 1;
  }, [compareEnabled, compareDateFrom, selectedYearForAnnual]);

  // Generate year options dynamically
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  }, []);

  // Load aggregates when user is authenticated and selected years change (FAST - ~36 rows)
  useEffect(() => {
    if (authLoading || !user) return;
    
    const yearsToLoad = [selectedYearForAnnual, previousYear];
    const yearsKey = `${yearsToLoad.join('-')}|${filialId}|${colaboradorId}`;
    
    if (loadedYearsRef.current === yearsKey) return;
    
    console.log('[SalesEvolution] Loading aggregates for years:', yearsToLoad);
    loadedYearsRef.current = yearsKey;
    
    fetchAggregates(yearsToLoad, filialId, colaboradorId !== 'todos' ? colaboradorId : undefined)
      .then(data => setYearlyAggregates(data));
  }, [selectedYearForAnnual, previousYear, filialId, colaboradorId, user, authLoading, fetchAggregates]);

  // Load daily data using pre-calculated aggregates (FAST: ~31 rows instead of ~20k)
  const loadDailyData = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingDaily(true);
    try {
      // Try to use pre-calculated daily aggregates first
      const aggregates = await fetchDailyAggregates(
        selectedYear,
        selectedMonth + 1,
        filialId,
        colaboradorId !== 'todos' ? colaboradorId : undefined
      );

      if (aggregates.length > 0) {
        // Use pre-calculated aggregates (ultra-fast)
        const chartData = getMonthlyChartData(aggregates, selectedYear, selectedMonth + 1);
        setDailyData(chartData);
        console.log(`[SalesEvolution] Daily data from aggregates: ${aggregates.length} rows for ${selectedYear}-${selectedMonth + 1}`);
        return;
      }

      // Fallback to raw cache data if no aggregates exist
      console.log(`[SalesEvolution] No daily aggregates, falling back to raw cache for ${selectedYear}-${selectedMonth + 1}`);
      const { data, error } = await supabase
        .from('erp_cache')
        .select('data')
        .eq('year', selectedYear)
        .eq('month', selectedMonth + 1)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setDailyData([]);
        return;
      }

      const rawData = data.data as unknown as RawSaleRow[];
      if (!Array.isArray(rawData)) {
        setDailyData([]);
        return;
      }

      // Filter and calculate daily totals (slow path)
      let filtered = rawData;
      
      if (filialId !== 'todas') {
        filtered = filtered.filter(r => normalizeFilialId(r.Filial) === filialId);
      }
      
      if (colaboradorId && colaboradorId !== 'todos') {
        filtered = filtered.filter(r => r.Emissor === colaboradorId);
      }

      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const dailyFaturamento: { [day: number]: number } = {};
      
      filtered.forEach(row => {
        const rowDate = parseRowDate(row['Data Venda']);
        if (!rowDate || isNaN(rowDate.getTime())) return;
        
        if (rowDate.getFullYear() === selectedYear && rowDate.getMonth() === selectedMonth) {
          const day = rowDate.getDate();
          if (row.Tipo !== 'PC') {
            dailyFaturamento[day] = (dailyFaturamento[day] || 0) + (row.Líquido || 0);
          }
        }
      });

      setDailyData(Array.from({ length: daysInMonth }, (_, i) => ({
        dia: String(i + 1).padStart(2, '0'),
        faturamento: Math.round(dailyFaturamento[i + 1] || 0),
      })));
      
      console.log(`[SalesEvolution] Daily data from raw cache: ${filtered.length} records`);
    } catch (error) {
      console.error('[SalesEvolution] Error loading daily data:', error);
      setDailyData([]);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [user, selectedYear, selectedMonth, filialId, colaboradorId, fetchDailyAggregates, getMonthlyChartData]);

  // Lazy load daily data when tab changes to "mensal"
  useEffect(() => {
    if (activeTab === 'mensal') {
      loadDailyData();
    }
  }, [activeTab, loadDailyData]);

  // Transform aggregates to chart data
  const yearlyComparisonData = useMemo(() => {
    return getYearlyChartData(yearlyAggregates, selectedYearForAnnual, previousYear);
  }, [yearlyAggregates, selectedYearForAnnual, previousYear, getYearlyChartData]);

  // Calculate best and worst month based on viewMode
  const bestAndWorstMonth = useMemo(() => {
    const metric = viewMode === 'faturamento' ? 'faturamento' : 'lucro';
    const monthsWithData = yearlyComparisonData.filter(d => d[metric] > 0);
    
    if (monthsWithData.length === 0) return null;
    
    const best = monthsWithData.reduce((max, curr) => 
      curr[metric] > max[metric] ? curr : max
    );
    const worst = monthsWithData.reduce((min, curr) => 
      curr[metric] < min[metric] ? curr : min
    );
    
    // Calculate variation for best and worst
    const metricAnterior = viewMode === 'faturamento' ? 'faturamentoAnterior' : 'lucroAnterior';
    const bestVariacao = best[metricAnterior] > 0 
      ? ((best[metric] - best[metricAnterior]) / best[metricAnterior]) * 100 
      : 0;
    const worstVariacao = worst[metricAnterior] > 0 
      ? ((worst[metric] - worst[metricAnterior]) / worst[metricAnterior]) * 100 
      : 0;
    
    return { 
      best, 
      worst, 
      metric,
      bestVariacao,
      worstVariacao,
    };
  }, [yearlyComparisonData, viewMode]);

  const hasYearlyData = yearlyComparisonData.some(d => d.faturamento > 0 || d.faturamentoAnterior > 0);
  const hasPreviousYearData = yearlyComparisonData.some(d => d.faturamentoAnterior > 0);
  const hasDailyData = dailyData.some(d => d.faturamento > 0);
  
  // Determine which data keys to use based on viewMode
  const currentDataKey = viewMode === 'faturamento' ? 'faturamento' : 'lucro';
  const previousDataKey = viewMode === 'faturamento' ? 'faturamentoAnterior' : 'lucroAnterior';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Evolução de Vendas</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs 
          defaultValue="anual" 
          className="w-full"
          onValueChange={(v) => setActiveTab(v as 'anual' | 'mensal')}
        >
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="anual">ANO</TabsTrigger>
              <TabsTrigger value="mensal">MÊS</TabsTrigger>
            </TabsList>
            
            {/* Toggle Faturamento/Lucro */}
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(v) => v && setViewMode(v as 'faturamento' | 'lucro')}
              className="border rounded-lg"
            >
              <ToggleGroupItem value="faturamento" size="sm" className="text-xs px-3">
                FATURAMENTO
              </ToggleGroupItem>
              <ToggleGroupItem value="lucro" size="sm" className="text-xs px-3">
                LUCRO
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          
          {/* Faturamento/Lucro Anual com Comparativo do Ano Anterior */}
          <TabsContent value="anual" className="h-[380px]">
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">ANO</span>
                  <Select 
                    value={String(selectedYearForAnnual)} 
                    onValueChange={(v) => setSelectedYearForAnnual(parseInt(v))}
                  >
                    <SelectTrigger className="w-[100px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-sm text-muted-foreground">
                  comparado com {previousYear}
                </span>
              </div>
              
              {/* Visual Legend */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-sm ${viewMode === 'faturamento' ? 'bg-primary' : 'bg-success'}`} />
                  <span className="text-xs text-muted-foreground">{selectedYearForAnnual} (atual)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{previousYear} (anterior)</span>
                </div>
              </div>
              
              {hasYearlyData && !hasPreviousYearData && (
                <p className="text-xs text-warning">
                  Dados de {previousYear} não disponíveis para comparação
                </p>
              )}
            </div>
            
            <div className="h-[200px]">
              {isLoadingAggregates ? (
                <div className="h-full flex flex-col gap-2 p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : !hasYearlyData ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {yearlyAggregates.length === 0 
                    ? 'Carregando dados anuais...'
                    : `Nenhum dado encontrado para ${selectedYearForAnnual}`}
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={yearlyComparisonData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis 
                      dataKey="mes" 
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCurrency}
                      className="fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <ChartTooltip content={<AnnualTooltipContent />} />
                    <Bar 
                      dataKey={previousDataKey} 
                      name={`${previousYear}`}
                      fill="hsl(var(--muted-foreground))" 
                      opacity={0.4}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey={currentDataKey} 
                      name={`${selectedYearForAnnual}`}
                      fill={viewMode === 'faturamento' ? 'hsl(var(--primary))' : 'hsl(var(--success))'} 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
            
            {/* Best and Worst Month Legends */}
            {bestAndWorstMonth && hasYearlyData && (
              <div className="mt-4 pt-3 border-t space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-muted-foreground">Melhor:</span>
                  <span className="font-medium">{bestAndWorstMonth.best.mes}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="font-medium text-success">
                    {formatCurrencyFull(bestAndWorstMonth.best[bestAndWorstMonth.metric])}
                  </span>
                  {bestAndWorstMonth.bestVariacao !== 0 && (
                    <span className={`text-xs ${bestAndWorstMonth.bestVariacao > 0 ? 'text-success' : 'text-destructive'}`}>
                      ({bestAndWorstMonth.bestVariacao > 0 ? '+' : ''}{bestAndWorstMonth.bestVariacao.toFixed(1)}%)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-muted-foreground">Pior:</span>
                  <span className="font-medium">{bestAndWorstMonth.worst.mes}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="font-medium text-destructive">
                    {formatCurrencyFull(bestAndWorstMonth.worst[bestAndWorstMonth.metric])}
                  </span>
                  {bestAndWorstMonth.worstVariacao !== 0 && (
                    <span className={`text-xs ${bestAndWorstMonth.worstVariacao > 0 ? 'text-success' : 'text-destructive'}`}>
                      ({bestAndWorstMonth.worstVariacao > 0 ? '+' : ''}{bestAndWorstMonth.worstVariacao.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Faturamento Mensal por Dias */}
          <TabsContent value="mensal" className="h-[320px]">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">MÊS</span>
                <Select 
                  value={String(selectedMonth)} 
                  onValueChange={(v) => setSelectedMonth(parseInt(v))}
                >
                  <SelectTrigger className="w-[140px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesCompletos.map((mes, index) => (
                      <SelectItem key={index} value={String(index)}>{mes}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">ANO</span>
                <Select 
                  value={String(selectedYear)} 
                  onValueChange={(v) => setSelectedYear(parseInt(v))}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="h-[240px]">
              {isLoadingDaily ? (
                <div className="h-full flex flex-col gap-2 p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : !hasDailyData ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {`Nenhum dado encontrado para ${mesesCompletos[selectedMonth]}/${selectedYear}`}
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis 
                      dataKey="dia" 
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      interval={1}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCurrency}
                      className="fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />} 
                      formatter={(value: number) => formatCurrencyFull(value)}
                    />
                    <Bar 
                      dataKey="faturamento" 
                      name={`${mesesCompletos[selectedMonth]}/${selectedYear}`}
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
