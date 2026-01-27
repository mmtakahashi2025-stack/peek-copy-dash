import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FileSpreadsheet, Upload, Loader2, CheckCircle, XCircle, Trash2, Calendar } from 'lucide-react';
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

// Month names in Portuguese (uppercase for tabs)
const MONTHS_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

// Month names for display
const MONTHS_DISPLAY = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Generate year options - extended range for historical data
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1; // 1-12
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
// Result: [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]

// Smart defaults: if we're in first half of year, period likely starts in previous year
const defaultStartYear = currentMonth <= 6 ? currentYear - 1 : currentYear;
const defaultEndYear = currentMonth <= 6 ? currentYear : currentYear + 1;

// Tab naming patterns
type TabPattern = 'prefix-month' | 'month-year';

// Generate tab names for a date range
const generateTabNamesForRange = (
  startMonth: number, // 1-12
  startYear: number,
  endMonth: number,   // 1-12
  endYear: number,
  pattern: TabPattern,
  prefix: string
): string[] => {
  const tabs: string[] = [];
  let currentMonth = startMonth;
  let currentYr = startYear;
  
  // Safety limit to prevent infinite loops
  const maxIterations = 36;
  let iterations = 0;
  
  while (
    (currentYr < endYear || (currentYr === endYear && currentMonth <= endMonth)) &&
    iterations < maxIterations
  ) {
    const monthName = MONTHS_PT[currentMonth - 1];
    
    if (pattern === 'month-year') {
      tabs.push(`${monthName} ${currentYr}`);
    } else {
      tabs.push(`${prefix} ${monthName}`);
    }
    
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYr++;
    }
    iterations++;
  }
  
  return tabs;
};

// Validate that end date is not before start date
const isValidDateRange = (
  startMonth: number, 
  startYear: number, 
  endMonth: number, 
  endYear: number
): boolean => {
  if (endYear > startYear) return true;
  if (endYear === startYear && endMonth >= startMonth) return true;
  return false;
};

export function LeadsImportSection() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importAllTabs, setImportAllTabs] = useState(true);
  const [tabPrefix, setTabPrefix] = useState('LEADS');
  const [tabPattern, setTabPattern] = useState<TabPattern>('month-year');
  const [progress, setProgress] = useState({ current: 0, total: 0, currentTab: '' });
  
  // Multi-year range states with smart defaults
  const [startMonth, setStartMonth] = useState('7'); // July
  const [startYear, setStartYear] = useState(defaultStartYear.toString()); // 2025 if in Jan-Jun 2026
  const [endMonth, setEndMonth] = useState('1'); // January
  const [endYear, setEndYear] = useState(defaultEndYear.toString()); // 2026 if in Jan-Jun 2026
  
  // Clear before import options
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const [clearYear, setClearYear] = useState(currentYear.toString());
  const [clearMonth, setClearMonth] = useState<string>('all');
  const [isClearing, setIsClearing] = useState(false);

  // Calculate preview of tabs to be imported
  const tabsPreview = useMemo(() => {
    if (tabPattern === 'month-year') {
      const sMonth = parseInt(startMonth);
      const sYear = parseInt(startYear);
      const eMonth = parseInt(endMonth);
      const eYear = parseInt(endYear);
      
      if (!isValidDateRange(sMonth, sYear, eMonth, eYear)) {
        return { valid: false, tabs: [], message: 'Período final deve ser igual ou posterior ao inicial' };
      }
      
      const tabs = generateTabNamesForRange(sMonth, sYear, eMonth, eYear, tabPattern, tabPrefix);
      return { 
        valid: true, 
        tabs, 
        message: `${tabs.length} aba${tabs.length > 1 ? 's' : ''}: ${tabs[0]} → ${tabs[tabs.length - 1]}` 
      };
    }
    
    // For prefix-month pattern, show all 12 months
    const tabs = MONTHS_PT.map(month => `${tabPrefix} ${month}`);
    return { valid: true, tabs, message: `12 abas: ${tabPrefix} JANEIRO → ${tabPrefix} DEZEMBRO` };
  }, [tabPattern, startMonth, startYear, endMonth, endYear, tabPrefix]);

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

    if (!tabsPreview.valid) {
      toast.error(tabsPreview.message);
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    
    const tabNames = tabsPreview.tabs;
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

  const handleClearPeriod = async () => {
    setIsClearing(true);
    
    try {
      const year = parseInt(clearYear);
      let startDate: string;
      let endDate: string;
      
      if (clearMonth === 'all') {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
      } else {
        const month = parseInt(clearMonth);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
      }

      const { error, count } = await supabase
        .from('lead_records')
        .delete()
        .gte('record_date', startDate)
        .lte('record_date', endDate);

      if (error) throw error;

      const periodLabel = clearMonth === 'all' 
        ? `ano ${year}` 
        : `${MONTHS_DISPLAY[parseInt(clearMonth) - 1]} ${year}`;
      
      toast.success(`${count || 0} registros de ${periodLabel} apagados com sucesso!`);
      
      // Dispatch event to notify Leads page
      window.dispatchEvent(new CustomEvent('lead_records_changed'));
      
    } catch (error) {
      console.error('[Leads Clear] Error:', error);
      toast.error('Erro ao apagar registros');
    } finally {
      setIsClearing(false);
    }
  };

  const handleImport = async () => {
    // Clear period before import if option is enabled
    if (clearBeforeImport) {
      await handleClearPeriod();
    }
    
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
            Importa todas as abas do período definido
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
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Formato dos nomes das abas</Label>
            <Select value={tabPattern} onValueChange={(v) => setTabPattern(v as TabPattern)} disabled={isImporting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month-year">MÊS ANO (ex: JULHO 2025)</SelectItem>
                <SelectItem value="prefix-month">PREFIXO MÊS (ex: LEADS JULHO)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tabPattern === 'month-year' ? (
            <div className="space-y-3">
              {/* Start period */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Período Inicial
                </Label>
                <div className="flex gap-2">
                  <Select value={startMonth} onValueChange={setStartMonth} disabled={isImporting}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_DISPLAY.map((month, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    min="2020"
                    max="2035"
                    disabled={isImporting}
                    className="w-24"
                    placeholder="Ano"
                  />
                </div>
              </div>
              
              {/* End period */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Período Final
                </Label>
                <div className="flex gap-2">
                  <Select value={endMonth} onValueChange={setEndMonth} disabled={isImporting}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_DISPLAY.map((month, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                    min="2020"
                    max="2035"
                    disabled={isImporting}
                    className="w-24"
                    placeholder="Ano"
                  />
                </div>
              </div>

              {/* Tabs preview */}
              <div className={`p-2 rounded-lg text-xs ${tabsPreview.valid ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                <span className="flex items-center gap-1">
                  📋 {tabsPreview.message}
                </span>
              </div>
            </div>
          ) : (
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

      {/* Clear before import option */}
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div className="space-y-0.5">
          <Label htmlFor="clear-before-import" className="text-sm font-medium">
            Limpar período antes de importar
          </Label>
          <p className="text-xs text-muted-foreground">
            Apaga registros existentes do período selecionado
          </p>
        </div>
        <Switch
          id="clear-before-import"
          checked={clearBeforeImport}
          onCheckedChange={setClearBeforeImport}
          disabled={isImporting}
        />
      </div>

      {clearBeforeImport && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Ano</Label>
            <Select value={clearYear} onValueChange={setClearYear} disabled={isImporting}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Mês</Label>
            <Select value={clearMonth} onValueChange={setClearMonth} disabled={isImporting}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {MONTHS_DISPLAY.map((month, idx) => (
                  <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

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
        disabled={isImporting || !sheetUrl.trim() || (importAllTabs && !tabsPreview.valid)}
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

      {/* Standalone clear button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isClearing || isImporting}
            className="w-full text-destructive hover:text-destructive"
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Apagando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Apagar Leads do Período
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar registros de leads</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Selecione o período que deseja apagar:
              </p>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Ano</Label>
                  <Select value={clearYear} onValueChange={setClearYear}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Mês</Label>
                  <Select value={clearMonth} onValueChange={setClearMonth}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os meses</SelectItem>
                      {MONTHS_DISPLAY.map((month, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-destructive font-medium">
                Esta ação não pode ser desfeita!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearPeriod}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
