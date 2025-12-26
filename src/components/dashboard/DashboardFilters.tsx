import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { filiaisData, colaboradoresData } from '@/data/mockData';

interface DashboardFiltersProps {
  onFiltersChange?: (filters: {
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
    filial: string;
    colaborador: string;
  }) => void;
}

export function DashboardFilters({ onFiltersChange }: DashboardFiltersProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date(2024, 0, 1));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [filial, setFilial] = useState('todas');
  const [colaborador, setColaborador] = useState('todos');

  // Filtrar colaboradores baseado na filial selecionada
  const filteredColaboradores = filial === 'todas' 
    ? colaboradoresData 
    : colaboradoresData.filter(c => c.filial === filial);

  useEffect(() => {
    onFiltersChange?.({
      dateFrom,
      dateTo,
      filial,
      colaborador,
    });
  }, [dateFrom, dateTo, filial, colaborador, onFiltersChange]);

  // Reset colaborador quando mudar filial
  useEffect(() => {
    if (filial !== 'todas') {
      const colaboradorExiste = filteredColaboradores.some(c => c.id.toString() === colaborador);
      if (!colaboradorExiste && colaborador !== 'todos') {
        setColaborador('todos');
      }
    }
  }, [filial, colaborador, filteredColaboradores]);

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-xl shadow-sm border">
      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'justify-start text-left font-normal min-w-[160px]',
              !dateFrom && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: ptBR }) : 'Data inicial'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateFrom}
            onSelect={setDateFrom}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground">até</span>

      {/* Date To */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'justify-start text-left font-normal min-w-[160px]',
              !dateTo && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: ptBR }) : 'Data final'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateTo}
            onSelect={setDateTo}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

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
    </div>
  );
}
