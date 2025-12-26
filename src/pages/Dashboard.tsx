import { useState, useCallback } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { useSheetData } from '@/contexts/SheetDataContext';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';
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
        
        {!hasData ? (
          // Empty state - no data loaded
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="rounded-full bg-muted p-6 mb-6">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Nenhum dado carregado</h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Configure a conexão com sua planilha do Google Sheets para visualizar os dados de vendas.
            </p>
            <div className="flex items-center gap-2 p-4 bg-amber-500/10 text-amber-600 rounded-lg">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">
                Clique em "Configurar Planilha" no canto superior direito para começar.
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards Grid */}
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
                />
              ))}
            </div>
            
            {/* Chart and Ranking Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SalesEvolutionChart />
              <RankingCard colaboradores={colaboradores} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
