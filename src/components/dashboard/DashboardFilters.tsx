import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon, ArrowLeftRight, Search, Loader2, Building2, Users, ChevronDown, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSheetData } from '@/contexts/SheetDataContext';
import { DateRange } from 'react-day-picker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CacheInfoButton } from './CacheInfoButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    filiais: string[];
    colaborador: string;
    colaboradores: string[];
    compareEnabled: boolean;
    compareDateFrom: Date | undefined;
    compareDateTo: Date | undefined;
  }) => void;
}

export function DashboardFilters({ onFiltersChange }: DashboardFiltersProps) {
  const { filiais, colaboradores: allColaboradores, loadErpData, getCacheInfo } = useSheetData();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: endOfMonth(subMonths(new Date(), 1)),
  });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [selectedFiliais, setSelectedFiliais] = useState<string[]>(['todas']);
  const [selectedColaboradores, setSelectedColaboradores] = useState<string[]>(['todos']);
  const [isLoading, setIsLoading] = useState(false);

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
      filial: selectedFiliais.includes('todas') ? 'todas' : selectedFiliais[0] || 'todas',
      filiais: selectedFiliais,
      colaborador: selectedColaboradores.includes('todos') ? 'todos' : selectedColaboradores[0] || 'todos',
      colaboradores: selectedColaboradores,
      compareEnabled,
      compareDateFrom: compareDateRange?.from,
      compareDateTo: compareDateRange?.to,
    });
    
    setIsLoading(false);
  };

  const handleFilialToggle = (filialId: string) => {
    if (filialId === 'todas') {
      setSelectedFiliais(['todas']);
    } else {
      setSelectedFiliais(prev => {
        const newSelection = prev.filter(f => f !== 'todas');
        if (newSelection.includes(filialId)) {
          const filtered = newSelection.filter(f => f !== filialId);
          return filtered.length === 0 ? ['todas'] : filtered;
        } else {
          return [...newSelection, filialId];
        }
      });
    }
  };

  const handleColaboradorToggle = (colaboradorId: string) => {
    if (colaboradorId === 'todos') {
      setSelectedColaboradores(['todos']);
    } else {
      setSelectedColaboradores(prev => {
        const newSelection = prev.filter(c => c !== 'todos');
        if (newSelection.includes(colaboradorId)) {
          const filtered = newSelection.filter(c => c !== colaboradorId);
          return filtered.length === 0 ? ['todos'] : filtered;
        } else {
          return [...newSelection, colaboradorId];
        }
      });
    }
  };

  const formatDateRange = (range: DateRange | undefined) => {
    if (!range?.from) return 'Selecionar período';
    if (!range.to) return format(range.from, 'dd/MM/yy', { locale: ptBR });
    return `${format(range.from, 'dd/MM', { locale: ptBR })} - ${format(range.to, 'dd/MM/yy', { locale: ptBR })}`;
  };

  const getFilialLabel = () => {
    if (selectedFiliais.includes('todas')) return 'Todas as Filiais';
    if (selectedFiliais.length === 1) {
      const filial = filiais.find(f => f.id === selectedFiliais[0]);
      return filial?.nome || 'Filial';
    }
    return `${selectedFiliais.length} filiais`;
  };

  const getColaboradorLabel = () => {
    if (selectedColaboradores.includes('todos')) return 'Todos';
    if (selectedColaboradores.length === 1) {
      return selectedColaboradores[0];
    }
    return `${selectedColaboradores.length} vendedores`;
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
        <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
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
          <div className="p-2 border-t flex justify-end">
            <Button 
              size="sm" 
              onClick={() => {
                handleApplyFilters();
              }}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar
            </Button>
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
            <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
              <Calendar
                mode="range"
                selected={compareDateRange}
                onSelect={(range) => {
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

      {/* Filial Multi-Select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[160px] justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="truncate">{getFilialLabel()}</span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0 z-50 bg-popover" align="start">
          <ScrollArea className="h-[280px]">
            <div className="p-2 space-y-1">
              {/* Todas option */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                  selectedFiliais.includes('todas') && "bg-accent"
                )}
                onClick={() => handleFilialToggle('todas')}
              >
                <Checkbox 
                  checked={selectedFiliais.includes('todas')} 
                  onCheckedChange={() => handleFilialToggle('todas')}
                />
                <span className="text-sm font-medium">Todas as Filiais</span>
              </div>
              
              <div className="h-px bg-border my-2" />
              
              {/* Individual filiais */}
              {filiais.filter(f => f.id !== 'todas').map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                    selectedFiliais.includes(f.id) && "bg-accent"
                  )}
                  onClick={() => handleFilialToggle(f.id)}
                >
                  <Checkbox 
                    checked={selectedFiliais.includes(f.id)} 
                    onCheckedChange={() => handleFilialToggle(f.id)}
                  />
                  <span className="text-sm">{f.nome}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Colaborador Multi-Select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[160px] justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="truncate">{getColaboradorLabel()}</span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0 z-50 bg-popover" align="start">
          <ScrollArea className="h-[320px]">
            <div className="p-2 space-y-1">
              {/* Todos option */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                  selectedColaboradores.includes('todos') && "bg-accent"
                )}
                onClick={() => handleColaboradorToggle('todos')}
              >
                <Checkbox 
                  checked={selectedColaboradores.includes('todos')} 
                  onCheckedChange={() => handleColaboradorToggle('todos')}
                />
                <span className="text-sm font-medium">Todos os Vendedores</span>
              </div>
              
              <div className="h-px bg-border my-2" />
              
              {/* Individual colaboradores */}
              {allColaboradores.map((nome) => (
                <div
                  key={nome}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                    selectedColaboradores.includes(nome) && "bg-accent"
                  )}
                  onClick={() => handleColaboradorToggle(nome)}
                >
                  <Checkbox 
                    checked={selectedColaboradores.includes(nome)} 
                    onCheckedChange={() => handleColaboradorToggle(nome)}
                  />
                  <span className="text-sm truncate">{nome}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

      {/* Filtrar Button */}
      <Button className="gap-2" onClick={handleApplyFilters} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {isLoading ? 'Buscando...' : 'Filtrar'}
      </Button>

      {/* Force Refresh Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => {
                if (dateRange?.from && dateRange?.to) {
                  loadErpData(dateRange.from, dateRange.to, true);
                }
              }}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Atualizar dados (ignorar cache)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Cache Info Button */}
      <CacheInfoButton />
    </div>
  );
}