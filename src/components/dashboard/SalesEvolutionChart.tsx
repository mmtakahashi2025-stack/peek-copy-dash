import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { XAxis, YAxis, CartesianGrid, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { useSheetData, RawSaleRow } from '@/contexts/SheetDataContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMemo } from 'react';

interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
  };
}

const chartConfig: ChartConfig = {
  faturamento: {
    label: 'Faturamento',
    color: 'hsl(var(--primary))',
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

// Filter by date range
const filterByDateRange = (data: RawSaleRow[], dateFrom?: Date, dateTo?: Date): RawSaleRow[] => {
  if (!dateFrom && !dateTo) return data;
  
  const dateToEndOfDay = dateTo 
    ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999)
    : undefined;
  
  return data.filter(r => {
    const rowDate = parseRowDate(r['Data Venda']);
    if (!rowDate || isNaN(rowDate.getTime())) return false;
    
    if (dateFrom && rowDate < dateFrom) return false;
    if (dateToEndOfDay && rowDate > dateToEndOfDay) return false;
    
    return true;
  });
};

export function SalesEvolutionChart({ 
  filialId = 'todas', 
  dateFrom,
  dateTo,
}: SalesEvolutionChartProps) {
  const { rawData } = useSheetData();

  // Normalize filial ID for comparison
  const normalizeFilialId = (filial: string): string => {
    return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  // Faturamento últimos 12 meses
  const last12MonthsData = useMemo(() => {
    const filialFiltered = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Get last 12 months from current date
    const now = new Date();
    const months: { year: number; month: number; label: string }[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: `${meses[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`,
      });
    }

    // Group data by year-month
    const monthlyFaturamento: { [key: string]: number } = {};
    
    filialFiltered.forEach(row => {
      const rowDate = parseRowDate(row['Data Venda']);
      if (!rowDate || isNaN(rowDate.getTime())) return;
      
      const key = `${rowDate.getFullYear()}-${rowDate.getMonth()}`;
      
      // Exclude 'PC' (Pacote) type items from revenue calculation
      if (row.Tipo !== 'PC') {
        monthlyFaturamento[key] = (monthlyFaturamento[key] || 0) + (row.Líquido || 0);
      }
    });

    return months.map(m => ({
      mes: m.label,
      faturamento: Math.round(monthlyFaturamento[`${m.year}-${m.month}`] || 0),
    }));
  }, [rawData, filialId]);

  // Faturamento mensal (por dias) - usa o filtro de datas selecionado
  const dailyData = useMemo(() => {
    const filialFiltered = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Apply date filter
    const filteredData = filterByDateRange(filialFiltered, dateFrom, dateTo);

    // Get the month being displayed
    const targetDate = dateFrom || new Date();
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    // Create array for all days in the month
    const dailyFaturamento: { [day: number]: number } = {};
    
    filteredData.forEach(row => {
      const rowDate = parseRowDate(row['Data Venda']);
      if (!rowDate || isNaN(rowDate.getTime())) return;
      
      // Only include data from the target month
      if (rowDate.getFullYear() === targetYear && rowDate.getMonth() === targetMonth) {
        const day = rowDate.getDate();
        
        // Exclude 'PC' (Pacote) type items from revenue calculation
        if (row.Tipo !== 'PC') {
          dailyFaturamento[day] = (dailyFaturamento[day] || 0) + (row.Líquido || 0);
        }
      }
    });

    // Build data for all days
    return Array.from({ length: daysInMonth }, (_, i) => ({
      dia: String(i + 1).padStart(2, '0'),
      faturamento: Math.round(dailyFaturamento[i + 1] || 0),
    }));
  }, [rawData, filialId, dateFrom, dateTo]);

  const hasLast12MonthsData = last12MonthsData.some(d => d.faturamento > 0);
  const hasDailyData = dailyData.some(d => d.faturamento > 0);

  // Get current month name for title
  const currentMonthName = dateFrom 
    ? mesesCompletos[dateFrom.getMonth()] 
    : mesesCompletos[new Date().getMonth()];
  const currentYear = dateFrom?.getFullYear() || new Date().getFullYear();

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Evolução de Vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="12meses" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="12meses">Últimos 12 Meses</TabsTrigger>
            <TabsTrigger value="mensal">{currentMonthName}/{currentYear}</TabsTrigger>
          </TabsList>
          
          {/* Faturamento Últimos 12 Meses */}
          <TabsContent value="12meses" className="h-[300px]">
            {!hasLast12MonthsData ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {rawData.length === 0 
                  ? 'Carregue dados para visualizar o gráfico'
                  : 'Nenhum dado encontrado para os últimos 12 meses'}
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart data={last12MonthsData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                    dataKey="faturamento" 
                    name="Faturamento"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </TabsContent>
          
          {/* Faturamento Mensal por Dias */}
          <TabsContent value="mensal" className="h-[300px]">
            {!hasDailyData ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {rawData.length === 0 
                  ? 'Carregue dados para visualizar o gráfico'
                  : `Nenhum dado encontrado para ${currentMonthName}/${currentYear}`}
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
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
