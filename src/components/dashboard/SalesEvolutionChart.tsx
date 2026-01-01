import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import { useSheetData, RawSaleRow } from '@/contexts/SheetDataContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
  };
}

const chartConfig: ChartConfig = {
  vendas: {
    label: 'Vendas',
    color: 'hsl(var(--primary))',
  },
  vendasCompare: {
    label: 'Vendas (Comparação)',
    color: 'hsl(var(--muted-foreground))',
  },
  faturamento: {
    label: 'Faturamento',
    color: 'hsl(var(--success))',
  },
  faturamentoCompare: {
    label: 'Faturamento (Comparação)',
    color: 'hsl(var(--muted-foreground))',
  },
  leads: {
    label: 'Leads',
    color: 'hsl(var(--warning))',
  },
};

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value.toFixed(0)}`;
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

// Helper to filter data by date range
const filterByDateRange = (data: RawSaleRow[], dateFrom?: Date, dateTo?: Date): RawSaleRow[] => {
  if (!dateFrom && !dateTo) return data;
  
  // Normalize dateTo to end of day (23:59:59.999) to include all sales from that day
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

// Helper to group data by month
const groupByMonth = (data: RawSaleRow[]): { [key: number]: { vendas: Set<number>; faturamento: number } } => {
  const monthlyData: { [key: number]: { vendas: Set<number>; faturamento: number } } = {};
  
  data.forEach(row => {
    const rowDate = parseRowDate(row['Data Venda']);
    if (!rowDate || isNaN(rowDate.getTime())) return;
    
    const month = rowDate.getMonth();
    
    if (!monthlyData[month]) {
      monthlyData[month] = { vendas: new Set(), faturamento: 0 };
    }
    
    if (row['Venda #']) {
      monthlyData[month].vendas.add(row['Venda #']);
    }
    monthlyData[month].faturamento += row.Líquido || 0;
  });
  
  return monthlyData;
};

export function SalesEvolutionChart({ 
  filialId = 'todas', 
  dateFrom,
  dateTo,
  compareEnabled = false,
  compareDateFrom,
  compareDateTo
}: SalesEvolutionChartProps) {
  const { rawData } = useSheetData();

  // Normalize filial ID for comparison
  const normalizeFilialId = (filial: string): string => {
    return filial.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  // Process data by month for the chart
  const chartData = useMemo(() => {
    // Filter by filial if needed
    const filialFiltered = filialId === 'todas' 
      ? rawData 
      : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

    // Apply date filter
    const filteredData = filterByDateRange(filialFiltered, dateFrom, dateTo);
    
    // Apply comparison date filter
    const compareData = compareEnabled 
      ? filterByDateRange(filialFiltered, compareDateFrom, compareDateTo)
      : [];

    // Group by month
    const monthlyData = groupByMonth(filteredData);
    const monthlyCompareData = compareEnabled ? groupByMonth(compareData) : {};

    // Determine which months to show based on filtered data
    const activeMonths = new Set<number>();
    Object.keys(monthlyData).forEach(m => activeMonths.add(parseInt(m)));
    if (compareEnabled) {
      Object.keys(monthlyCompareData).forEach(m => activeMonths.add(parseInt(m)));
    }

    // If no specific filter, show all months with data
    if (activeMonths.size === 0) {
      return meses.map((mes, index) => ({
        mes,
        vendas: 0,
        faturamento: 0,
        vendasCompare: 0,
        faturamentoCompare: 0,
        leads: 0,
      }));
    }

    // Create chart data for active months only
    const sortedMonths = Array.from(activeMonths).sort((a, b) => a - b);
    
    return sortedMonths.map(monthIndex => ({
      mes: meses[monthIndex],
      vendas: monthlyData[monthIndex]?.vendas.size || 0,
      faturamento: Math.round(monthlyData[monthIndex]?.faturamento || 0),
      vendasCompare: monthlyCompareData[monthIndex]?.vendas.size || 0,
      faturamentoCompare: Math.round(monthlyCompareData[monthIndex]?.faturamento || 0),
      leads: 0, // Leads not available in spreadsheet
    }));
  }, [rawData, filialId, dateFrom, dateTo, compareEnabled, compareDateFrom, compareDateTo]);

  const hasData = rawData.length > 0 && chartData.some(d => d.vendas > 0 || d.faturamento > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Evolução de Vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="vendas" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
            <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vendas" className="h-[300px]">
            {!hasData ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {rawData.length === 0 
                  ? 'Carregue dados da planilha para visualizar o gráfico'
                  : 'Nenhum dado encontrado para o período selecionado'}
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="mes" 
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {compareEnabled && (
                    <Legend />
                  )}
                  <Bar 
                    dataKey="vendas" 
                    name="Vendas"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                  {compareEnabled && (
                    <Bar 
                      dataKey="vendasCompare" 
                      name="Comparação"
                      fill="hsl(var(--muted-foreground))" 
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </BarChart>
              </ChartContainer>
            )}
          </TabsContent>
          
          <TabsContent value="faturamento" className="h-[300px]">
            {!hasData ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {rawData.length === 0 
                  ? 'Carregue dados da planilha para visualizar o gráfico'
                  : 'Nenhum dado encontrado para o período selecionado'}
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="mes" 
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatCurrency}
                    className="fill-muted-foreground"
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent />} 
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  {compareEnabled && (
                    <Legend />
                  )}
                  <Line 
                    type="monotone" 
                    dataKey="faturamento"
                    name="Faturamento" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  {compareEnabled && (
                    <Line 
                      type="monotone" 
                      dataKey="faturamentoCompare"
                      name="Comparação" 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: 'hsl(var(--muted-foreground))', strokeWidth: 2, r: 3 }}
                    />
                  )}
                </LineChart>
              </ChartContainer>
            )}
          </TabsContent>
          
          <TabsContent value="leads" className="h-[300px]">
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Dados não disponíveis</span>
              </div>
              <p className="text-sm text-center max-w-xs">
                A coluna "Leads" não foi encontrada na planilha. Adicione essa informação para visualizar o gráfico.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
