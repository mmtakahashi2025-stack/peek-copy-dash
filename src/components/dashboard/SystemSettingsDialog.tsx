import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Settings, Loader2, CheckCircle, XCircle, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetData } from '@/contexts/SheetDataContext';
import { useUserRole } from '@/hooks/useUserRole';

interface SystemSettingsDialogProps {
  triggerClassName?: string;
}

interface LeadRecord {
  collaborator_name: string;
  record_date: string;
  leads_count: number;
}

// Check if column header is a date in DD/MM/YYYY format
const isDateColumn = (col: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(col);

// Convert DD/MM/YYYY to YYYY-MM-DD
const toISODate = (dateStr: string) => {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
};

export function SystemSettingsDialog({ triggerClassName }: SystemSettingsDialogProps) {
  const { erpCredentials, refreshErpCredentials, testErpLogin } = useSheetData();
  const { canEdit } = useUserRole();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Leads import states
  const [sheetUrl, setSheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; message?: string } | null>(null);

  // Load current credentials when dialog opens
  useEffect(() => {
    if (open && erpCredentials) {
      setEmail(erpCredentials.email || '');
      setPassword('');
      setTestResult(null);
      setImportResult(null);
    }
  }, [open, erpCredentials]);

  const handleSave = async () => {
    if (!email.trim()) {
      toast.error('Por favor, digite o email do ERP');
      return;
    }
    if (!password.trim() && !erpCredentials?.hasPassword) {
      toast.error('Por favor, digite a senha do ERP');
      return;
    }

    setIsSaving(true);
    try {
      // Use the secure RPC function to save system-wide credentials
      const { error } = await supabase.rpc('save_system_erp_credentials', {
        p_email: email.trim(),
        p_password: password.trim() || null
      });

      if (error) throw error;

      toast.success('Credenciais do ERP salvas com sucesso!');
      setPassword('');
      await refreshErpCredentials();
      setOpen(false);
    } catch (error) {
      console.error('Error saving ERP credentials:', error);
      toast.error('Erro ao salvar credenciais do ERP. Verifique se você tem permissão de administrador.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testErpLogin();
      if (result.success && result.loginSuccess) {
        setTestResult('success');
        toast.success('Conexão com ERP bem-sucedida!');
      } else {
        setTestResult('error');
        toast.error(result.error || 'Falha na conexão com ERP');
      }
    } catch {
      setTestResult('error');
      toast.error('Erro ao testar conexão');
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportLeads = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Por favor, insira a URL da planilha');
      return;
    }

    // Validate URL format
    if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('URL inválida. Use uma URL de planilha do Google Sheets.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      // Get JWT token for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Usuário não autenticado');
      }

      // Fetch sheet data via edge function
      const { data: sheetData, error: fetchError } = await supabase.functions.invoke('fetch-sheets', {
        body: { sheetUrl: sheetUrl.trim() },
      });

      if (fetchError) throw fetchError;
      
      if (!sheetData?.success || !sheetData?.data) {
        throw new Error(sheetData?.error || 'Erro ao buscar dados da planilha');
      }

      const rows = sheetData.data as Record<string, unknown>[];
      
      if (rows.length === 0) {
        setImportResult({ success: false, count: 0, message: 'Planilha vazia ou sem dados válidos' });
        toast.warning('Nenhum dado encontrado na planilha');
        return;
      }

      // Process rows into lead records
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

      if (records.length === 0) {
        setImportResult({ success: false, count: 0, message: 'Nenhum registro válido encontrado' });
        toast.warning('Nenhum registro de leads válido encontrado na planilha');
        return;
      }

      console.log(`[Leads Import] Processando ${records.length} registros...`);

      // Upsert in batches of 100
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

        if (upsertError) {
          console.error('[Leads Import] Batch error:', upsertError);
          // Continue with remaining batches
        } else {
          successCount += batch.length;
        }
      }

      setImportResult({ success: true, count: successCount });
      toast.success(`${successCount} registros de leads importados com sucesso!`);
      setSheetUrl('');
      
    } catch (error) {
      console.error('[Leads Import] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao importar leads';
      setImportResult({ success: false, count: 0, message: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={triggerClassName}>
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações do Sistema
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais do ERP que serão usadas por todos os usuários para buscar dados de vendas.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-1">Status atual:</p>
            <p className="text-muted-foreground">
              {erpCredentials?.hasPassword ? (
                <span className="text-success flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> ERP configurado
                </span>
              ) : (
                <span className="text-warning flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> ERP não configurado
                </span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="erp-email">Email do ERP</Label>
            <Input
              id="erp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="erp-password">
              Senha do ERP
              {erpCredentials?.hasPassword && (
                <span className="text-xs text-muted-foreground ml-2">(deixe em branco para manter atual)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="erp-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={erpCredentials?.hasPassword ? '••••••••' : 'Digite a senha'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {erpCredentials?.hasPassword && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : testResult === 'success' ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2 text-success" />
                  Conexão OK
                </>
              ) : testResult === 'error' ? (
                <>
                  <XCircle className="h-4 w-4 mr-2 text-destructive" />
                  Falhou - Testar novamente
                </>
              ) : (
                'Testar Conexão'
              )}
            </Button>
          )}

          {/* Leads Import Section - Admin Only */}
          {canEdit && (
            <>
              <Separator className="my-4" />
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <Label className="text-base font-medium">Importar Leads</Label>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Importe registros de leads de uma planilha Google Sheets com colunas de datas no formato DD/MM/AAAA.
                </p>

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

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportLeads}
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
                      Importar Planilha
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
                      <span className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {importResult.count} registros importados
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {importResult.message || 'Erro na importação'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !email.trim()}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
