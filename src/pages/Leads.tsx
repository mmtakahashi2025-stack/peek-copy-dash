import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSheetData } from '@/contexts/SheetDataContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CalendarIcon, Users, ChevronUp, ChevronDown, TrendingDown, Minus, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

interface LeadRecord {
  id: string;
  collaborator_name: string;
  record_date: string;
  leads_count: number;
}

interface LeadKPIs {
  totalRecebido: number;
  totalDistribuido: number;
  leadsInvalidos: number;
  leadsInvalidosPercent: number;
  mediaDiariaRecebido: number;
  mediaDiariaEncaminhado: number;
}

// Month names in Portuguese
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function Leads() {
  const { user, loading: authLoading } = useAuth();
  const { colaboradores } = useSheetData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('grid');
  
  // State
  const [records, setRecords] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [totalRecebido, setTotalRecebido] = useState<Record<string, number>>({});
  const [savingRecebido, setSavingRecebido] = useState<string | null>(null);
  const [targets, setTargets] = useState<{ recebido: number; distribuido: number }>({ recebido: 0, distribuido: 0 });
  
  // Month/Year filter for grid view
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const gridMonth = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedYear, selectedMonth]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadRecords();
  }, []);

  // Load targets when month/year changes
  useEffect(() => {
    const loadTargets = async () => {
      try {
        const { data, error } = await supabase
          .from('kpi_targets')
          .select('kpi_type, target_value')
          .eq('year', selectedYear)
          .eq('month', selectedMonth + 1) // month is 0-indexed in state
          .in('kpi_type', ['leads_diario_recebido', 'leads_diario_distribuido']);

        if (error) throw error;

        const targetsMap = { recebido: 0, distribuido: 0 };
        data?.forEach((t) => {
          if (t.kpi_type === 'leads_diario_recebido') targetsMap.recebido = t.target_value;
          if (t.kpi_type === 'leads_diario_distribuido') targetsMap.distribuido = t.target_value;
        });
        setTargets(targetsMap);
      } catch (error) {
        console.error('Error loading targets:', error);
      }
    };
    loadTargets();
  }, [selectedMonth, selectedYear]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lead_records')
        .select('*')
        .order('record_date', { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error loading lead records:', error);
      toast.error('Erro ao carregar registros de leads');
    } finally {
      setLoading(false);
    }
  };

  // Save record directly (upsert)
  const saveRecord = useCallback(async (collaborator: string, dateStr: string, newCount: number) => {
    const cellKey = `${collaborator}-${dateStr}`;
    setSavingCell(cellKey);

    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('lead_records')
        .select('id')
        .eq('collaborator_name', collaborator)
        .eq('record_date', dateStr)
        .maybeSingle();

      if (existing) {
        if (newCount === 0) {
          // Delete if count is 0
          const { error } = await supabase
            .from('lead_records')
            .delete()
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          // Update existing
          const { error } = await supabase
            .from('lead_records')
            .update({ leads_count: newCount })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else if (newCount > 0) {
        // Insert new
        const { error } = await supabase
          .from('lead_records')
          .insert({
            collaborator_name: collaborator,
            record_date: dateStr,
            leads_count: newCount,
          });
        if (error) throw error;
      }

      // Update local state optimistically
      setRecords(prev => {
        const filtered = prev.filter(
          r => !(r.collaborator_name === collaborator && r.record_date === dateStr)
        );
        if (newCount > 0) {
          return [...filtered, {
            id: existing?.id || 'temp',
            collaborator_name: collaborator,
            record_date: dateStr,
            leads_count: newCount,
          }];
        }
        return filtered;
      });
    } catch (error) {
      console.error('Error saving lead record:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSavingCell(null);
    }
  }, []);

  const handleIncrement = (collaborator: string, dateStr: string, currentValue: number) => {
    saveRecord(collaborator, dateStr, currentValue + 1);
  };

  const handleDecrement = (collaborator: string, dateStr: string, currentValue: number) => {
    if (currentValue > 0) {
      saveRecord(collaborator, dateStr, currentValue - 1);
    }
  };

  // Grid view data
  const gridData = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Get unique collaborators from records within the month
    const monthRecords = records.filter((r) => {
      const date = parseISO(r.record_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const collaboratorsInMonth = [...new Set(monthRecords.map((r) => r.collaborator_name))];
    
    // Use collaborators from sheet data if available, otherwise from records
    const allCollaborators = colaboradores.length > 0 
      ? colaboradores 
      : collaboratorsInMonth;

    const uniqueCollaborators = [...new Set([...allCollaborators, ...collaboratorsInMonth])];

    // Build grid data
    const grid = uniqueCollaborators.map((collab) => {
      const row: Record<string, number | string> = { collaborator: collab };
      let total = 0;

      daysInMonth.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const record = monthRecords.find(
          (r) => r.collaborator_name === collab && r.record_date === dateStr
        );
        const count = record?.leads_count || 0;
        row[dateStr] = count;
        total += count;
      });

      row.total = total;
      return row;
    });

    // Calculate daily totals (distribuído)
    const dailyTotals: Record<string, number> = {};
    daysInMonth.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      dailyTotals[dateStr] = monthRecords
        .filter((r) => r.record_date === dateStr)
        .reduce((sum, r) => sum + r.leads_count, 0);
    });

    const grandTotal = Object.values(dailyTotals).reduce((sum, v) => sum + v, 0);
    
    // Calculate recebido totals
    const recebidoGrandTotal = Object.entries(totalRecebido)
      .filter(([dateStr]) => {
        const date = parseISO(dateStr);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      })
      .reduce((sum, [, v]) => sum + v, 0);

    return { grid, daysInMonth, dailyTotals, grandTotal, recebidoGrandTotal };
  }, [records, gridMonth, colaboradores, totalRecebido]);

  // KPIs calculation
  const kpis = useMemo((): LeadKPIs => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const daysCount = daysInMonth.length;
    const today = new Date();
    const daysElapsed = Math.min(
      daysInMonth.filter(d => d <= today).length,
      daysCount
    ) || 1;

    const totalDistribuido = gridData.grandTotal;
    const totalRecebidoValue = gridData.recebidoGrandTotal;
    const leadsInvalidos = Math.max(0, totalRecebidoValue - totalDistribuido);
    const leadsInvalidosPercent = totalRecebidoValue > 0 
      ? (leadsInvalidos / totalRecebidoValue) * 100 
      : 0;
    const mediaDiariaRecebido = totalRecebidoValue / daysElapsed;
    const mediaDiariaEncaminhado = totalDistribuido / daysElapsed;

    return {
      totalRecebido: totalRecebidoValue,
      totalDistribuido,
      leadsInvalidos,
      leadsInvalidosPercent,
      mediaDiariaRecebido,
      mediaDiariaEncaminhado,
    };
  }, [gridData, gridMonth]);

  // Handle recebido increment/decrement
  const handleRecebidoIncrement = (dateStr: string, currentValue: number) => {
    setTotalRecebido(prev => ({ ...prev, [dateStr]: currentValue + 1 }));
  };

  const handleRecebidoDecrement = (dateStr: string, currentValue: number) => {
    if (currentValue > 0) {
      setTotalRecebido(prev => ({ ...prev, [dateStr]: currentValue - 1 }));
    }
  };

  // Ranking data - filtered by selected month
  const rankingData = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    
    const monthRecords = records.filter((r) => {
      const date = parseISO(r.record_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const totals: Record<string, number> = {};
    
    monthRecords.forEach((r) => {
      if (!totals[r.collaborator_name]) {
        totals[r.collaborator_name] = 0;
      }
      totals[r.collaborator_name] += r.leads_count;
    });

    return Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [records, gridMonth]);

  // Generate year options (current year and 2 years before/after)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="grid">Grade Mensal</TabsTrigger>
            <TabsTrigger value="ranking">Ranking</TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-4">
            {/* KPIs Section */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Recebido</p>
                <p className="text-2xl font-bold">{kpis.totalRecebido.toLocaleString('pt-BR')}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Distribuído</p>
                <p className="text-2xl font-bold">{kpis.totalDistribuido.toLocaleString('pt-BR')}</p>
              </Card>
              <Card className="p-4 border-destructive/50">
                <p className="text-xs text-muted-foreground mb-1">Leads Inválidos</p>
                <p className="text-2xl font-bold text-destructive">{kpis.leadsInvalidosPercent.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">Máx</p>
              </Card>
              <Card className={cn("p-4", targets.recebido > 0 && kpis.mediaDiariaRecebido < targets.recebido && "border-destructive/50 bg-destructive/5")}>
                <p className="text-xs text-muted-foreground mb-1">Média Diária/Recebido</p>
                <p className={cn("text-2xl font-bold", targets.recebido > 0 && kpis.mediaDiariaRecebido < targets.recebido && "text-destructive")}>
                  {kpis.mediaDiariaRecebido.toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {targets.recebido > 0 ? `Meta: ${targets.recebido}` : 'Mín'}
                </p>
              </Card>
              <Card className={cn("p-4", targets.distribuido > 0 && kpis.mediaDiariaEncaminhado < targets.distribuido && "border-destructive/50 bg-destructive/5")}>
                <p className="text-xs text-muted-foreground mb-1">Média Diária/Encaminhado</p>
                <p className={cn("text-2xl font-bold", targets.distribuido > 0 && kpis.mediaDiariaEncaminhado < targets.distribuido && "text-destructive")}>
                  {kpis.mediaDiariaEncaminhado.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {targets.distribuido > 0 ? `Meta: ${targets.distribuido}` : 'Mín'}
                </p>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-lg">Leads por Colaborador</CardTitle>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {MONTHS[selectedMonth]} {selectedYear}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4 pointer-events-auto" align="end">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Ano</label>
                          <Select 
                            value={selectedYear.toString()} 
                            onValueChange={(v) => setSelectedYear(parseInt(v))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {yearOptions.map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Mês</label>
                          <div className="grid grid-cols-3 gap-2">
                            {MONTHS.map((month, index) => (
                              <Button
                                key={month}
                                variant={selectedMonth === index ? 'default' : 'outline'}
                                size="sm"
                                className="text-xs"
                                onClick={() => setSelectedMonth(index)}
                              >
                                {month.slice(0, 3)}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : gridData.grid.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum colaborador encontrado. Carregue a planilha de vendas para ver os colaboradores.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">Colaborador</TableHead>
                          {gridData.daysInMonth.map((day) => (
                            <TableHead key={day.toISOString()} className="text-center min-w-[60px] px-1">
                              {format(day, 'dd')}
                            </TableHead>
                          ))}
                          <TableHead className="text-center font-bold min-w-[60px]">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gridData.grid.map((row) => (
                          <TableRow key={row.collaborator as string}>
                            <TableCell className="sticky left-0 bg-card z-10 font-medium">
                              {row.collaborator as string}
                            </TableCell>
                            {gridData.daysInMonth.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const value = row[dateStr] as number || 0;
                              const cellKey = `${row.collaborator}-${dateStr}`;
                              const isSaving = savingCell === cellKey;

                              return (
                                <TableCell
                                  key={dateStr}
                                  className={cn(
                                    'text-center p-1 h-12',
                                    value >= 15 && 'bg-green-500/20',
                                    value >= 10 && value < 15 && 'bg-yellow-500/20',
                                    value > 0 && value < 10 && 'bg-orange-500/20'
                                  )}
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    max="999"
                                    value={value || ''}
                                    onChange={(e) => {
                                      const newValue = Math.max(0, parseInt(e.target.value) || 0);
                                      saveRecord(row.collaborator as string, dateStr, newValue);
                                    }}
                                    disabled={isSaving}
                                    className={cn(
                                      'w-full h-8 text-center text-sm font-medium bg-transparent border border-border/50 rounded focus:outline-none focus:ring-1 focus:ring-primary',
                                      value >= 15 && 'text-green-700 dark:text-green-400',
                                      value >= 10 && value < 15 && 'text-yellow-700 dark:text-yellow-400',
                                      value > 0 && value < 10 && 'text-orange-700 dark:text-orange-400',
                                      isSaving && 'opacity-50'
                                    )}
                                    placeholder="-"
                                  />
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold bg-muted/30">
                              {row.total as number}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Recebido row */}
                        <TableRow className="bg-primary/10 font-bold">
                          <TableCell className="sticky left-0 bg-primary/10 z-10">Total Recebido</TableCell>
                          {gridData.daysInMonth.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const value = totalRecebido[dateStr] || 0;

                            return (
                              <TableCell key={dateStr} className="text-center p-1 h-12">
                                <input
                                  type="number"
                                  min="0"
                                  max="9999"
                                  value={value || ''}
                                  onChange={(e) => {
                                    const newValue = Math.max(0, parseInt(e.target.value) || 0);
                                    setTotalRecebido(prev => ({ ...prev, [dateStr]: newValue }));
                                  }}
                                  className="w-full h-8 text-center text-sm font-medium bg-transparent border border-border/50 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                  placeholder="-"
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">{gridData.recebidoGrandTotal}</TableCell>
                        </TableRow>
                        {/* Total Distribuído row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell className="sticky left-0 bg-muted/50 z-10">Total Distribuído</TableCell>
                          {gridData.daysInMonth.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const total = gridData.dailyTotals[dateStr] || 0;
                            return (
                              <TableCell key={dateStr} className="text-center">
                                {total > 0 ? total : '-'}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">{gridData.grandTotal}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ranking">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Ranking de Leads - {MONTHS[selectedMonth]} {selectedYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : rankingData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado para este mês
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rankingData.map((item, index) => (
                      <div
                        key={item.name}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg',
                          index === 0 && 'bg-yellow-500/20',
                          index === 1 && 'bg-gray-400/20',
                          index === 2 && 'bg-orange-400/20',
                          index > 2 && 'bg-muted/30'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                            index === 0 && 'bg-yellow-500 text-yellow-950',
                            index === 1 && 'bg-gray-400 text-gray-950',
                            index === 2 && 'bg-orange-400 text-orange-950',
                            index > 2 && 'bg-muted text-muted-foreground'
                          )}>
                            {index + 1}
                          </span>
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <span className="text-lg font-bold">{item.total} leads</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
