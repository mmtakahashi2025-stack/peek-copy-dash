import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import comboLogo from '@/assets/combo-iguassu-logo.png';

const KPI_TYPES = [
  { id: 'padrao_exc', label: 'Padrão Exc. %' },
  { id: 'leads', label: 'Leads' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'conversao', label: 'Conversão %' },
  { id: 'faturamento', label: 'Faturamento' },
  { id: 'ticket_medio', label: 'Ticket Médio' },
  { id: 'pa', label: 'P.A' },
  { id: 'lucro', label: 'Lucro %' },
];

const MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

interface KpiTarget {
  id?: string;
  year: number;
  month: number;
  kpi_type: string;
  target_value: number;
}

export default function Targets() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadTargets();
  }, [selectedYear, selectedMonth]);

  const loadTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kpi_targets')
        .select('*')
        .eq('year', selectedYear)
        .eq('month', selectedMonth);

      if (error) throw error;

      const targetsMap: Record<string, number> = {};
      data?.forEach((target: KpiTarget) => {
        targetsMap[target.kpi_type] = target.target_value;
      });
      setTargets(targetsMap);
    } catch (error) {
      console.error('Error loading targets:', error);
      toast.error('Erro ao carregar metas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const kpi of KPI_TYPES) {
        const value = targets[kpi.id];
        if (value !== undefined && value !== null) {
          const { error } = await supabase
            .from('kpi_targets')
            .upsert(
              {
                year: selectedYear,
                month: selectedMonth,
                kpi_type: kpi.id,
                target_value: value,
              },
              { onConflict: 'year,month,kpi_type' }
            );

          if (error) throw error;
        }
      }
      toast.success('Metas salvas com sucesso!');
    } catch (error) {
      console.error('Error saving targets:', error);
      toast.error('Erro ao salvar metas');
    } finally {
      setSaving(false);
    }
  };

  const handleTargetChange = (kpiId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setTargets((prev) => ({ ...prev, [kpiId]: numValue }));
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="container mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={comboLogo} alt="Logo" className="h-8" />
          <h1 className="text-lg font-semibold text-foreground">Gestão de Metas</h1>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Metas Mensais de KPIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label>Ano</Label>
                <Select
                  value={selectedYear.toString()}
                  onValueChange={(v) => setSelectedYear(parseInt(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mês</Label>
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(v) => setSelectedMonth(parseInt(v))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead className="w-48">Meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {KPI_TYPES.map((kpi) => (
                    <TableRow key={kpi.id}>
                      <TableCell className="font-medium">{kpi.label}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={targets[kpi.id] ?? ''}
                          onChange={(e) => handleTargetChange(kpi.id, e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Metas
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
