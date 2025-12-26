import { useState, useCallback, useEffect } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { ProductRankingCard } from '@/components/dashboard/ProductRankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { useSheetData, KpiData } from '@/contexts/SheetDataContext';
import { FileSpreadsheet } from 'lucide-react';

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
  const { rawData, getKpis, getColaboradores, getProdutos, fetchExcellencePercentage } = useSheetData();
  
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

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  // Fetch KPIs when filters change
  useEffect(() => {
    const fetchKpis = async () => {
      // Get base KPIs from sheet data
      const baseKpis = getKpis(filters.filial, { dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      
      // Fetch excellence percentage for the selected date range
      const excellencePercentage = await fetchExcellencePercentage({ 
        dateFrom: filters.dateFrom, 
        dateTo: filters.dateTo 
      });

      // Update the Padrão Exc. KPI with the fetched value
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
        return kpi;
      });

      setKpis(updatedKpis);
    };

    fetchKpis();
  }, [filters.filial, filters.dateFrom, filters.dateTo, getKpis, fetchExcellencePercentage]);

  const colaboradores = getColaboradores(filters.filial, filters.colaborador);
  const produtos = getProdutos(filters.filial);

  const hasData = rawData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <DashboardFilters onFiltersChange={handleFiltersChange} />
        
        {!hasData && (
          // Warning banner - no data loaded
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl">
            <FileSpreadsheet className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Nenhum dado carregado</p>
              <p className="text-sm opacity-80">
                Clique em "Configurar Planilha" no canto superior direito para conectar sua planilha do Google Sheets.
              </p>
            </div>
          </div>
        )}

        {/* KPI Cards Grid - Always show 8 KPIs */}
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
            />
          ))}
        </div>
        
        {/* Chart and Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SalesEvolutionChart filialId={filters.filial} />
          <RankingCard colaboradores={colaboradores} />
          <ProductRankingCard produtos={produtos} />
        </div>
      </main>
    </div>
  );
}
