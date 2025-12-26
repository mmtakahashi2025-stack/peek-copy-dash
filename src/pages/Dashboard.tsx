import { useState, useCallback } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { useSheetData } from '@/contexts/SheetDataContext';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';

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
  const { rawData, getKpis, getColaboradores, sheetUrl } = useSheetData();
  
  const [filters, setFilters] = useState<Filters>({
    dateFrom: new Date(2024, 11, 1),
    dateTo: new Date(2024, 11, 31),
    filial: 'todas',
    colaborador: 'todos',
    compareEnabled: false,
    compareDateFrom: new Date(2024, 10, 1),
    compareDateTo: new Date(2024, 10, 30),
  });

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  // Obter dados filtrados
  const kpis = getKpis(filters.filial);
  const colaboradores = getColaboradores(filters.filial, filters.colaborador);

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
              meta={kpi.meta}
              previousValue={kpi.previousValue}
              variation={kpi.variation}
              isPositive={kpi.isPositive}
              notFound={kpi.notFound}
            />
          ))}
        </div>
        
        {/* Chart and Ranking Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SalesEvolutionChart />
          <RankingCard colaboradores={colaboradores} />
        </div>
      </main>
    </div>
  );
}
