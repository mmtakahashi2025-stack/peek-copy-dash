import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChartAggregates, MonthlyAggregate } from '@/hooks/useChartAggregates';
import { useDailyAggregates, DailyAggregate } from '@/hooks/useDailyAggregates';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
};

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesesCompletos = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

// Custom tooltip content for annual comparison with trend indicators
const AnnualTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length < 2) return null;
  
  const atual = payload.find((p: any) => p.dataKey === 'faturamento')?.value || 0;
  const anterior = payload.find((p: any) => p.dataKey === 'faturamentoAnterior')?.value || 0;
  
  const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : 0;
  const isGrowth = atual > anterior;
  const isDecline = atual < anterior;
  
  return (
    <div className="bg-background border border-border/50 rounded-lg p-2.5 shadow-xl text-xs">
      <p className="font-medium mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {isGrowth && <TrendingUp className="h-3.5 w-3.5 text-success" />}
        {isDecline && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
        {!isGrowth && !isDecline && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className={`font-medium ${isGrowth ? 'text-success' : isDecline ? 'text-destructive' : 'text-foreground'}`}>
          {formatCurrencyFull(atual)}
        </span>
      </div>
      <p className="text-muted-foreground mt-1">
        {formatCurrencyFull(anterior)}
      </p>
      {anterior > 0 && (
        <p className={`text-xs font-semibold mt-1 ${isGrowth ? 'text-success' : isDecline ? 'text-destructive' : 'text-muted-foreground'}`}>
          {isGrowth ? '+' : ''}{variacao.toFixed(1)}%
        </p>
      )}
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

// Calculate weeks in a month
const getWeeksInMonth = (year: number, month: number): { week: number; startDay: number; endDay: number; label: string }[] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: { week: number; startDay: number; endDay: number; label: string }[] = [];
  
  let currentDay = 1;
  let weekNum = 1;
  
  while (currentDay <= lastDay.getDate()) {
    const weekStart = currentDay;
    const dayOfWeek = new Date(year, month, currentDay).getDay();
    // Week goes until Saturday (6) or end of month
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const weekEnd = Math.min(currentDay + daysUntilSaturday, lastDay.getDate());
    
    weeks.push({
      week: weekNum,
      startDay: weekStart,
      endDay: weekEnd,
      label: `Semana ${weekNum} (${weekStart}-${weekEnd})`
    });
    
    currentDay = weekEnd + 1;
    weekNum++;
  }
  
  return weeks;
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
  const { fetchDailyAggregates, getMonthlyChartData, getWeeklyChartData, isLoading: isLoadingDailyAggregates } = useDailyAggregates();
  
  // State
  const [activeTab, setActiveTab] = useState<'anual' | 'semana' | 'mensal'>('anual');
  const [selectedMonth, setSelectedMonth] = useState(() => 
    dateFrom ? dateFrom.getMonth() : new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  const [selectedYearForAnnual, setSelectedYearForAnnual] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedMonthForWeek, setSelectedMonthForWeek] = useState(() => 
    dateFrom ? dateFrom.getMonth() : new Date().getMonth()
  );
  const [selectedYearForWeek, setSelectedYearForWeek] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  
  // Data states
  const [yearlyAggregates, setYearlyAggregates] = useState<MonthlyAggregate[]>([]);
  const [dailyData, setDailyData] = useState<{ dia: string; faturamento: number }[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ dia: string; diaSemana?: string; faturamento: number }[]>([]);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(false);
  
  // Track loaded years to avoid duplicate calls
  const loadedYearsRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  
  // Sync internal state when dashboard filters change
  useEffect(() => {
    if (dateFrom && !isInitialMountRef.current) {
      setSelectedMonth(dateFrom.getMonth());
      setSelectedYear(dateFrom.getFullYear());
      setSelectedYearForAnnual(dateFrom.getFullYear());
      setSelectedMonthForWeek(dateFrom.getMonth());
      setSelectedYearForWeek(dateFrom.getFullYear());
    }
    isInitialMountRef.current = false;
  }, [dateFrom]);
  
  // Get weeks for selected month
  const weeksInMonth = useMemo(() => {
    return getWeeksInMonth(selectedYearForWeek, selectedMonthForWeek);
  }, [selectedYearForWeek, selectedMonthForWeek]);
  
  // Reset week selection when month changes
  useEffect(() => {
    setSelectedWeek(1);
  }, [selectedMonthForWeek, selectedYearForWeek]);
  
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

  // Load weekly data using pre-calculated aggregates (FAST: ~31 rows instead of ~20k)
  const loadWeeklyData = useCallback(async () => {
    if (!user) return;
    
    const currentWeekInfo = weeksInMonth.find(w => w.week === selectedWeek);
    if (!currentWeekInfo) return;
    
    setIsLoadingWeekly(true);
    try {
      // Try to use pre-calculated daily aggregates first
      const aggregates = await fetchDailyAggregates(
        selectedYearForWeek,
        selectedMonthForWeek + 1,
        filialId,
        colaboradorId !== 'todos' ? colaboradorId : undefined
      );

      if (aggregates.length > 0) {
        // Use pre-calculated aggregates (ultra-fast)
        const chartData = getWeeklyChartData(
          aggregates,
          selectedYearForWeek,
          selectedMonthForWeek + 1,
          currentWeekInfo.startDay,
          currentWeekInfo.endDay
        );
        setWeeklyData(chartData);
        console.log(`[SalesEvolution] Weekly data from aggregates: ${aggregates.length} rows`);
        return;
      }

      // Fallback to raw cache data if no aggregates exist
      console.log(`[SalesEvolution] No daily aggregates, falling back to raw cache for week ${selectedWeek}`);
      const { data, error } = await supabase
        .from('erp_cache')
        .select('data')
        .eq('year', selectedYearForWeek)
        .eq('month', selectedMonthForWeek + 1)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setWeeklyData([]);
        return;
      }

      const rawData = data.data as unknown as RawSaleRow[];
      if (!Array.isArray(rawData)) {
        setWeeklyData([]);
        return;
      }

      // Filter by filial and colaborador (slow path)
      let filtered = rawData;
      
      if (filialId !== 'todas') {
        filtered = filtered.filter(r => normalizeFilialId(r.Filial) === filialId);
      }
      
      if (colaboradorId && colaboradorId !== 'todos') {
        filtered = filtered.filter(r => r.Emissor === colaboradorId);
      }

      // Calculate daily totals for the selected week
      const dailyFaturamento: { [day: number]: number } = {};
      
      filtered.forEach(row => {
        const rowDate = parseRowDate(row['Data Venda']);
        if (!rowDate || isNaN(rowDate.getTime())) return;
        
        if (rowDate.getFullYear() === selectedYearForWeek && 
            rowDate.getMonth() === selectedMonthForWeek) {
          const day = rowDate.getDate();
          if (day >= currentWeekInfo.startDay && day <= currentWeekInfo.endDay) {
            if (row.Tipo !== 'PC') {
              dailyFaturamento[day] = (dailyFaturamento[day] || 0) + (row.Líquido || 0);
            }
          }
        }
      });

      // Build array for each day in the week
      const weekData: { dia: string; diaSemana: string; faturamento: number }[] = [];
      for (let day = currentWeekInfo.startDay; day <= currentWeekInfo.endDay; day++) {
        const date = new Date(selectedYearForWeek, selectedMonthForWeek, day);
        weekData.push({
          dia: String(day).padStart(2, '0'),
          diaSemana: diasSemana[date.getDay()],
          faturamento: Math.round(dailyFaturamento[day] || 0),
        });
      }

      setWeeklyData(weekData);
      console.log(`[SalesEvolution] Weekly data from raw cache: ${weekData.length} days`);
    } catch (error) {
      console.error('[SalesEvolution] Error loading weekly data:', error);
      setWeeklyData([]);
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [user, selectedYearForWeek, selectedMonthForWeek, selectedWeek, weeksInMonth, filialId, colaboradorId, fetchDailyAggregates, getWeeklyChartData]);

  // Lazy load daily data when tab changes to "mensal"
  useEffect(() => {
    if (activeTab === 'mensal') {
      loadDailyData();
    }
  }, [activeTab, loadDailyData]);

  // Lazy load weekly data when tab changes to "semana"
  useEffect(() => {
    if (activeTab === 'semana') {
      loadWeeklyData();
    }
  }, [activeTab, loadWeeklyData]);

  // Transform aggregates to chart data
  const yearlyComparisonData = useMemo(() => {
    return getYearlyChartData(yearlyAggregates, selectedYearForAnnual, previousYear);
  }, [yearlyAggregates, selectedYearForAnnual, previousYear, getYearlyChartData]);

  const hasYearlyData = yearlyComparisonData.some(d => d.faturamento > 0 || d.faturamentoAnterior > 0);
  const hasPreviousYearData = yearlyComparisonData.some(d => d.faturamentoAnterior > 0);
  const hasDailyData = dailyData.some(d => d.faturamento > 0);
  const hasWeeklyData = weeklyData.some(d => d.faturamento > 0);
  
  const comparisonLabel = compareEnabled ? `vs ${previousYear} (filtro)` : `vs ${previousYear}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Evolução de Vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs 
          defaultValue="anual" 
          className="w-full"
          onValueChange={(v) => setActiveTab(v as 'anual' | 'semana' | 'mensal')}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="anual">ANO</TabsTrigger>
            <TabsTrigger value="semana">SEMANA</TabsTrigger>
            <TabsTrigger value="mensal">MÊS</TabsTrigger>
          </TabsList>
          
          {/* Faturamento Anual com Comparativo do Ano Anterior */}
          <TabsContent value="anual" className="h-[320px]">
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
                  <div className="w-3 h-3 rounded-sm bg-primary" />
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
            
            <div className="h-[240px]">
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
                      dataKey="faturamentoAnterior" 
                      name={`${previousYear}`}
                      fill="hsl(var(--muted-foreground))" 
                      opacity={0.4}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="faturamento" 
                      name={`${selectedYearForAnnual}`}
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </TabsContent>
          
          {/* Faturamento Semanal por Dias */}
          <TabsContent value="semana" className="h-[320px]">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">SEMANA</span>
                <Select 
                  value={String(selectedWeek)} 
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                >
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weeksInMonth.map((week) => (
                      <SelectItem key={week.week} value={String(week.week)}>
                        {week.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">MÊS</span>
                <Select 
                  value={String(selectedMonthForWeek)} 
                  onValueChange={(v) => setSelectedMonthForWeek(parseInt(v))}
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
                  value={String(selectedYearForWeek)} 
                  onValueChange={(v) => setSelectedYearForWeek(parseInt(v))}
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
              {isLoadingWeekly ? (
                <div className="h-full flex flex-col gap-2 p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : !hasWeeklyData ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {`Nenhum dado encontrado para Semana ${selectedWeek} de ${mesesCompletos[selectedMonthForWeek]}/${selectedYearForWeek}`}
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis 
                      dataKey="diaSemana" 
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
                    <ChartTooltip 
                      content={<ChartTooltipContent />} 
                      formatter={(value: number) => formatCurrencyFull(value)}
                      labelFormatter={(label, payload) => {
                        if (payload && payload[0]) {
                          const data = payload[0].payload;
                          return `${data.diaSemana}, dia ${data.dia}`;
                        }
                        return label;
                      }}
                    />
                    <Bar 
                      dataKey="faturamento" 
                      name={`Semana ${selectedWeek}`}
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
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
