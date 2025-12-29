import { Trash2, Database, Clock, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSheetData } from '@/contexts/SheetDataContext';
import { toast } from 'sonner';

export function CacheInfoButton() {
  const { cacheMeta, clearCache } = useSheetData();

  const handleClearCache = () => {
    clearCache();
    toast.success('Cache limpo com sucesso');
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
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Cache Local</h4>
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
              <Database className="h-4 w-4" />
              <span>Períodos em cache:</span>
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
                <span>Mais antigo:</span>
                <span className="ml-auto font-medium text-foreground">
                  {formatDate(cacheMeta.oldestEntry)}
                </span>
              </div>
            )}
            
            {cacheMeta.newestEntry && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Mais recente:</span>
                <span className="ml-auto font-medium text-foreground">
                  {formatDate(cacheMeta.newestEntry)}
                </span>
              </div>
            )}
          </div>
          
          {cacheMeta.totalEntries === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhum dado em cache. Os dados serão armazenados automaticamente após a primeira busca.
            </p>
          )}
          
          <p className="text-xs text-muted-foreground border-t pt-3">
            O cache expira em 24h e armazena até 12 períodos para melhorar o desempenho.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
