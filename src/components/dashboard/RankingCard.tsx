import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Trophy, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { RawSaleRow } from '@/contexts/SheetDataContext';

interface RankingCardProps {
  rawData?: RawSaleRow[];
  filialId?: string;
}

const colors = ['bg-primary', 'bg-success', 'bg-warning', 'bg-chart-4', 'bg-chart-5', 'bg-primary/80', 'bg-success/80', 'bg-warning/80'];

// Helper functions
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).filter(Boolean).join('').substring(0, 2).toUpperCase();
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`;
  return `R$ ${value.toFixed(2)}`;
}

function normalizeFilial(filial: string): string {
  return filial?.toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '') || 'todas';
}

// Helper to get top 3 products for a collaborator
const getTop3Produtos = (rawData: RawSaleRow[] | undefined, colaboradorNome: string): { nome: string; quantidade: number }[] => {
  if (!rawData || rawData.length === 0) return [];
  
  const produtoMap = new Map<string, number>();
  
  rawData
    .filter(r => r.Emissor === colaboradorNome && r.Tipo !== 'PC')
    .forEach(r => {
      const produto = r.Item || 'Desconhecido';
      produtoMap.set(produto, (produtoMap.get(produto) || 0) + (r.Quantidade || 1));
    });
  
  return Array.from(produtoMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nome, quantidade]) => ({ nome, quantidade }));
};

export function RankingCard({ rawData, filialId = 'todas' }: RankingCardProps) {
  // Calculate ranking directly from rawData
  const colaboradores = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    
    // Filter by type and filial
    let filteredData = rawData.filter(r => r.Tipo !== 'PC');
    if (filialId && filialId !== 'todas') {
      filteredData = filteredData.filter(r => 
        normalizeFilial(r.Filial) === filialId
      );
    }
    
    // Group by collaborator
    const colaboradorMap = new Map<string, { faturamento: number; vendas: Set<number> }>();
    
    filteredData.forEach(r => {
      const nome = r.Emissor || 'Desconhecido';
      const current = colaboradorMap.get(nome) || { faturamento: 0, vendas: new Set() };
      current.faturamento += r.Líquido || 0;
      if (r['Venda #']) current.vendas.add(r['Venda #']);
      colaboradorMap.set(nome, current);
    });
    
    // Convert to array, sort by revenue, and take top 10
    return Array.from(colaboradorMap.entries())
      .map(([nome, data]) => ({
        nome,
        iniciais: getInitials(nome),
        vendas: data.vendas.size,
        faturamento: data.faturamento,
        faturamentoFormatado: formatCurrency(data.faturamento),
        conversao: '--',
      }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 10);
  }, [rawData, filialId]);

  const hasData = rawData && rawData.length > 0;

  if (!hasData) {
    return <RankingCardSkeleton />;
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-warning" />
          Ranking de Colaboradores
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {colaboradores.map((colaborador, index) => (
            <HoverCard key={`${colaborador.nome}-${index}`} openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
                    index === 0 && 'bg-warning text-warning-foreground',
                    index === 1 && 'bg-muted-foreground/30 text-foreground',
                    index === 2 && 'bg-warning/50 text-foreground',
                    index > 2 && 'bg-muted text-muted-foreground'
                  )}>
                    {index + 1}
                  </span>
                  
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-primary-foreground',
                    colors[index % colors.length]
                  )}>
                    {colaborador.iniciais}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{colaborador.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {colaborador.vendas} vendas • {colaborador.conversao} conv.
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold text-sm">{colaborador.faturamentoFormatado}</p>
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" side="left">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Detalhes do Colaborador
                  </h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vendas:</span>
                      <span>{colaborador.vendas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Faturamento:</span>
                      <span>{colaborador.faturamentoFormatado}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conversão:</span>
                      <span>{colaborador.conversao}</span>
                    </div>
                  </div>
                  
                  {/* Top 3 Products */}
                  {rawData && rawData.length > 0 && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-medium mb-1.5 text-muted-foreground">Top 3 Produtos Vendidos:</p>
                      {getTop3Produtos(rawData, colaborador.nome).map((p, i) => (
                        <p key={i} className="text-xs flex justify-between">
                          <span>{i + 1}. {p.nome.length > 25 ? p.nome.substring(0, 25) + '...' : p.nome}</span>
                          <span className="font-medium">{p.quantidade} un.</span>
                        </p>
                      ))}
                      {getTop3Produtos(rawData, colaborador.nome).length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhum produto encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
          {colaboradores.length === 0 && (
            <div className="px-6 py-4 text-center text-muted-foreground">
              Nenhum colaborador encontrado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RankingCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-warning" />
          Ranking de Colaboradores
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
