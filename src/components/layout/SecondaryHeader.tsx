import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import comboLogo from '@/assets/combo-iguassu-logo.png';

interface SecondaryHeaderProps {
  title: string;
}

export function SecondaryHeader({ title }: SecondaryHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b">
      <div className="container mx-auto px-4 h-16 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img src={comboLogo} alt="Combo Iguassu" className="h-10 w-10 rounded-lg object-contain" />
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
    </header>
  );
}
