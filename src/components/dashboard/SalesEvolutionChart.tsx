import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useSheetData } from '@/contexts/SheetDataContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMemo } from 'react';

const chartConfig = {
  vendas: {
    label: 'Vendas',
    color: 'hsl(var(--primary))',
  },
  faturamento: {
    label: 'Faturamento',
    color: 'hsl(var(--success))',
  },
  lucro: {
    label: 'Lucro',
    color: 'hsl(var(--warning))',
  },
};

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  return `R$ ${(value / 1000).toFixed(0)}K`;
};

export function SalesEvolutionChart() {
  const { rawData } = useSheetData();

  // Process data by filial for the chart
  const chartData = useMemo(() => {
    if (rawData.length === 0) return [];

    const byFilial: Record<string, { vendas: Set<number>; faturamento: number; lucro: number }> = {};

    rawData.forEach(row => {
      const filial = row.Filial || 'Sem Filial';
      if (!byFilial[filial]) {
        byFilial[filial] = { vendas: new Set(), faturamento: 0, lucro: 0 };
      }
      byFilial[filial].vendas.add(row['Venda #']);
      byFilial[filial].faturamento += row.Líquido || 0;
      byFilial[filial].lucro += row.Lucro || 0;
    });

    return Object.entries(byFilial).map(([filial, data]) => ({
      filial: filial.replace('Combo Iguassu ', ''),
      vendas: data.vendas.size,
      faturamento: data.faturamento,
      lucro: data.lucro,
    }));
  }, [rawData]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Vendas por Filial</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Carregue dados da planilha para visualizar o gráfico
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Vendas por Filial</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="vendas" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
            <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
            <TabsTrigger value="lucro">Lucro</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vendas" className="h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="filial" 
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="vendas" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          
          <TabsContent value="faturamento" className="h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="filial" 
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    angle={-20}
                    textAnchor="end"
                    height={60}
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
                  <Bar 
                    dataKey="faturamento" 
                    fill="hsl(var(--success))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          
          <TabsContent value="lucro" className="h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="filial" 
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    angle={-20}
                    textAnchor="end"
                    height={60}
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
                  <Bar 
                    dataKey="lucro" 
                    fill="hsl(var(--warning))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
