import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, ArrowLeftRight, Search, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSheetData } from '@/contexts/SheetDataContext';
import { DateRange } from 'react-day-picker';

type DatePreset = {
  label: string;
  getValue: () => DateRange;
};

const datePresets: DatePreset[] = [
  { label: 'Hoje', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Ontem', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: '7 dias', getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: '30 dias', getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'Semana', getValue: () => ({ from: startOfWeek(new Date(), { locale: ptBR }), to: endOfWeek(new Date(), { locale: ptBR }) }) },
  { label: 'Mês', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Mês anterior', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'Ano', getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
];

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
  const { filiais, getColaboradores } = useSheetData();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: endOfMonth(subMonths(new Date(), 1)),
  });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [filial, setFilial] = useState('todas');
  const [colaborador, setColaborador] = useState('todos');
  const [isLoading, setIsLoading] = useState(false);

  // Get colaboradores based on selected filial
  const colaboradoresData = getColaboradores(filial);

  // Aplicar filtros iniciais ao montar o componente
  useEffect(() => {
    handleApplyFilters();
  }, []);

  const handleApplyFilters = async () => {
    setIsLoading(true);
    
    // Simular tempo de busca
    await new Promise(resolve => setTimeout(resolve, 300));
    
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
      const colaboradorExiste = colaboradoresData.some(c => c.id.toString() === colaborador);
      if (!colaboradorExiste && colaborador !== 'todos') {
        setColaborador('todos');
      }
    }
  }, [filial, colaborador, colaboradoresData]);

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
          <div className="flex">
            <div className="border-r p-1 flex flex-col gap-0.5">
              {datePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 justify-start text-xs font-normal"
                  onClick={() => setDateRange(preset.getValue())}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) => {
                // When only one day is clicked, set both from and to to the same date
                if (range?.from && !range?.to) {
                  setDateRange({ from: range.from, to: range.from });
                } else {
                  setDateRange(range);
                }
              }}
              locale={ptBR}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Compare Toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={compareEnabled}
          onCheckedChange={(enabled) => {
            setCompareEnabled(enabled);
            if (enabled && dateRange?.from && dateRange?.to) {
              // Set compare range to same period last year
              setCompareDateRange({
                from: subYears(dateRange.from, 1),
                to: subYears(dateRange.to, 1),
              });
            }
          }}
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
                onSelect={(range) => {
                  // When only one day is clicked, set both from and to to the same date
                  if (range?.from && !range?.to) {
                    setCompareDateRange({ from: range.from, to: range.from });
                  } else {
                    setCompareDateRange(range);
                  }
                }}
                locale={ptBR}
                numberOfMonths={2}
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
          {filiais.map((f) => (
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
          {colaboradoresData.map((c) => (
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
