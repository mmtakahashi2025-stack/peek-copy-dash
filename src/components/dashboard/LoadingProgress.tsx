import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface LoadingProgressState {
  isActive: boolean;
  totalMonths: number;
  completedMonths: number;
  currentMonth: string | null;
  recordsLoaded: number;
  errors: string[];
}

interface LoadingProgressProps {
  progress: LoadingProgressState;
}

export function LoadingProgress({ progress }: LoadingProgressProps) {
  if (!progress.isActive) return null;

  const percentage = progress.totalMonths > 0 
    ? Math.round((progress.completedMonths / progress.totalMonths) * 100)
    : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-card border border-border rounded-xl shadow-lg p-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Carregando dados do ERP
          </p>
          <p className="text-xs text-muted-foreground">
            {progress.currentMonth || 'Iniciando...'}
          </p>
        </div>
        <span className="text-sm font-semibold text-primary">
          {percentage}%
        </span>
      </div>

      <Progress value={percentage} className="h-2 mb-2" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {progress.completedMonths} de {progress.totalMonths} meses
        </span>
        <span>
          {progress.recordsLoaded.toLocaleString('pt-BR')} registros
        </span>
      </div>

      {progress.errors.length > 0 && (
        <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
          <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{progress.errors[progress.errors.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

export function LoadingProgressComplete({ recordsLoaded }: { recordsLoaded: number }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-card border border-success/50 rounded-xl shadow-lg p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Carregamento concluído
          </p>
          <p className="text-xs text-muted-foreground">
            {recordsLoaded.toLocaleString('pt-BR')} registros carregados
          </p>
        </div>
      </div>
    </div>
  );
}
