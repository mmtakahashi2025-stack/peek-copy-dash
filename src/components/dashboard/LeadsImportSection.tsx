import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { FileSpreadsheet, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LeadRecord {
  collaborator_name: string;
  record_date: string;
  leads_count: number;
}

interface ImportResult {
  success: boolean;
  count: number;
  message?: string;
  details?: { tabName: string; count: number; error?: string }[];
}

// Check if column header is a date in DD/MM/YYYY format
const isDateColumn = (col: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(col);

// Convert DD/MM/YYYY to YYYY-MM-DD
const toISODate = (dateStr: string) => {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
};

// Month names in Portuguese (uppercase)
const MONTHS_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

export function LeadsImportSection() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importAllTabs, setImportAllTabs] = useState(true);
  const [tabPrefix, setTabPrefix] = useState('LEADS');
  const [progress, setProgress] = useState({ current: 0, total: 0, currentTab: '' });

  const processSheetData = (rows: Record<string, unknown>[]): LeadRecord[] => {
    const records: LeadRecord[] = [];
    
    rows.forEach((row) => {
      const collaborator = row['VENDEDOR'];
      if (!collaborator || typeof collaborator !== 'string') return;

      Object.entries(row).forEach(([col, val]) => {
        if (isDateColumn(col)) {
          const numVal = typeof val === 'number' ? val : parseInt(String(val), 10);
          if (!isNaN(numVal) && numVal > 0) {
            records.push({
              collaborator_name: String(collaborator).trim(),
              record_date: toISODate(col),
              leads_count: numVal,
            });
          }
        }
      });
    });

    return records;
  };

  const upsertRecords = async (records: LeadRecord[]): Promise<number> => {
    let successCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { error: upsertError } = await supabase
        .from('lead_records')
        .upsert(batch, { 
          onConflict: 'collaborator_name,record_date',
          ignoreDuplicates: false 
        });

      if (!upsertError) {
        successCount += batch.length;
      } else {
        console.error('[Leads Import] Batch error:', upsertError);
      }
    }

    return successCount;
  };

  const fetchSheetTab = async (url: string, tabName?: string): Promise<Record<string, unknown>[] | null> => {
    try {
      const { data: sheetData, error } = await supabase.functions.invoke('fetch-sheets', {
        body: { sheetUrl: url, sheetName: tabName },
      });

      if (error) throw error;
      
      if (!sheetData?.success || !sheetData?.data) {
        throw new Error(sheetData?.error || 'Erro ao buscar dados');
      }

      return sheetData.data as Record<string, unknown>[];
    } catch (error) {
      console.error(`[Leads Import] Error fetching tab ${tabName}:`, error);
      return null;
    }
  };

  const handleImportSingleTab = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Por favor, insira a URL da planilha');
      return;
    }

    if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('URL inválida. Use uma URL de planilha do Google Sheets.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const rows = await fetchSheetTab(sheetUrl.trim());
      
      if (!rows || rows.length === 0) {
        setImportResult({ success: false, count: 0, message: 'Planilha vazia ou sem dados válidos' });
        toast.warning('Nenhum dado encontrado na planilha');
        return;
      }

      const records = processSheetData(rows);

      if (records.length === 0) {
        setImportResult({ success: false, count: 0, message: 'Nenhum registro válido encontrado' });
        toast.warning('Nenhum registro de leads válido encontrado na planilha');
        return;
      }

      const successCount = await upsertRecords(records);

      setImportResult({ success: true, count: successCount });
      toast.success(`${successCount} registros de leads importados com sucesso!`);
      setSheetUrl('');
      
      // Dispatch event to notify Leads page
      window.dispatchEvent(new CustomEvent('lead_records_changed'));
      
    } catch (error) {
      console.error('[Leads Import] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao importar leads';
      setImportResult({ success: false, count: 0, message: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportAllTabs = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Por favor, insira a URL da planilha');
      return;
    }

    if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('URL inválida. Use uma URL de planilha do Google Sheets.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    
    const tabNames = MONTHS_PT.map(month => `${tabPrefix} ${month}`);
    const details: { tabName: string; count: number; error?: string }[] = [];
    let totalCount = 0;

    setProgress({ current: 0, total: tabNames.length, currentTab: '' });

    for (let i = 0; i < tabNames.length; i++) {
      const tabName = tabNames[i];
      setProgress({ current: i + 1, total: tabNames.length, currentTab: tabName });

      try {
        const rows = await fetchSheetTab(sheetUrl.trim(), tabName);
        
        if (!rows || rows.length === 0) {
          details.push({ tabName, count: 0, error: 'Aba não encontrada ou vazia' });
          continue;
        }

        const records = processSheetData(rows);

        if (records.length === 0) {
          details.push({ tabName, count: 0, error: 'Sem registros válidos' });
          continue;
        }

        const successCount = await upsertRecords(records);
        totalCount += successCount;
        details.push({ tabName, count: successCount });
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro';
        details.push({ tabName, count: 0, error: errorMsg });
      }
    }

    const successTabs = details.filter(d => d.count > 0).length;
    
    setImportResult({ 
      success: totalCount > 0, 
      count: totalCount, 
      message: `${successTabs}/${tabNames.length} abas importadas`,
      details 
    });
    
    if (totalCount > 0) {
      toast.success(`${totalCount} registros importados de ${successTabs} abas!`);
      setSheetUrl('');
      
      // Dispatch event to notify Leads page
      window.dispatchEvent(new CustomEvent('lead_records_changed'));
    } else {
      toast.error('Nenhum registro importado. Verifique os nomes das abas.');
    }

    setIsImporting(false);
    setProgress({ current: 0, total: 0, currentTab: '' });
  };

  const handleImport = () => {
    if (importAllTabs) {
      handleImportAllTabs();
    } else {
      handleImportSingleTab();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        <Label className="text-base font-medium">Importar Leads</Label>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Importe registros de leads de uma planilha Google Sheets com colunas de datas no formato DD/MM/AAAA.
      </p>

      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div className="space-y-0.5">
          <Label htmlFor="import-all-tabs" className="text-sm font-medium">
            Importar todas as abas (meses)
          </Label>
          <p className="text-xs text-muted-foreground">
            Importa todas as abas com o prefixo definido
          </p>
        </div>
        <Switch
          id="import-all-tabs"
          checked={importAllTabs}
          onCheckedChange={setImportAllTabs}
          disabled={isImporting}
        />
      </div>

      {importAllTabs && (
        <div className="space-y-2">
          <Label htmlFor="tab-prefix">Prefixo das abas</Label>
          <Input
            id="tab-prefix"
            value={tabPrefix}
            onChange={(e) => setTabPrefix(e.target.value.toUpperCase())}
            placeholder="LEADS"
            disabled={isImporting}
          />
          <p className="text-xs text-muted-foreground">
            Ex: "{tabPrefix} JANEIRO", "{tabPrefix} FEVEREIRO", etc.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="sheet-url">URL da planilha</Label>
        <Input
          id="sheet-url"
          type="url"
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          disabled={isImporting}
        />
      </div>

      {isImporting && progress.total > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground truncate max-w-[200px]">{progress.currentTab}</span>
            <span className="text-muted-foreground">{progress.current}/{progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} />
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={handleImport}
        disabled={isImporting || !sheetUrl.trim()}
        className="w-full"
      >
        {isImporting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            {importAllTabs ? 'Importar Todas as Abas' : 'Importar Planilha'}
          </>
        )}
      </Button>

      {importResult && (
        <div className={`p-3 rounded-lg text-sm ${
          importResult.success 
            ? 'bg-success/10 text-success' 
            : 'bg-destructive/10 text-destructive'
        }`}>
          {importResult.success ? (
            <div className="space-y-2">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {importResult.count} registros importados
                {importResult.message && ` (${importResult.message})`}
              </span>
              {importResult.details && importResult.details.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer">Ver detalhes</summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {importResult.details.map((d, i) => (
                      <li key={i} className={d.error ? 'text-muted-foreground' : ''}>
                        {d.tabName}: {d.count > 0 ? `${d.count} registros` : d.error || 'vazia'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {importResult.message || 'Erro na importação'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
