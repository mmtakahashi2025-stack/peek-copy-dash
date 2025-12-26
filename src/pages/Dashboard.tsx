import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICard } from '@/components/dashboard/KPICard';
import { RankingCard } from '@/components/dashboard/RankingCard';
import { kpisData, colaboradoresData } from '@/data/mockData';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <DashboardFilters />
        
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpisData.map((kpi) => (
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
        
        {/* Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankingCard colaboradores={colaboradoresData} />
          
          {/* Placeholder for future chart */}
          <div className="bg-card rounded-xl border p-6 flex items-center justify-center min-h-[400px]">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Gráfico de Evolução</p>
              <p className="text-sm">Em breve</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
