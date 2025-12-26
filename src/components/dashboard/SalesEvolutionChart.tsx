import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { evolucaoMensalData } from '@/data/mockData';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const chartConfig = {
  vendas: {
    label: 'Vendas',
    color: 'hsl(var(--primary))',
  },
  faturamento: {
    label: 'Faturamento',
    color: 'hsl(var(--success))',
  },
  leads: {
    label: 'Leads',
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
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucaoMensalData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                <LineChart data={evolucaoMensalData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                  <Line 
                    type="monotone" 
                    dataKey="faturamento" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          
          <TabsContent value="leads" className="h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoMensalData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                  <Line 
                    type="monotone" 
                    dataKey="leads" 
                    stroke="hsl(var(--warning))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--warning))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
