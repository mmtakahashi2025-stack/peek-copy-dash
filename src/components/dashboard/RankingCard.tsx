import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Trophy, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RawSaleRow } from '@/contexts/SheetDataContext';

interface Colaborador {
  id: number;
  nome: string;
  iniciais: string;
  vendas: number;
  conversao: string;
  faturamento: string;
  cor: string;
}

interface RankingCardProps {
  colaboradores: Colaborador[];
  rawData: RawSaleRow[];
}

function getTopProductsForSeller(rawData: RawSaleRow[], sellerName: string): { nome: string; quantidade: number }[] {
  const byProduto: Record<string, number> = {};
  
  rawData
    .filter(r => r.Emissor === sellerName)
    .forEach(row => {
      const item = row.Item;
      if (!item) return;
      byProduto[item] = (byProduto[item] || 0) + (row.Quantidade || 0);
    });
  
  return Object.entries(byProduto)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3);
}

export function RankingCard({ colaboradores, rawData }: RankingCardProps) {
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
          {colaboradores.map((colaborador, index) => {
            const topProducts = getTopProductsForSeller(rawData, colaborador.nome);
            
            return (
              <HoverCard key={colaborador.id} openDelay={200} closeDelay={100}>
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
                      colaborador.cor
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
                      <p className="font-semibold text-sm">{colaborador.faturamento}</p>
                    </div>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-72" side="left">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Top Produtos Vendidos
                    </h4>
                    {topProducts.length > 0 ? (
                      topProducts.map((product, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="truncate flex-1">{i + 1}. {product.nome}</span>
                          <span className="text-muted-foreground ml-2">{product.quantidade} un.</span>
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
        </div>
      </CardContent>
    </Card>
  );
}
