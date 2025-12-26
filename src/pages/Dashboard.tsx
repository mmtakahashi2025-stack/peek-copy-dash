import { useState, useCallback } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { SalesEvolutionChart } from '@/components/dashboard/SalesEvolutionChart';
import { ComparisonCard } from '@/components/dashboard/ComparisonCard';
import { getFilteredKpis, getFilteredColaboradores } from '@/data/mockData';

interface Filters {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  filial: string;
  colaborador: string;
}

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    dateFrom: new Date(2024, 0, 1),
    dateTo: new Date(),
    filial: 'todas',
    colaborador: 'todos',
  });

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  // Obter dados filtrados
  const kpis = getFilteredKpis(filters.filial);
  const colaboradores = getFilteredColaboradores(filters.filial, filters.colaborador);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <DashboardFilters onFiltersChange={handleFiltersChange} />
        
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
        
        {/* Charts and Comparison Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SalesEvolutionChart />
          <ComparisonCard />
        </div>
        
        {/* Ranking */}
        <div className="grid grid-cols-1">
          <RankingCard colaboradores={colaboradores} />
        </div>
      </main>
    </div>
  );
}
