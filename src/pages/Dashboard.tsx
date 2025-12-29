import { useState, useCallback, useEffect } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { ProductRankingCard } from '@/components/dashboard/ProductRankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { ErpPasswordDialog } from '@/components/dashboard/ErpPasswordDialog';
import { useSheetData, KpiData } from '@/contexts/SheetDataContext';
import { Loader2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Filters {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  filial: string;
  colaborador: string;
  compareEnabled: boolean;
  compareDateFrom: Date | undefined;
  compareDateTo: Date | undefined;
}

export default function Dashboard() {
  const { rawData, isLoading, isConnected, getKpis, getColaboradores, getProdutos, fetchExcellencePercentage, fetchLeadsTotal, loadErpData, erpCredentials, refreshErpCredentials } = useSheetData();
  
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    dateTo: new Date(),
    filial: 'todas',
    colaborador: 'todos',
    compareEnabled: false,
    compareDateFrom: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    compareDateTo: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
  });

  const [kpis, setKpis] = useState<KpiData[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  // Auto-load ERP data on mount if credentials are available and not already loaded
  useEffect(() => {
    if (
      !initialLoadDone && 
      !isLoading && 
      !isConnected && 
      erpCredentials?.hasPassword
    ) {
      setInitialLoadDone(true);
      loadErpData(filters.dateFrom, filters.dateTo);
    }
  }, [initialLoadDone, isLoading, isConnected, erpCredentials?.hasPassword, loadErpData, filters.dateFrom, filters.dateTo]);

  // Fetch KPIs when filters change
  useEffect(() => {
    const fetchKpis = async () => {
      const [excellencePercentage, leadsTotal] = await Promise.all([
        fetchExcellencePercentage({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
        fetchLeadsTotal({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
      ]);

      const baseKpis = getKpis(
        filters.filial, 
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        leadsTotal ?? undefined
      );

      const updatedKpis = baseKpis.map(kpi => {
        if (kpi.id === 'padrao-exc') {
          return {
            ...kpi,
            value: excellencePercentage !== null ? `${excellencePercentage.toFixed(1)}%` : '--',
            rawValue: excellencePercentage ?? undefined,
            isPositive: excellencePercentage !== null ? excellencePercentage >= 90 : true,
            notFound: excellencePercentage === null,
          };
        }
        if (kpi.id === 'leads') {
          return {
            ...kpi,
            value: leadsTotal !== null ? leadsTotal.toLocaleString('pt-BR') : '--',
            rawValue: leadsTotal ?? undefined,
            isPositive: true,
            notFound: leadsTotal === null,
          };
        }
        return kpi;
      });

      setKpis(updatedKpis);
    };

    fetchKpis();
  }, [filters.filial, filters.dateFrom, filters.dateTo, getKpis, fetchExcellencePercentage, fetchLeadsTotal]);

  // Reload data when date filters change
  useEffect(() => {
    if (isConnected && filters.dateFrom && filters.dateTo) {
      loadErpData(filters.dateFrom, filters.dateTo);
    }
  }, [filters.dateFrom, filters.dateTo]);

  const colaboradores = getColaboradores(filters.filial, filters.colaborador);
  const produtos = getProdutos(filters.filial);

  const hasData = rawData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <DashboardFilters onFiltersChange={handleFiltersChange} />
        
        {isLoading && (
          <div className="flex items-center justify-center gap-3 p-8 bg-primary/5 border border-primary/20 rounded-xl">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Carregando dados do ERP...</span>
          </div>
        )}

        {/* ERP Password Warning */}
        {!erpCredentials?.hasPassword && !isLoading && (
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl">
            <KeyRound className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Configure sua senha do ERP</p>
              <p className="text-sm opacity-80">
                Para carregar os dados de vendas, você precisa configurar sua senha do ERP.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowPasswordDialog(true)}
            >
              Configurar Senha
            </Button>
          </div>
        )}


        {/* ERP Password Dialog */}
        <ErpPasswordDialog 
          open={showPasswordDialog} 
          onOpenChange={setShowPasswordDialog}
          onSaved={refreshErpCredentials}
        />

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              title={kpi.title}
              value={kpi.value}
              rawValue={kpi.rawValue}
              meta={kpi.meta}
              targetValue={kpi.targetValue}
              previousValue={kpi.previousValue}
              variation={kpi.variation}
              isPositive={kpi.isPositive}
              notFound={kpi.notFound}
              source={kpi.source}
            />
          ))}
        </div>
        
        {/* Chart and Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SalesEvolutionChart 
            filialId={filters.filial}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            compareEnabled={filters.compareEnabled}
            compareDateFrom={filters.compareDateFrom}
            compareDateTo={filters.compareDateTo}
          />
          <RankingCard colaboradores={colaboradores} />
          <ProductRankingCard produtos={produtos} />
        </div>
      </main>
    </div>
  );
}
