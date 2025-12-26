import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  meta?: string;
  previousValue?: string;
  variation: number;
  isPositive: boolean;
}

export function KPICard({ title, value, meta, previousValue, variation, isPositive }: KPICardProps) {
  return (
    <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
            isPositive 
              ? 'bg-success/10 text-success' 
              : 'bg-destructive/10 text-destructive'
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{variation.toFixed(1)}%</span>
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">
            {meta ? (
              <>Meta: <span className="font-medium text-foreground">{meta}</span></>
            ) : previousValue ? (
              <>Anterior: <span className="font-medium">{previousValue}</span></>
            ) : null}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
