import { Trash2, Database, Clock, HardDrive, Calendar, RefreshCw, Zap, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useSheetData } from '@/contexts/SheetDataContext';
import { useUserRole } from '@/contexts/UserRoleContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export function CacheInfoButton() {
  const { cacheMeta, clearCache, localCacheStats, localRetention, updateLocalRetention } = useSheetData();
  const { isAdmin, isLoading } = useUserRole();

  const handleClearCache = async () => {
    await clearCache();
    toast.success('Cache limpo com sucesso');
  };

  const handleRetentionChange = async (value: string) => {
    const months = parseInt(value, 10);
    await updateLocalRetention(months);
    toast.success(`Cache local ajustado para manter ${months} meses`);
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
  const hasLocalCache = localCacheStats?.isAvailable && (localCacheStats?.totalMonths || 0) > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
        >
          {hasLocalCache ? (
            <Zap className="h-4 w-4 text-yellow-500" />
          ) : (
            <Database className="h-4 w-4" />
          )}
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
            <h4 className="font-semibold text-sm">Cache de Dados</h4>
            {!isLoading && (isAdmin || hasLocalCache) && (cacheMeta.totalEntries > 0 || hasLocalCache) && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleClearCache}
                className="h-7 text-xs gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Limpar Tudo
              </Button>
            )}
          </div>
          
          {/* Local Cache Section */}
          {localCacheStats?.isAvailable && (
            <div className="space-y-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                <Zap className="h-4 w-4" />
                <span>Cache Local (Instantâneo)</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span>Meses: </span>
                  <span className="font-medium text-foreground">{localCacheStats.totalMonths || 0}</span>
                </div>
                <div>
                  <span>Registros: </span>
                  <span className="font-medium text-foreground">{(localCacheStats.totalRecords || 0).toLocaleString('pt-BR')}</span>
                </div>
                <div className="col-span-2">
                  <span>Tamanho: </span>
                  <span className="font-medium text-foreground">{(localCacheStats.totalSizeEstimateMB || 0).toFixed(2)} MB</span>
                </div>
              </div>
              
              <Separator className="bg-yellow-500/20" />
              
              {/* Retention Selector */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Settings className="h-3 w-3" />
                  <Label className="text-xs">Manter dados dos últimos:</Label>
                </div>
                <Select 
                  value={String(localRetention)} 
                  onValueChange={handleRetentionChange}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 meses (~13 MB)</SelectItem>
                    <SelectItem value="12">12 meses (~26 MB)</SelectItem>
                    <SelectItem value="24">24 meses (~52 MB)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Meses mais antigos são carregados do servidor quando necessário.
                </p>
              </div>
            </div>
          )}
          
          {/* Supabase Cache Section */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span>Cache Servidor (por mês):</span>
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
                <Calendar className="h-3 w-3" />
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
          
          {cacheMeta.totalEntries === 0 && !hasLocalCache && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhum dado em cache. Os dados serão armazenados automaticamente após a primeira busca.
            </p>
          )}
          
          <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
            <p><strong>Como funciona:</strong></p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li><Zap className="h-3 w-3 inline text-yellow-500" /> Local: carregamento instantâneo</li>
              <li><Database className="h-3 w-3 inline" /> Servidor: sincronização entre dispositivos</li>
              <li>Últimos 3 meses: atualizam a cada 24h</li>
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
