import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Package, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RawSaleRow } from '@/contexts/SheetDataContext';

export interface ProdutoData {
  id: number;
  nome: string;
  quantidade: number;
}

interface ProductRankingCardProps {
  produtos: ProdutoData[];
  rawData: RawSaleRow[];
}

function getTopSellersForProduct(rawData: RawSaleRow[], productName: string): { nome: string; quantidade: number }[] {
  const byEmissor: Record<string, number> = {};
  
  rawData
    .filter(r => r.Item === productName)
    .forEach(row => {
      const emissor = row.Emissor;
      if (!emissor) return;
      byEmissor[emissor] = (byEmissor[emissor] || 0) + (row.Quantidade || 0);
    });
  
  return Object.entries(byEmissor)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3);
}

export function ProductRankingCard({ produtos, rawData }: ProductRankingCardProps) {
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
          {produtos.slice(0, 10).map((produto, index) => {
            const topSellers = getTopSellersForProduct(rawData, produto.nome);
            
            return (
              <HoverCard key={produto.id} openDelay={200} closeDelay={100}>
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
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Top Vendedores
                    </h4>
                    {topSellers.length > 0 ? (
                      topSellers.map((seller, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="truncate flex-1">{i + 1}. {seller.nome}</span>
                          <span className="text-muted-foreground ml-2">{seller.quantidade} un.</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })}
          {produtos.length === 0 && (
            <div className="px-6 py-4 text-center text-muted-foreground">
              Nenhum produto encontrado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
