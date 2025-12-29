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
import { Loader2, CheckCircle2, AlertCircle, Database, Clock, FileText, Activity, KeyRound, User } from 'lucide-react';
import { useSheetData, LoginTestResult } from '@/contexts/SheetDataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const { rawData, isLoading, error, isConnected, diagnostic, testErpLogin } = useSheetData();
  
  // Login test state
  const [isTestingLogin, setIsTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<LoginTestResult | null>(null);

  const handleTestLogin = async () => {
    setIsTestingLogin(true);
    setLoginTestResult(null);
    
    try {
      const result = await testErpLogin();
      setLoginTestResult(result);
      
      if (result.success && result.loginSuccess) {
        toast.success(`Login OK: ${result.user?.name || 'Usuário autenticado'}`);
      } else {
        toast.error(result.error || 'Falha no login');
      }
    } finally {
      setIsTestingLogin(false);
    }
  };

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            "gap-2 transition-colors",
            isConnected 
              ? "border-green-500/50 text-green-600 hover:bg-green-500/10" 
              : "border-destructive/50 text-destructive hover:bg-destructive/10"
          )}
        >
          <div className={cn(
            "h-2 w-2 rounded-full",
            isConnected ? "bg-green-500" : "bg-destructive"
          )} />
          <span className="hidden sm:inline">
            {isConnected ? 'ERP Online' : 'ERP Offline'}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Status do ERP</DialogTitle>
          <DialogDescription>
            Visualize o status da conexão e diagnósticos do sistema ERP.
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
                  <span className="text-sm">Conectado ao ERP - {rawData.length.toLocaleString('pt-BR')} registros</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Não conectado - Use o filtro para carregar dados</span>
                </div>
              )}
            </div>

            {/* Test Login Button */}
            <Button 
              variant="outline" 
              onClick={handleTestLogin}
              disabled={isTestingLogin || isLoading}
              className="w-full gap-2"
            >
              {isTestingLogin ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Testar Conexão
            </Button>

            {/* Login Test Result */}
            {loginTestResult && (
              <div className={cn(
                "p-4 rounded-lg space-y-2",
                loginTestResult.success && loginTestResult.loginSuccess 
                  ? "bg-green-500/10 border border-green-500/20" 
                  : "bg-destructive/10 border border-destructive/20"
              )}>
                <div className="flex items-center gap-2">
                  {loginTestResult.success && loginTestResult.loginSuccess ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={cn(
                    "text-sm font-medium",
                    loginTestResult.success && loginTestResult.loginSuccess 
                      ? "text-green-600" 
                      : "text-destructive"
                  )}>
                    {loginTestResult.success && loginTestResult.loginSuccess 
                      ? 'Conexão OK' 
                      : 'Falha na Conexão'}
                  </span>
                </div>
                
                {loginTestResult.user && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
                    <User className="h-3 w-3" />
                    <span>{loginTestResult.user.name}</span>
                  </div>
                )}
                
                {loginTestResult.error && (
                  <p className="text-xs text-destructive pl-6">{loginTestResult.error}</p>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
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
  );
}