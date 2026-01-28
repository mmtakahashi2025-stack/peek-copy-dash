import { useState, useCallback, useEffect } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard, KPICardSkeleton } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { ProductRankingCard } from '@/components/dashboard/ProductRankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { LoadingProgress } from '@/components/dashboard/LoadingProgress';
import { useSheetData, KpiData } from '@/contexts/SheetDataContext';
import { useUserRole } from '@/hooks/useUserRole';
import { KeyRound, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SystemSettingsDialog } from '@/components/dashboard/SystemSettingsDialog';

interface Filters {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  filial: string;
  filiais: string[];
  colaborador: string;
  colaboradores: string[];
  compareEnabled: boolean;
  compareDateFrom: Date | undefined;
  compareDateTo: Date | undefined;
}

export default function Dashboard() {
  const { rawData, isLoading, isConnected, getKpis, fetchExcellencePercentage, fetchLeadsTotal, loadErpData, cancelLoading, erpCredentials, loadingProgress } = useSheetData();
  const { isAdmin } = useUserRole();
  
  // Default to last complete month
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
  
  const [filters, setFilters] = useState<Filters>({
    dateFrom: lastMonthStart,
    dateTo: lastMonthEnd,
    filial: 'todas',
    filiais: ['todas'],
    colaborador: 'todos',
    colaboradores: ['todos'],
    compareEnabled: false,
    compareDateFrom: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1),
    compareDateTo: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 0),
  });

  const [kpis, setKpis] = useState<KpiData[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  // Trigger pulse animation when data changes
  useEffect(() => {
    if (rawData.length > 0) {
      setDataRefreshKey(prev => prev + 1);
    }
  }, [rawData]);

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  // Auto-load ERP data on mount if credentials are available and not already loaded
  // Only admin can trigger API fetch; non-admin will only see cached data
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

  // Reload data when date filters change (don't depend on isConnected to allow non-admin to load cache)
  useEffect(() => {
    if (filters.dateFrom && filters.dateTo && erpCredentials?.hasPassword) {
      loadErpData(filters.dateFrom, filters.dateTo);
    }
  }, [filters.dateFrom, filters.dateTo, erpCredentials?.hasPassword, loadErpData]);

  // These are now fetched directly from cache in the ranking components
  // Keeping the hasData check based on rawData for loading states

  const hasData = rawData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <DashboardFilters onFiltersChange={handleFiltersChange} />
        

        {/* ERP Not Configured Warning */}
        {!erpCredentials?.hasPassword && !isLoading && (
          <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 text-warning-foreground rounded-xl">
            <KeyRound className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Conexão com ERP não configurada</p>
              <p className="text-sm opacity-80">
                {isAdmin 
                  ? 'Configure as credenciais do ERP nas configurações do sistema para carregar dados de vendas.'
                  : 'O administrador precisa configurar as credenciais do ERP para exibir dados de vendas.'}
              </p>
            </div>
            {isAdmin && (
              <SystemSettingsDialog triggerClassName="gap-2" />
            )}
          </div>
        )}

        {/* No Data Warning for Non-Admin */}
        {!isAdmin && !isLoading && !hasData && erpCredentials?.hasPassword && (
          <div className="flex items-center gap-3 p-4 bg-muted/50 border border-border text-muted-foreground rounded-xl">
            <KeyRound className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Aguardando dados do ERP</p>
              <p className="text-sm opacity-80">
                O administrador precisa carregar os dados do ERP para que você possa visualizá-los.
              </p>
            </div>
          </div>
        )}

        {/* Loading Progress Indicator */}
        <LoadingProgress progress={loadingProgress} onCancel={cancelLoading} />

        {/* Label de dados visualizados */}
        {hasData && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
            <span className="font-medium">Visualizando:</span>
            <span>
              {filters.dateFrom?.toLocaleDateString('pt-BR')} a {filters.dateTo?.toLocaleDateString('pt-BR')}
            </span>
            {filters.filial !== 'todas' && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>Filial: {filters.filial}</span>
              </>
            )}
            <span className="text-muted-foreground/50">|</span>
            <span>{rawData.length.toLocaleString('pt-BR')} registros</span>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            <>
              <KPICardSkeleton />
              <KPICardSkeleton />
              <KPICardSkeleton />
              <KPICardSkeleton />
            </>
          ) : (
            kpis.map((kpi) => (
              <KPICard
                key={`${kpi.id}-${dataRefreshKey}`}
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
                animationKey={dataRefreshKey}
              />
            ))
          )}
        </div>
        
        {/* Chart - Full Width */}
        <SalesEvolutionChart 
          filialId={filters.filial}
          colaboradorId={filters.colaborador}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          compareEnabled={filters.compareEnabled}
          compareDateFrom={filters.compareDateFrom}
          compareDateTo={filters.compareDateTo}
        />
        
        {/* Rankings Side by Side - Using pre-calculated cache + rawData for tooltips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard 
            year={filters.dateFrom?.getFullYear() ?? new Date().getFullYear()} 
            month={(filters.dateFrom?.getMonth() ?? new Date().getMonth() - 1) + 1} 
            filialId={filters.filial}
            rawData={rawData}
          />
          <ProductRankingCard 
            year={filters.dateFrom?.getFullYear() ?? new Date().getFullYear()} 
            month={(filters.dateFrom?.getMonth() ?? new Date().getMonth() - 1) + 1} 
            filialId={filters.filial}
            rawData={rawData}
          />
        </div>
      </main>
    </div>
  );
}
