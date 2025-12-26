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
import { Settings, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { toast } from 'sonner';

const SHEET_URL_KEY = 'dashboard_sheet_url';

interface SheetConfigDialogProps {
  onDataLoaded?: (data: Record<string, string | number>[]) => void;
}

export function SheetConfigDialog({ onDataLoaded }: SheetConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const { data, columns, isLoading, error, fetchSheet } = useGoogleSheets();

  useEffect(() => {
    const savedUrl = localStorage.getItem(SHEET_URL_KEY);
    if (savedUrl) {
      setSheetUrl(savedUrl);
    }
  }, []);

  const handleTest = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Por favor, insira a URL da planilha');
      return;
    }
    await fetchSheet(sheetUrl);
  };

  const handleSave = () => {
    if (data.length > 0) {
      localStorage.setItem(SHEET_URL_KEY, sheetUrl);
      onDataLoaded?.(data);
      toast.success(`Planilha conectada! ${data.length} registros carregados.`);
      setOpen(false);
    } else {
      toast.error('Teste a conexão primeiro');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Configurar Planilha
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
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A planilha precisa estar publicada na web: Arquivo → Compartilhar → Publicar na web
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleTest}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                'Testar Conexão'
              )}
            </Button>
            <Button 
              onClick={handleSave}
              disabled={data.length === 0}
              className="flex-1"
            >
              Salvar
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {data.length > 0 && !error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">
                  Conexão bem sucedida! {data.length} registros encontrados.
                </span>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <strong>Colunas encontradas:</strong> {columns.join(', ')}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
