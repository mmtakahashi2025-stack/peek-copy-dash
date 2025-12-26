import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { comparacaoPeriodos } from '@/data/mockData';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(2)}M`;
  }
  return `R$ ${(value / 1000).toFixed(0)}K`;
};

const calculateVariation = (atual: number, anterior: number) => {
  const variation = ((atual - anterior) / anterior) * 100;
  return {
    value: Math.abs(variation).toFixed(1),
    isPositive: variation >= 0,
  };
};

interface ComparisonRowProps {
  label: string;
  atual: number | string;
  anterior: number | string;
  isPercentage?: boolean;
  isCurrency?: boolean;
}

function ComparisonRow({ label, atual, anterior, isPercentage, isCurrency }: ComparisonRowProps) {
  const atualNum = typeof atual === 'number' ? atual : parseFloat(atual as string);
  const anteriorNum = typeof anterior === 'number' ? anterior : parseFloat(anterior as string);
  const variation = calculateVariation(atualNum, anteriorNum);
  
  const formatValue = (val: number) => {
    if (isCurrency) return formatCurrency(val);
    if (isPercentage) return `${val.toFixed(1)}%`;
    return val.toLocaleString('pt-BR');
  };

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{formatValue(anteriorNum)}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{formatValue(atualNum)}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${variation.isPositive ? 'text-success' : 'text-destructive'}`}>
          {variation.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {variation.value}%
        </div>
      </div>
    </div>
  );
}

export function ComparisonCard() {
  const { atual, anterior } = comparacaoPeriodos;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>Comparação de Períodos</span>
          <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <span className="px-2 py-1 bg-muted rounded">{anterior.label}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 bg-primary/10 text-primary rounded">{atual.label}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ComparisonRow 
          label="Vendas" 
          atual={atual.vendas} 
          anterior={anterior.vendas} 
        />
        <ComparisonRow 
          label="Faturamento" 
          atual={atual.faturamento} 
          anterior={anterior.faturamento}
          isCurrency 
        />
        <ComparisonRow 
          label="Leads" 
          atual={atual.leads} 
          anterior={anterior.leads} 
        />
        <ComparisonRow 
          label="Conversão" 
          atual={atual.conversao} 
          anterior={anterior.conversao}
          isPercentage 
        />
      </CardContent>
    </Card>
  );
}
