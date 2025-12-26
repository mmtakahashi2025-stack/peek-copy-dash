import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProdutoData {
  id: number;
  nome: string;
  quantidade: number;
}

interface ProductRankingCardProps {
  produtos: ProdutoData[];
}

export function ProductRankingCard({ produtos }: ProductRankingCardProps) {
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
            <div
              key={produto.id}
              className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors"
            >
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
          ))}
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
