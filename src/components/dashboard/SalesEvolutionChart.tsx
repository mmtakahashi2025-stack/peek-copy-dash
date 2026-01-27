import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { useSheetData, RawSaleRow } from '@/contexts/SheetDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

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
    // If it's a serial date from Excel
    if (dataVenda > 40000) {
      // Excel serial date - days since 1900-01-01
      const excelEpoch = new Date(1899, 11, 30); // Excel epoch
      return new Date(excelEpoch.getTime() + dataVenda * 24 * 60 * 60 * 1000);
    }
    // Assume it's a day of month - use current month
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), dataVenda);
  } else if (typeof dataVenda === 'string') {
    // Try DD/MM/YYYY format (common in Brazil)
    if (dataVenda.includes('/')) {
      const parts = dataVenda.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    }
    
    // Try YYYY-MM-DD format (ISO/API format)
    if (dataVenda.includes('-')) {
      const parts = dataVenda.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
      }
    }
    
    // Try parsing with Date constructor as fallback
    const parsed = new Date(dataVenda);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
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
  const { rawData, yearlyRawData, isLoadingYearly, loadYearlyData } = useSheetData();
  
  // Local state for month/year selection - initialized from props
  const [selectedMonth, setSelectedMonth] = useState(() => 
    dateFrom ? dateFrom.getMonth() : new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  
  // State for annual tab year selection - initialized from props
  const [selectedYearForAnnual, setSelectedYearForAnnual] = useState(() => 
    dateFrom ? dateFrom.getFullYear() : new Date().getFullYear()
  );
  
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

  // Load yearly data when user is authenticated and selected years change
  useEffect(() => {
    // Don't load if auth is still loading
    if (authLoading) {
      console.log('[SalesEvolution] Auth still loading, waiting...');
      return;
    }
    
    // Don't load if no user
    if (!user) {
      console.log('[SalesEvolution] No user, skipping load');
      return;
    }
    
    // Include years from both annual and monthly selectors
    const yearsSet = new Set([
      selectedYearForAnnual,
      selectedYearForAnnual - 1,
      selectedYear,  // Year from monthly chart
    ]);
    const yearsToLoad = Array.from(yearsSet).sort((a, b) => b - a);
    const yearsKey = yearsToLoad.join('-');
    
    // Avoid reloading same years if we already have data
    if (loadedYearsRef.current === yearsKey && yearlyRawData.length > 0) {
      console.log('[SalesEvolution] Years already loaded:', yearsKey);
      return;
    }
    
    console.log('[SalesEvolution] Loading years:', yearsKey);
    loadYearlyData(yearsToLoad);
    loadedYearsRef.current = yearsKey;
  }, [selectedYearForAnnual, selectedYear, loadYearlyData, user, authLoading, yearlyRawData.length]);
  
  // Retry logic: if data is still empty after auth is ready, retry once after a delay
  useEffect(() => {
    if (authLoading || !user) return;
    if (yearlyRawData.length > 0 || isLoadingYearly) return;
    
    const timer = setTimeout(() => {
      console.log('[SalesEvolution] Retry loading after timeout...');
      loadedYearsRef.current = ''; // Reset to force reload
      const yearsToLoad = [selectedYearForAnnual, selectedYearForAnnual - 1];
      loadYearlyData(yearsToLoad);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [authLoading, user, yearlyRawData.length, isLoadingYearly, selectedYearForAnnual, loadYearlyData]);

  // Normalize filial ID for comparison
  const normalizeFilialId = (filial: string): string => {
    return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  // Faturamento do ano selecionado com comparativo do ano anterior
  // Uses yearlyRawData which loads complete years from cache
  const yearlyComparisonData = useMemo(() => {
    // Filter by filial
    let filtered = filialId === 'todas' 
      ? yearlyRawData 
      : yearlyRawData.filter(r => normalizeFilialId(r.Filial) === filialId);
    
    // Filter by colaborador
    if (colaboradorId && colaboradorId !== 'todos') {
      filtered = filtered.filter(r => r.Emissor === colaboradorId);
    }

    // Generate all 12 months of the selected year
    const months = meses.map((mes, index) => ({
      month: index,
      label: mes,
    }));

    // Group data by year-month
    const monthlyFaturamento: { [key: string]: number } = {};
    
    filtered.forEach(row => {
      const rowDate = parseRowDate(row['Data Venda']);
      if (!rowDate || isNaN(rowDate.getTime())) return;
      
      const key = `${rowDate.getFullYear()}-${rowDate.getMonth()}`;
      
      // Exclude 'PC' (Pacote) type items from revenue calculation
      if (row.Tipo !== 'PC') {
        monthlyFaturamento[key] = (monthlyFaturamento[key] || 0) + (row.Líquido || 0);
      }
    });

    // Return data with previous year comparison (using dynamic previousYear)
    return months.map(m => {
      const currentKey = `${selectedYearForAnnual}-${m.month}`;
      const previousKey = `${previousYear}-${m.month}`;
      
      return {
        mes: m.label,
        faturamento: Math.round(monthlyFaturamento[currentKey] || 0),
        faturamentoAnterior: Math.round(monthlyFaturamento[previousKey] || 0),
      };
    });
  }, [yearlyRawData, filialId, colaboradorId, selectedYearForAnnual, previousYear]);

  // Faturamento mensal (por dias) - uses yearlyRawData for full cache access
  const dailyData = useMemo(() => {
    // Filter by filial
    let filtered = filialId === 'todas' 
      ? yearlyRawData 
      : yearlyRawData.filter(r => normalizeFilialId(r.Filial) === filialId);
    
    // Filter by colaborador
    if (colaboradorId && colaboradorId !== 'todos') {
      filtered = filtered.filter(r => r.Emissor === colaboradorId);
    }

    const targetYear = selectedYear;
    const targetMonth = selectedMonth;
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    const dailyFaturamento: { [day: number]: number } = {};
    
    filtered.forEach(row => {
      const rowDate = parseRowDate(row['Data Venda']);
      if (!rowDate || isNaN(rowDate.getTime())) return;
      
      if (rowDate.getFullYear() === targetYear && rowDate.getMonth() === targetMonth) {
        const day = rowDate.getDate();
        
        // Exclude 'PC' (Pacote) type items from revenue calculation
        if (row.Tipo !== 'PC') {
          dailyFaturamento[day] = (dailyFaturamento[day] || 0) + (row.Líquido || 0);
        }
      }
    });

    return Array.from({ length: daysInMonth }, (_, i) => ({
      dia: String(i + 1).padStart(2, '0'),
      faturamento: Math.round(dailyFaturamento[i + 1] || 0),
    }));
  }, [yearlyRawData, filialId, colaboradorId, selectedMonth, selectedYear]);

  const hasYearlyData = yearlyComparisonData.some(d => d.faturamento > 0 || d.faturamentoAnterior > 0);
  const hasPreviousYearData = yearlyComparisonData.some(d => d.faturamentoAnterior > 0);
  const hasDailyData = dailyData.some(d => d.faturamento > 0);
  
  // Label for comparison indicator
  const comparisonLabel = compareEnabled ? `vs ${previousYear} (filtro)` : `vs ${previousYear}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Evolução de Vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="anual" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="anual">{selectedYearForAnnual}</TabsTrigger>
            <TabsTrigger value="mensal">{mesesCompletos[selectedMonth]}/{selectedYear}</TabsTrigger>
          </TabsList>
          
          {/* Faturamento Anual com Comparativo do Ano Anterior */}
          <TabsContent value="anual" className="h-[280px]">
            {/* Seletor de Ano */}
            <div className="flex flex-col gap-1 mb-4">
              <div className="flex items-center gap-2">
                <Select 
                  value={String(selectedYearForAnnual)} 
                  onValueChange={(v) => setSelectedYearForAnnual(parseInt(v))}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {comparisonLabel}
                </span>
              </div>
              {hasYearlyData && !hasPreviousYearData && (
                <p className="text-xs text-warning">
                  Dados de {previousYear} não disponíveis para comparação
                </p>
              )}
            </div>
            
            {/* Gráfico Anual */}
            <div className="h-[220px]">
              {isLoadingYearly ? (
                <div className="h-full flex flex-col gap-2 p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : !hasYearlyData ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {yearlyRawData.length === 0 
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
                    {/* Barra do ano anterior (mais clara, atrás) */}
                    <Bar 
                      dataKey="faturamentoAnterior" 
                      name={`${previousYear}`}
                      fill="hsl(var(--muted-foreground))" 
                      opacity={0.4}
                      radius={[4, 4, 0, 0]}
                    />
                    {/* Barra do ano selecionado (cor principal, frente) */}
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
            {/* Seletores de Mês e Ano */}
            <div className="flex gap-2 mb-4">
              <Select 
                value={String(selectedMonth)} 
                onValueChange={(v) => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {mesesCompletos.map((mes, index) => (
                    <SelectItem key={index} value={String(index)}>{mes}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select 
                value={String(selectedYear)} 
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Gráfico de barras diárias */}
            <div className="h-[220px]">
              {isLoadingYearly ? (
                <div className="h-full flex flex-col gap-2 p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : !hasDailyData ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {yearlyRawData.length === 0 
                    ? 'Carregando dados...'
                    : `Nenhum dado encontrado para ${mesesCompletos[selectedMonth]}/${selectedYear}`}
                </div>
              ) : hasDailyData ? (
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
                      labelFormatter={(label) => `Dia ${label}`}
                    />
                    <Bar 
                      dataKey="faturamento" 
                      name="Faturamento"
                      fill="hsl(var(--primary))" 
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
