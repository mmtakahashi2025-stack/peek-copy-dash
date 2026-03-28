import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Settings, Loader2, CheckCircle, XCircle, RefreshCw, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetData } from '@/contexts/SheetDataContext';
import { useUserRole } from '@/contexts/UserRoleContext';
import { LeadsImportSection } from './LeadsImportSection';

interface SystemSettingsDialogProps {
  triggerClassName?: string;
}

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
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateStatus, setRecalculateStatus] = useState<string | null>(null);

  // Load current credentials when dialog opens
  useEffect(() => {
    if (open && erpCredentials) {
      setEmail(erpCredentials.email || '');
      setPassword('');
      setTestResult(null);
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

  const handleRecalculateAggregates = async () => {
    setIsRecalculating(true);
    setRecalculateStatus('Iniciando recálculo...');
    
    try {
      const response = await supabase.functions.invoke('recalculate-aggregates', {
        body: { forceAll: true },
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;
      setRecalculateStatus(
        `✅ Concluído: ${result.processed} meses, ${result.dailyAggregates} agregados diários, ${result.rankingEntries} rankings`
      );
      toast.success('Agregados recalculados com sucesso!');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setRecalculateStatus(`❌ Erro: ${errorMessage}`);
      toast.error('Erro ao recalcular agregados');
    } finally {
      setIsRecalculating(false);
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
                size="icon"
                className="absolute right-0 top-0 h-full w-10 px-0 hover:bg-transparent z-10"
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
              <LeadsImportSection />
            </>
          )}

          {/* Data Maintenance Section - Admin Only */}
          {canEdit && (
            <>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Manutenção de Dados</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Recalcular todos os agregados de performance. Útil após importação de dados ou correção de bugs.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculateAggregates}
                  disabled={isRecalculating}
                  className="w-full"
                >
                  {isRecalculating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Recalcular Agregados Históricos
                    </>
                  )}
                </Button>
                {recalculateStatus && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {recalculateStatus}
                  </p>
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
