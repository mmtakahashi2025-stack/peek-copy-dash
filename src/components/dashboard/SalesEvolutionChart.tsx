import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { useSheetData, RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChartAggregates, MonthlyAggregate } from '@/hooks/useChartAggregates';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
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
  
  // State
  const [activeTab, setActiveTab] = useState<'anual' | 'mensal'>('anual');
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

  // Load daily data ONLY when monthly tab is active (lazy loading)
  const loadDailyData = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingDaily(true);
    try {
      // Fetch only the specific month from cache
      const { data, error } = await supabase
        .from('erp_cache')
        .select('data')
        .eq('year', selectedYear)
        .eq('month', selectedMonth + 1)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.log(`[SalesEvolution] No data for ${selectedYear}-${selectedMonth + 1}`);
        setDailyData([]);
        return;
      }

      const rawData = data.data as unknown as RawSaleRow[];
      if (!Array.isArray(rawData)) {
        setDailyData([]);
        return;
      }

      // Filter and calculate daily totals
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
      
      console.log(`[SalesEvolution] Daily data loaded: ${filtered.length} records for ${selectedYear}-${selectedMonth + 1}`);
    } catch (error) {
      console.error('[SalesEvolution] Error loading daily data:', error);
      setDailyData([]);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [user, selectedYear, selectedMonth, filialId, colaboradorId]);

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

  const hasYearlyData = yearlyComparisonData.some(d => d.faturamento > 0 || d.faturamentoAnterior > 0);
  const hasPreviousYearData = yearlyComparisonData.some(d => d.faturamentoAnterior > 0);
  const hasDailyData = dailyData.some(d => d.faturamento > 0);
  
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
          onValueChange={(v) => setActiveTab(v as 'anual' | 'mensal')}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="anual">{selectedYearForAnnual}</TabsTrigger>
            <TabsTrigger value="mensal">{mesesCompletos[selectedMonth]}/{selectedYear}</TabsTrigger>
          </TabsList>
          
          {/* Faturamento Anual com Comparativo do Ano Anterior */}
          <TabsContent value="anual" className="h-[280px]">
            <div className="flex flex-col gap-1 mb-4">
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
              {hasYearlyData && !hasPreviousYearData && (
                <p className="text-xs text-warning">
                  Dados de {previousYear} não disponíveis para comparação
                </p>
              )}
            </div>
            
            <div className="h-[220px]">
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
                    <ChartTooltip 
                      content={<ChartTooltipContent />} 
                      formatter={(value: number) => formatCurrencyFull(value)}
                    />
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
          
          {/* Faturamento Mensal por Dias */}
          <TabsContent value="mensal" className="h-[280px]">
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
            
            <div className="h-[220px]">
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
