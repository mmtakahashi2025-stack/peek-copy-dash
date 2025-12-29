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
import { Settings, Loader2, CheckCircle2, AlertCircle, RefreshCw, Database } from 'lucide-react';
import { useSheetData } from '@/contexts/SheetDataContext';

export function SheetConfigDialog() {
  const [open, setOpen] = useState(false);
  const { rawData, isLoading, error, isConnected, loadErpData, refreshData } = useSheetData();

  const handleRefresh = async () => {
    await refreshData();
  };

  const handleLoadData = async () => {
    await loadErpData();
  };

  const hasData = rawData.length > 0;

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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Conexão com ERP</DialogTitle>
            <DialogDescription>
              Os dados de vendas são carregados automaticamente do sistema ERP.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
