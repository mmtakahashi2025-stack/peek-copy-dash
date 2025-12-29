import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Loader2, CheckCircle2, AlertCircle, RefreshCw, Database, Clock, FileText, Activity } from 'lucide-react';
import { useSheetData } from '@/contexts/SheetDataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function formatDateTime(date: Date | null): string {
  if (!date) return '--';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function SheetConfigDialog() {
  const [open, setOpen] = useState(false);
  const { rawData, isLoading, error, isConnected, diagnostic, loadErpData, refreshData } = useSheetData();

  const handleRefresh = async () => {
    await refreshData();
  };

  const handleLoadData = async () => {
    await loadErpData();
  };

  const hasData = rawData.length > 0;

  const getStatusBadge = () => {
    switch (diagnostic.status) {
      case 'loading':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Carregando
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Sucesso
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <AlertCircle className="h-3 w-3" />
            Erro
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            <Clock className="h-3 w-3" />
            Aguardando
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-2">
      {hasData && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      )}
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isConnected ? 'ERP Conectado' : 'Conectar ERP'}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Conexão com ERP</DialogTitle>
            <DialogDescription>
              Gerencie a conexão e visualize diagnósticos do sistema ERP.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="status" className="gap-2">
                <Database className="h-4 w-4" />
                Status
              </TabsTrigger>
              <TabsTrigger value="diagnostic" className="gap-2">
                <Activity className="h-4 w-4" />
                Diagnóstico
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="status" className="space-y-4 pt-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <span className="font-medium">Status da Conexão</span>
                </div>
                {isConnected ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Conectado ao ERP</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Não conectado</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleLoadData}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    'Carregar Dados'
                  )}
                </Button>
                <Button 
                  onClick={() => setOpen(false)}
                  className="flex-1"
                >
                  Fechar
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {rawData.length > 0 && !error && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">
                    {rawData.length} registros carregados do ERP
                  </span>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="diagnostic" className="space-y-4 pt-4">
              <div className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Estado Atual</span>
                  {getStatusBadge()}
                </div>
                
                {/* Last Attempt */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Última Tentativa
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {formatDateTime(diagnostic.lastAttempt)}
                  </p>
                </div>
                
                {/* Last Success */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Último Sucesso
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {formatDateTime(diagnostic.lastSuccess)}
                  </p>
                </div>
                
                {/* Period */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Período Consultado
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {diagnostic.period 
                      ? `${diagnostic.period.from} até ${diagnostic.period.to}`
                      : '--'
                    }
                  </p>
                </div>
                
                {/* Records Loaded */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    Registros Carregados
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {diagnostic.recordsLoaded > 0 
                      ? `${diagnostic.recordsLoaded.toLocaleString('pt-BR')} registros`
                      : '--'
                    }
                  </p>
                </div>
                
                {/* Last Error */}
                {diagnostic.lastError && (
                  <div className="p-3 bg-destructive/10 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      Último Erro
                    </div>
                    <p className="text-sm text-destructive/80 pl-6 break-words">
                      {diagnostic.lastError}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
