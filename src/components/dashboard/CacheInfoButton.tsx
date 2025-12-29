import { Trash2, Database, Clock, HardDrive, Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSheetData } from '@/contexts/SheetDataContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export function CacheInfoButton() {
  const { cacheMeta, clearCache } = useSheetData();

  const handleClearCache = async () => {
    await clearCache();
    toast.success('Cache limpo com sucesso (Supabase)');
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '--';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Format month for display (2025-01 -> Jan/25)
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${monthNames[parseInt(month) - 1]}/${year.slice(-2)}`;
  };

  // Check if month is within last 3 months (will be refreshed)
  const isRecentMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthsAgo = (currentYear - year) * 12 + (currentMonth - month);
    return monthsAgo >= 0 && monthsAgo < 3;
  };

  const monthsCached = (cacheMeta as { monthsCached?: string[] }).monthsCached || [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          <span className="hidden sm:inline">Cache</span>
          {cacheMeta.totalEntries > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
              {cacheMeta.totalEntries}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Cache Supabase (por mês)</h4>
            {cacheMeta.totalEntries > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleClearCache}
                className="h-7 text-xs gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Meses em cache:</span>
              <span className="ml-auto font-medium text-foreground">
                {cacheMeta.totalEntries}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>Tamanho:</span>
              <span className="ml-auto font-medium text-foreground">
                {cacheMeta.totalSizeMB.toFixed(2)} MB
              </span>
            </div>
            
            {cacheMeta.oldestEntry && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Última atualização:</span>
                <span className="ml-auto font-medium text-foreground">
                  {formatDate(cacheMeta.newestEntry)}
                </span>
              </div>
            )}
          </div>

          {monthsCached.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Meses armazenados:</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {monthsCached.slice(-12).map((month) => (
                  <Badge 
                    key={month} 
                    variant={isRecentMonth(month) ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {formatMonth(month)}
                    {isRecentMonth(month) && (
                      <RefreshCw className="h-2.5 w-2.5 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                = Atualiza automaticamente (últimos 3 meses)
              </p>
            </div>
          )}
          
          {cacheMeta.totalEntries === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhum dado em cache. Os dados serão armazenados no Supabase automaticamente por mês após a primeira busca.
            </p>
          )}
          
          <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
            <p><strong>Regras de atualização:</strong></p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Últimos 3 meses: atualizam a cada 24h</li>
              <li>Meses anteriores: usam cache permanente</li>
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
