import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  rawValue?: number;
  meta?: string;
  targetValue?: number;
  previousValue?: string;
  variation: number;
  isPositive: boolean;
  notFound?: boolean;
}

export function KPICard({ title, value, rawValue, meta, targetValue, previousValue, variation, isPositive, notFound }: KPICardProps) {
  // Calculate variance from target (how far above/below)
  const hasTarget = targetValue !== undefined && targetValue > 0 && rawValue !== undefined;
  const meetsTarget = hasTarget && rawValue >= targetValue;
  const targetVariance = hasTarget ? (((rawValue - targetValue) / targetValue) * 100) : undefined;

  if (notFound) {
    return (
      <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
            <div className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/10 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              <span>N/D</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="text-2xl font-bold tracking-tight text-muted-foreground">--</p>
            <p className="text-xs text-amber-600">
              Dado não encontrado na planilha
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="flex items-center gap-2">
            {/* Target indicator */}
            {hasTarget && (
              <div className={cn(
                'flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                meetsTarget 
                  ? 'bg-success/10 text-success' 
                  : 'bg-destructive/10 text-destructive'
              )}>
                {meetsTarget ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                <span>{targetVariance! >= 0 ? '+' : ''}{targetVariance?.toFixed(0)}%</span>
              </div>
            )}
            {/* Variation indicator */}
            {variation !== 0 && (
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
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">
            {hasTarget ? (
              <>Meta: <span className={cn("font-medium", meetsTarget ? "text-success" : "text-destructive")}>{meta}</span></>
            ) : meta ? (
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
