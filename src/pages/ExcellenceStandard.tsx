import { useState, useEffect } from 'react';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Plus, Trash2, Loader2, Save, Edit2, CalendarIcon, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import comboLogo from '@/assets/combo-iguassu-logo.png';

// Validation schemas
const criterionSchema = z.object({
  code: z.string()
    .min(1, 'Código é obrigatório')
    .max(20, 'Código deve ter no máximo 20 caracteres')
    .regex(/^[A-Za-z0-9.\-_]+$/, 'Código deve conter apenas letras, números, pontos, hífens e underscores'),
  description: z.string()
    .min(3, 'Descrição deve ter pelo menos 3 caracteres')
    .max(500, 'Descrição deve ter no máximo 500 caracteres'),
});

const evaluationSchema = z.object({
  collaborator_name: z.string().min(1, 'Selecione um colaborador'),
  conversation_number: z.string()
    .max(50, 'Número da conversa muito longo')
    .optional()
    .or(z.literal('')),
  evaluation_date: z.date()
    .max(new Date(new Date().setHours(23, 59, 59, 999)), 'Data não pode ser no futuro'),
});

interface Criterion {
  id: string;
  code: string;
  description: string;
  order_index: number;
  is_active: boolean;
}

interface Evaluation {
  id: string;
  collaborator_name: string;
  conversation_number: string | null;
  evaluation_date: string;
  created_at: string;
  scores: Record<string, number>;
  percentage?: number;
}

export default function ExcellenceStandard() {
  const { user, loading: authLoading } = useAuth();
  const { colaboradores } = useSheetData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('evaluations');
  
  // Criteria state
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loadingCriteria, setLoadingCriteria] = useState(false);
  const [newCriterion, setNewCriterion] = useState({ code: '', description: '' });
  const [editingCriterion, setEditingCriterion] = useState<Criterion | null>(null);
  const [showCriterionDialog, setShowCriterionDialog] = useState(false);
  
  // Evaluations state
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);
  const [evaluationForm, setEvaluationForm] = useState({
    collaborator_name: '',
    conversation_number: '',
    evaluation_date: new Date(),
    scores: {} as Record<string, number>,
  });
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    loadCriteria();
    loadEvaluations();
  }, []);

  const loadCriteria = async () => {
    setLoadingCriteria(true);
    try {
      const { data, error } = await supabase
        .from('excellence_criteria')
        .select('*')
        .order('order_index');

      if (error) throw error;
      setCriteria(data || []);
    } catch (error) {
      console.error('Error loading criteria:', error);
      toast.error('Erro ao carregar critérios');
    } finally {
      setLoadingCriteria(false);
    }
  };

  const loadEvaluations = async () => {
    setLoadingEvaluations(true);
    try {
      const { data: evalData, error: evalError } = await supabase
        .from('excellence_evaluations')
        .select('*')
        .order('evaluation_date', { ascending: false });

      if (evalError) throw evalError;

      const { data: scoresData, error: scoresError } = await supabase
        .from('excellence_scores')
        .select('*');

      if (scoresError) throw scoresError;

      const evaluationsWithScores = (evalData || []).map((evaluation) => {
        const evalScores = (scoresData || []).filter(
          (s) => s.evaluation_id === evaluation.id
        );
        const scoresMap: Record<string, number> = {};
        evalScores.forEach((s) => {
          scoresMap[s.criteria_id] = s.score;
        });

        // Calculate percentage
        const validScores = Object.values(scoresMap).filter((s) => s !== -1);
        const positiveScores = validScores.filter((s) => s === 1).length;
        const percentage = validScores.length > 0 
          ? (positiveScores / validScores.length) * 100 
          : 0;

        return {
          ...evaluation,
          scores: scoresMap,
          percentage,
        };
      });

      setEvaluations(evaluationsWithScores);
    } catch (error) {
      console.error('Error loading evaluations:', error);
      toast.error('Erro ao carregar avaliações');
    } finally {
      setLoadingEvaluations(false);
    }
  };

  // Criteria functions
  const handleSaveCriterion = async () => {
    // Validate input with zod
    const validationResult = criterionSchema.safeParse({
      code: newCriterion.code.trim(),
      description: newCriterion.description.trim(),
    });

    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    const validated = validationResult.data;

    setSaving(true);
    try {
      if (editingCriterion) {
        const { error } = await supabase
          .from('excellence_criteria')
          .update({
            code: validated.code,
            description: validated.description,
          })
          .eq('id', editingCriterion.id);

        if (error) throw error;
        toast.success('Critério atualizado!');
      } else {
        const maxOrder = criteria.length > 0 
          ? Math.max(...criteria.map((c) => c.order_index)) 
          : 0;

        const { error } = await supabase.from('excellence_criteria').insert({
          code: validated.code,
          description: validated.description,
          order_index: maxOrder + 1,
        });

        if (error) throw error;
        toast.success('Critério adicionado!');
      }

      setNewCriterion({ code: '', description: '' });
      setEditingCriterion(null);
      setShowCriterionDialog(false);
      loadCriteria();
    } catch (error) {
      console.error('Error saving criterion:', error);
      toast.error('Erro ao salvar critério');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCriterion = async (id: string) => {
    if (!confirm('Deseja excluir este critério?')) return;

    try {
      const { error } = await supabase
        .from('excellence_criteria')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Critério excluído!');
      loadCriteria();
    } catch (error) {
      console.error('Error deleting criterion:', error);
      toast.error('Erro ao excluir critério');
    }
  };

  const openEditCriterion = (criterion: Criterion) => {
    setEditingCriterion(criterion);
    setNewCriterion({ code: criterion.code, description: criterion.description });
    setShowCriterionDialog(true);
  };

  // Evaluation functions
  const handleSaveEvaluation = async () => {
    // Validate input with zod
    const validationResult = evaluationSchema.safeParse({
      collaborator_name: evaluationForm.collaborator_name,
      conversation_number: evaluationForm.conversation_number || '',
      evaluation_date: evaluationForm.evaluation_date,
    });

    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    const validated = validationResult.data;

    setSaving(true);
    try {
      let evaluationId: string;

      if (editingEvaluation) {
        const { error } = await supabase
          .from('excellence_evaluations')
          .update({
            collaborator_name: validated.collaborator_name,
            conversation_number: validated.conversation_number || null,
            evaluation_date: format(validated.evaluation_date, 'yyyy-MM-dd'),
          })
          .eq('id', editingEvaluation.id);

        if (error) throw error;
        evaluationId = editingEvaluation.id;

        // Delete existing scores
        await supabase
          .from('excellence_scores')
          .delete()
          .eq('evaluation_id', evaluationId);
      } else {
        const { data, error } = await supabase
          .from('excellence_evaluations')
          .insert({
            collaborator_name: validated.collaborator_name,
            conversation_number: validated.conversation_number || null,
            evaluation_date: format(validated.evaluation_date, 'yyyy-MM-dd'),
          })
          .select()
          .single();

        if (error) throw error;
        evaluationId = data.id;
      }

      // Insert scores
      const scoresToInsert = Object.entries(evaluationForm.scores).map(
        ([criteriaId, score]) => ({
          evaluation_id: evaluationId,
          criteria_id: criteriaId,
          score,
        })
      );

      if (scoresToInsert.length > 0) {
        const { error } = await supabase
          .from('excellence_scores')
          .insert(scoresToInsert);

        if (error) throw error;
      }

      toast.success(editingEvaluation ? 'Avaliação atualizada!' : 'Avaliação salva!');
      setShowEvaluationDialog(false);
      setEditingEvaluation(null);
      setEvaluationForm({
        collaborator_name: '',
        conversation_number: '',
        evaluation_date: new Date(),
        scores: {},
      });
      loadEvaluations();
    } catch (error) {
      console.error('Error saving evaluation:', error);
      toast.error('Erro ao salvar avaliação');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvaluation = async (id: string) => {
    if (!confirm('Deseja excluir esta avaliação?')) return;

    try {
      const { error } = await supabase
        .from('excellence_evaluations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Avaliação excluída!');
      loadEvaluations();
    } catch (error) {
      console.error('Error deleting evaluation:', error);
      toast.error('Erro ao excluir avaliação');
    }
  };

  const openEditEvaluation = (evaluation: Evaluation) => {
    setEditingEvaluation(evaluation);
    setEvaluationForm({
      collaborator_name: evaluation.collaborator_name,
      conversation_number: evaluation.conversation_number || '',
      evaluation_date: new Date(evaluation.evaluation_date),
      scores: { ...evaluation.scores },
    });
    setShowEvaluationDialog(true);
  };

  const openNewEvaluation = () => {
    setEditingEvaluation(null);
    setEvaluationForm({
      collaborator_name: '',
      conversation_number: '',
      evaluation_date: new Date(),
      scores: {},
    });
    setShowEvaluationDialog(true);
  };

  const setScore = (criteriaId: string, score: number) => {
    setEvaluationForm((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: score,
      },
    }));
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
      <header className="border-b bg-card px-4 py-3">
        <div className="container mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={comboLogo} alt="Logo" className="h-8" />
          <h1 className="text-lg font-semibold text-foreground">Padrão de Excelência</h1>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="evaluations">Avaliações</TabsTrigger>
            <TabsTrigger value="criteria">Critérios</TabsTrigger>
          </TabsList>

          <TabsContent value="criteria">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Critérios de Avaliação</CardTitle>
                <Dialog open={showCriterionDialog} onOpenChange={(open) => {
                  setShowCriterionDialog(open);
                  if (!open) {
                    setEditingCriterion(null);
                    setNewCriterion({ code: '', description: '' });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Novo Critério
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingCriterion ? 'Editar Critério' : 'Novo Critério'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Código</Label>
                        <Input
                          placeholder="Ex: 1.1"
                          value={newCriterion.code}
                          onChange={(e) =>
                            setNewCriterion((prev) => ({ ...prev, code: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Input
                          placeholder="Descrição do critério"
                          value={newCriterion.description}
                          onChange={(e) =>
                            setNewCriterion((prev) => ({ ...prev, description: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleSaveCriterion} disabled={saving}>
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
              </CardHeader>
              <CardContent>
                {loadingCriteria ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : criteria.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum critério cadastrado
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {criteria.map((criterion) => (
                        <TableRow key={criterion.id}>
                          <TableCell className="font-medium">{criterion.code}</TableCell>
                          <TableCell>{criterion.description}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditCriterion(criterion)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteCriterion(criterion.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evaluations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Avaliações</CardTitle>
                <Button size="sm" className="gap-2" onClick={openNewEvaluation}>
                  <Plus className="h-4 w-4" />
                  Nova Avaliação
                </Button>
              </CardHeader>
              <CardContent>
                {loadingEvaluations ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : evaluations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma avaliação cadastrada
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Nº Conversa</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead className="w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evaluations.map((evaluation) => (
                        <TableRow key={evaluation.id}>
                          <TableCell className="font-medium">
                            {evaluation.collaborator_name}
                          </TableCell>
                          <TableCell>
                            {evaluation.conversation_number || '-'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(evaluation.evaluation_date), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'font-semibold',
                                (evaluation.percentage || 0) >= 85
                                  ? 'text-success'
                                  : 'text-destructive'
                              )}
                            >
                              {(evaluation.percentage || 0).toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditEvaluation(evaluation)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvaluation(evaluation.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Evaluation Dialog */}
        <Dialog open={showEvaluationDialog} onOpenChange={setShowEvaluationDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEvaluation ? 'Editar Avaliação' : 'Nova Avaliação'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Colaborador</Label>
                  <Select
                    value={evaluationForm.collaborator_name}
                    onValueChange={(value) =>
                      setEvaluationForm((prev) => ({
                        ...prev,
                        collaborator_name: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      {colaboradores.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Carregue a planilha primeiro
                        </SelectItem>
                      ) : (
                        colaboradores.map((colaborador) => (
                          <SelectItem key={colaborador} value={colaborador}>
                            {colaborador}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nº da Conversa</Label>
                  <Input
                    placeholder="Ex: 12345"
                    value={evaluationForm.conversation_number}
                    onChange={(e) =>
                      setEvaluationForm((prev) => ({
                        ...prev,
                        conversation_number: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !evaluationForm.evaluation_date && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {evaluationForm.evaluation_date
                          ? format(evaluationForm.evaluation_date, 'dd/MM/yyyy')
                          : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={evaluationForm.evaluation_date}
                        onSelect={(date) =>
                          date &&
                          setEvaluationForm((prev) => ({
                            ...prev,
                            evaluation_date: date,
                          }))
                        }
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {criteria.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Cadastre critérios antes de criar avaliações
                </p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Código</TableHead>
                        <TableHead>Critério</TableHead>
                        <TableHead className="w-32 text-center">Avaliação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {criteria.map((criterion) => (
                        <TableRow key={criterion.id}>
                          <TableCell className="font-medium">{criterion.code}</TableCell>
                          <TableCell className="text-sm">{criterion.description}</TableCell>
                          <TableCell>
                            <div className="flex justify-center gap-1">
                              <Button
                                variant={evaluationForm.scores[criterion.id] === 1 ? 'default' : 'outline'}
                                size="icon"
                                className={cn(
                                  'h-8 w-8',
                                  evaluationForm.scores[criterion.id] === 1 && 'bg-success hover:bg-success/90'
                                )}
                                onClick={() => setScore(criterion.id, 1)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant={evaluationForm.scores[criterion.id] === 0 ? 'default' : 'outline'}
                                size="icon"
                                className={cn(
                                  'h-8 w-8',
                                  evaluationForm.scores[criterion.id] === 0 && 'bg-destructive hover:bg-destructive/90'
                                )}
                                onClick={() => setScore(criterion.id, 0)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant={evaluationForm.scores[criterion.id] === -1 ? 'default' : 'outline'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setScore(criterion.id, -1)}
                              >
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEvaluationDialog(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveEvaluation} disabled={saving || criteria.length === 0}>
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
      </main>
    </div>
  );
}
