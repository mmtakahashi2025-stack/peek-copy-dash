import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSheetData } from '@/contexts/SheetDataContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Loader2, Save, CalendarIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SecondaryHeader } from '@/components/layout/SecondaryHeader';

// Validation schema
const leadRecordSchema = z.object({
  collaborator_name: z.string().min(1, 'Selecione um colaborador'),
  record_date: z.date(),
  leads_count: z.number().min(0, 'Quantidade deve ser maior ou igual a 0').max(9999, 'Quantidade muito alta'),
});

interface LeadRecord {
  id: string;
  collaborator_name: string;
  record_date: string;
  leads_count: number;
}

export default function Leads() {
  const { user, loading: authLoading } = useAuth();
  const { colaboradores } = useSheetData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('grid');
  
  // State
  const [records, setRecords] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // Form state
  const [selectedCollaborator, setSelectedCollaborator] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [leadsCount, setLeadsCount] = useState('');
  
  // Month filter for grid view
  const [gridMonth, setGridMonth] = useState<Date>(new Date());

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadRecords();
  }, []);

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

  const handleSaveRecord = async () => {
    const validationResult = leadRecordSchema.safeParse({
      collaborator_name: selectedCollaborator,
      record_date: selectedDate,
      leads_count: parseInt(leadsCount) || 0,
    });

    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    const validated = validationResult.data;
    setSaving(true);

    try {
      // Check if record exists for this collaborator and date
      const dateStr = format(validated.record_date, 'yyyy-MM-dd');
      const { data: existing } = await supabase
        .from('lead_records')
        .select('id')
        .eq('collaborator_name', validated.collaborator_name)
        .eq('record_date', dateStr)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('lead_records')
          .update({ leads_count: validated.leads_count })
          .eq('id', existing.id);

        if (error) throw error;
        toast.success('Registro atualizado!');
      } else {
        // Insert new record
        const { error } = await supabase
          .from('lead_records')
          .insert({
            collaborator_name: validated.collaborator_name,
            record_date: dateStr,
            leads_count: validated.leads_count,
          });

        if (error) throw error;
        toast.success('Registro salvo!');
      }

      setShowAddDialog(false);
      setSelectedCollaborator('');
      setLeadsCount('');
      loadRecords();
    } catch (error) {
      console.error('Error saving lead record:', error);
      toast.error('Erro ao salvar registro');
    } finally {
      setSaving(false);
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

    // Calculate daily totals
    const dailyTotals: Record<string, number> = {};
    daysInMonth.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      dailyTotals[dateStr] = monthRecords
        .filter((r) => r.record_date === dateStr)
        .reduce((sum, r) => sum + r.leads_count, 0);
    });

    const grandTotal = Object.values(dailyTotals).reduce((sum, v) => sum + v, 0);

    return { grid, daysInMonth, dailyTotals, grandTotal };
  }, [records, gridMonth, colaboradores]);

  // Ranking data
  const rankingData = useMemo(() => {
    const totals: Record<string, number> = {};
    
    records.forEach((r) => {
      if (!totals[r.collaborator_name]) {
        totals[r.collaborator_name] = 0;
      }
      totals[r.collaborator_name] += r.leads_count;
    });

    return Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [records]);

  const handleCellClick = (collaborator: string, dateStr: string, currentValue: number) => {
    setSelectedCollaborator(collaborator);
    setSelectedDate(parseISO(dateStr));
    setLeadsCount(currentValue.toString());
    setShowAddDialog(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SecondaryHeader title="Controle de Leads" />

      <main className="container mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="grid">Grade Mensal</TabsTrigger>
            <TabsTrigger value="ranking">Ranking</TabsTrigger>
          </TabsList>

          <TabsContent value="grid">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-lg">Leads por Colaborador</CardTitle>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(gridMonth, 'MMMM yyyy', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={gridMonth}
                        onSelect={(date) => date && setGridMonth(date)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <Dialog open={showAddDialog} onOpenChange={(open) => {
                    setShowAddDialog(open);
                    if (!open) {
                      setSelectedCollaborator('');
                      setLeadsCount('');
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Registrar Leads</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Colaborador</Label>
                          <Select value={selectedCollaborator} onValueChange={setSelectedCollaborator}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {colaboradores.map((collab) => (
                                <SelectItem key={collab} value={collab}>
                                  {collab}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Data</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !selectedDate && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDate ? format(selectedDate, 'PPP', { locale: ptBR }) : 'Selecione...'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => date && setSelectedDate(date)}
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>Quantidade de Leads</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={leadsCount}
                            onChange={(e) => setLeadsCount(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveRecord} disabled={saving}>
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Salvar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : gridData.grid.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado para este mês
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">Colaborador</TableHead>
                          {gridData.daysInMonth.map((day) => (
                            <TableHead key={day.toISOString()} className="text-center min-w-[50px]">
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
                              return (
                                <TableCell
                                  key={dateStr}
                                  className={cn(
                                    'text-center cursor-pointer hover:bg-muted/50 transition-colors',
                                    value > 0 && 'font-medium',
                                    value >= 15 && 'bg-green-500/20 text-green-700 dark:text-green-400',
                                    value >= 10 && value < 15 && 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
                                    value > 0 && value < 10 && 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
                                  )}
                                  onClick={() => handleCellClick(row.collaborator as string, dateStr, value)}
                                >
                                  {value > 0 ? value : '-'}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold bg-muted/30">
                              {row.total as number}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total row */}
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
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Ranking de Leads por Colaborador
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : rankingData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado
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
