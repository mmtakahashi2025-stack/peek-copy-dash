import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, ArrowLeftRight, Search, Loader2 } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { filiaisData, colaboradoresData } from '@/data/mockData';
import { DateRange } from 'react-day-picker';

interface DashboardFiltersProps {
  onFiltersChange?: (filters: {
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
    filial: string;
    colaborador: string;
    compareEnabled: boolean;
    compareDateFrom: Date | undefined;
    compareDateTo: Date | undefined;
  }) => void;
}

export function DashboardFilters({ onFiltersChange }: DashboardFiltersProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(2024, 11, 1),
    to: new Date(2024, 11, 31),
  });
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>({
    from: new Date(2024, 10, 1),
    to: new Date(2024, 10, 30),
  });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [filial, setFilial] = useState('todas');
  const [colaborador, setColaborador] = useState('todos');
  const [isLoading, setIsLoading] = useState(false);

  // Filtrar colaboradores baseado na filial selecionada
  const filteredColaboradores = filial === 'todas' 
    ? colaboradoresData 
    : colaboradoresData.filter(c => c.filial === filial);

  // Aplicar filtros iniciais ao montar o componente
  useEffect(() => {
    handleApplyFilters();
  }, []);

  const handleApplyFilters = async () => {
    setIsLoading(true);
    
    // Simular tempo de busca
    await new Promise(resolve => setTimeout(resolve, 800));
    
    onFiltersChange?.({
      dateFrom: dateRange?.from,
      dateTo: dateRange?.to,
      filial,
      colaborador,
      compareEnabled,
      compareDateFrom: compareDateRange?.from,
      compareDateTo: compareDateRange?.to,
    });
    
    setIsLoading(false);
  };

  // Reset colaborador quando mudar filial
  useEffect(() => {
    if (filial !== 'todas') {
      const colaboradorExiste = filteredColaboradores.some(c => c.id.toString() === colaborador);
      if (!colaboradorExiste && colaborador !== 'todos') {
        setColaborador('todos');
      }
    }
  }, [filial, colaborador, filteredColaboradores]);

  const formatDateRange = (range: DateRange | undefined) => {
    if (!range?.from) return 'Selecionar período';
    if (!range.to) return format(range.from, 'dd/MM/yy', { locale: ptBR });
    return `${format(range.from, 'dd/MM', { locale: ptBR })} - ${format(range.to, 'dd/MM/yy', { locale: ptBR })}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-xl shadow-sm border">
      {/* Date Range Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'justify-start text-left font-normal min-w-[180px]',
              !dateRange && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange(dateRange)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            locale={ptBR}
            numberOfMonths={2}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Compare Toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={compareEnabled}
          onCheckedChange={setCompareEnabled}
          className="data-[state=checked]:bg-primary"
        />
        <span className="text-sm text-muted-foreground">Comparar</span>
      </div>

      {compareEnabled && (
        <>
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          
          {/* Compare Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="default"
                className="justify-start text-left font-normal min-w-[180px] bg-warning text-warning-foreground hover:bg-warning/90"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDateRange(compareDateRange)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={compareDateRange}
                onSelect={setCompareDateRange}
                locale={ptBR}
                numberOfMonths={2}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </>
      )}

      <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

      {/* Filial Select */}
      <Select value={filial} onValueChange={setFilial}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Selecione a filial" />
        </SelectTrigger>
        <SelectContent>
          {filiaisData.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Colaborador Select */}
      <Select value={colaborador} onValueChange={setColaborador}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Selecione o colaborador" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os Colaboradores</SelectItem>
          {filteredColaboradores.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

      {/* Filtrar Button */}
      <Button className="gap-2" onClick={handleApplyFilters} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {isLoading ? 'Buscando...' : 'Filtrar'}
      </Button>
    </div>
  );
}
