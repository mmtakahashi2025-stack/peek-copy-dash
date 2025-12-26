import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export function RankingCard({ colaboradores }: RankingCardProps) {
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
            <div
              key={colaborador.id}
              className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors"
            >
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
