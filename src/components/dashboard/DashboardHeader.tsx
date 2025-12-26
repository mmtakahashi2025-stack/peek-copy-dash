import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Target, Award, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import comboLogo from '@/assets/combo-iguassu-logo.png';
import { SheetConfigDialog } from './SheetConfigDialog';

export function DashboardHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={comboLogo} alt="Combo Iguassu" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <h1 className="text-lg font-bold">Sales Ops</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Combo Iguassu - Dashboard de Vendas</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link to="/metas">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Metas</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link to="/leads">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Leads</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link to="/padrao-excelencia">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Padrão</span>
            </Link>
          </Button>
          <SheetConfigDialog />
          <span className="text-sm text-muted-foreground hidden md:block">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
