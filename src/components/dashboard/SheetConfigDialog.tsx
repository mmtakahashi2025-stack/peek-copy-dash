import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Database, Clock, FileText, Activity, CalendarIcon, KeyRound, User } from 'lucide-react';
import { useSheetData, LoginTestResult } from '@/contexts/SheetDataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
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
  const { rawData, isLoading, error, isConnected, diagnostic, loadErpData, refreshData, testErpLogin } = useSheetData();
  
  // Date range state - default to current month
  const now = new Date();
  const [dateFrom, setDateFrom] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [dateTo, setDateTo] = useState<Date>(now);

  // Login test state
  const [isTestingLogin, setIsTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<LoginTestResult | null>(null);

  const handleRefresh = async () => {
    await refreshData();
  };

  const handleLoadData = async () => {
    await loadErpData(dateFrom, dateTo);
  };

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

              {/* Date Range Selection */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  <span className="font-medium">Período de Consulta</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Data Início</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={(date) => date && setDateFrom(date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Data Fim</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={(date) => date && setDateTo(date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleTestLogin}
                  disabled={isTestingLogin || isLoading}
                  className="gap-2"
                >
                  {isTestingLogin ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Testar Login
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLoadData}
                  disabled={isLoading || isTestingLogin}
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
              </div>

              <Button 
                onClick={() => setOpen(false)}
                className="w-full"
              >
                Fechar
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
                        ? 'Login Bem-sucedido' 
                        : 'Falha no Login'}
                    </span>
                  </div>
                  
                  {loginTestResult.user && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
                      <User className="h-3 w-3" />
                      <span>{loginTestResult.user.name} ({loginTestResult.user.email})</span>
                    </div>
                  )}
                  
                  {loginTestResult.session && (
                    <div className="text-xs text-muted-foreground pl-6 space-y-1">
                      <p>Token: {loginTestResult.session.hasToken ? '✓' : '✗'}</p>
                      <p>ERPSession: {loginTestResult.session.hasERPSession ? '✓' : '✗'}</p>
                      <p>device_id: {loginTestResult.session.hasDeviceId ? '✓' : '✗'}</p>
                    </div>
                  )}
                  
                  {loginTestResult.message && (
                    <p className="text-xs text-muted-foreground pl-6">{loginTestResult.message}</p>
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
