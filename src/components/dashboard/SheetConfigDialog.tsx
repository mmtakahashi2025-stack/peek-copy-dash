import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useSheetData } from '@/contexts/SheetDataContext';

export function SheetConfigDialog() {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const { rawData, isLoading, error, sheetUrl, loadSheet, refreshData } = useSheetData();

  useEffect(() => {
    if (sheetUrl) {
      setUrlInput(sheetUrl);
    }
  }, [sheetUrl]);

  const handleTest = async () => {
    if (!urlInput.trim()) {
      return;
    }
    await loadSheet(urlInput);
  };

  const handleSave = () => {
    if (rawData.length > 0) {
      setOpen(false);
    }
  };

  const hasData = rawData.length > 0;

  return (
    <div className="flex items-center gap-2">
      {hasData && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={refreshData}
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
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">
              {hasData ? 'Planilha' : 'Configurar Planilha'}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Conectar Google Sheets</DialogTitle>
            <DialogDescription>
              Configure a URL da sua planilha do Google Sheets para carregar os dados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sheetUrl">URL da Planilha</Label>
              <Input
                id="sheetUrl"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use a URL de publicação: Arquivo → Compartilhar → Publicar na web → TSV/CSV
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleTest}
                disabled={isLoading || !urlInput.trim()}
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
                onClick={handleSave}
                disabled={rawData.length === 0}
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
                  {rawData.length} registros carregados!
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
