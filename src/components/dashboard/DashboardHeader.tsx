import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { LogOut, Target, Award, Users, Menu, LayoutDashboard, UserCog } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import comboLogo from '@/assets/combo-iguassu-logo.png';
import { SheetConfigDialog } from './SheetConfigDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

const menuItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/metas', icon: Target, label: 'Metas' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/padrao-excelencia', icon: Award, label: 'Padrão' },
];

export function DashboardHeader() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  const handleNavigate = () => setOpen(false);

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

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Button
                key={item.to}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                asChild
                className="gap-2"
              >
                <Link to={item.to}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
          {isAdmin && (
            <Button
              variant={location.pathname === '/usuarios' ? 'secondary' : 'ghost'}
              size="sm"
              asChild
              className="gap-2"
            >
              <Link to="/usuarios">
                <UserCog className="h-4 w-4" />
                Usuários
              </Link>
            </Button>
          )}
          <SheetConfigDialog />
          <span className="text-sm text-muted-foreground">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMobile && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 mt-6">
                {menuItems.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <Button
                      key={item.to}
                      variant={isActive ? 'secondary' : 'ghost'}
                      className="justify-start gap-3 h-12"
                      asChild
                      onClick={handleNavigate}
                    >
                      <Link to={item.to}>
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    </Button>
                  );
                })}
                
                {isAdmin && (
                  <Button
                    variant={location.pathname === '/usuarios' ? 'secondary' : 'ghost'}
                    className="justify-start gap-3 h-12"
                    asChild
                    onClick={handleNavigate}
                  >
                    <Link to="/usuarios">
                      <UserCog className="h-5 w-5" />
                      Usuários
                    </Link>
                  </Button>
                )}
                
                <div className="border-t my-4" />
                
                <SheetConfigDialog />
                
                <div className="border-t my-4" />
                
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {user?.email}
                </div>
                
                <Button variant="ghost" className="justify-start gap-3 h-12 text-destructive hover:text-destructive" onClick={() => { signOut(); setOpen(false); }}>
                  <LogOut className="h-5 w-5" />
                  Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </header>
  );
}
