import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Package, Info, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRankingCache, RankingProduto } from '@/hooks/useRankingCache';
import { Skeleton } from '@/components/ui/skeleton';
import { RawSaleRow } from '@/contexts/SheetDataContext';

interface ProductRankingCardProps {
  year: number;
  month: number;
  filialId?: string;
  rawData?: RawSaleRow[];
}

// Helper to get top 3 sellers for a product
const getTop3Vendedores = (rawData: RawSaleRow[] | undefined, produtoNome: string): { nome: string; quantidade: number }[] => {
  if (!rawData || rawData.length === 0) return [];
  
  const vendedorMap = new Map<string, number>();
  
  rawData
    .filter(r => r.Item === produtoNome && r.Tipo !== 'PC')
    .forEach(r => {
      const vendedor = r.Emissor || 'Desconhecido';
      vendedorMap.set(vendedor, (vendedorMap.get(vendedor) || 0) + (r.Quantidade || 1));
    });
  
  return Array.from(vendedorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nome, quantidade]) => ({ nome, quantidade }));
};

export function ProductRankingCard({ year, month, filialId = 'todas', rawData }: ProductRankingCardProps) {
  const { fetchRankingProdutos, isLoading } = useRankingCache();
  const [produtos, setProdutos] = useState<RankingProduto[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadRanking = async () => {
      const data = await fetchRankingProdutos(year, month, filialId);
      if (!cancelled) {
        setProdutos(data);
        setHasLoaded(true);
      }
    };

    loadRanking();

    return () => {
      cancelled = true;
    };
  }, [year, month, filialId, fetchRankingProdutos]);

  if (isLoading && !hasLoaded) {
    return <ProductRankingCardSkeleton />;
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-chart-1" />
          Produtos Mais Vendidos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {produtos.slice(0, 10).map((produto, index) => (
            <HoverCard key={`${produto.nome}-${index}`} openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
                    index === 0 && 'bg-chart-1 text-primary-foreground',
                    index === 1 && 'bg-chart-2 text-primary-foreground',
                    index === 2 && 'bg-chart-3 text-primary-foreground',
                    index > 2 && 'bg-muted text-muted-foreground'
                  )}>
                    {index + 1}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{produto.nome}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold text-sm">{produto.quantidade} un.</p>
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-64" side="left">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    Detalhes do Produto
                  </h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Produto:</span>
                      <span className="truncate max-w-[150px]">{produto.nome}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantidade:</span>
                      <span>{produto.quantidade} unidades</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posição:</span>
                      <span>#{index + 1}</span>
                    </div>
                  </div>
                  
                  {/* Top 3 Sellers */}
                  {rawData && rawData.length > 0 && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-medium mb-1.5 text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Top 3 Vendedores:
                      </p>
                      {getTop3Vendedores(rawData, produto.nome).map((v, i) => (
                        <p key={i} className="text-xs flex justify-between">
                          <span>{i + 1}. {v.nome.length > 20 ? v.nome.substring(0, 20) + '...' : v.nome}</span>
                          <span className="font-medium">{v.quantidade} un.</span>
                        </p>
                      ))}
                      {getTop3Vendedores(rawData, produto.nome).length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhum vendedor encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
          {produtos.length === 0 && hasLoaded && (
            <div className="px-6 py-4 text-center text-muted-foreground">
              Nenhum produto encontrado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductRankingCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-chart-1" />
          Produtos Mais Vendidos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3">
              <Skeleton className="w-6 h-6 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
