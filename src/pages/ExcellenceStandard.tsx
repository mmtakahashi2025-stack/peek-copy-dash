import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Trash2, Loader2, Save, Edit2, CalendarIcon, CheckCircle2, XCircle, MinusCircle, ClipboardCheck, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SecondaryHeader } from '@/components/layout/SecondaryHeader';
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
  evaluator_email: string | null;
  created_at: string;
  scores: Record<string, number>;
  percentage?: number;
}

// Month names in Portuguese
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function ExcellenceStandard() {
  const { user, loading: authLoading } = useAuth();
  const { colaboradores } = useSheetData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('grid');
  
  // Month/Year filter
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Criteria state
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loadingCriteria, setLoadingCriteria] = useState(false);
  const [newCriterion, setNewCriterion] = useState({ code: '', description: '' });
  const [editingCriterion, setEditingCriterion] = useState<Criterion | null>(null);
  const [showCriterionDialog, setShowCriterionDialog] = useState(false);
  
  // Evaluations state
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Quick evaluation popover state
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [quickForm, setQuickForm] = useState({
    conversation_number: '',
    scores: {} as Record<string, number>,
  });

  const gridMonth = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedYear, selectedMonth]);

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

  // Quick evaluation functions
  const openQuickEvaluation = (collaborator: string, dateStr: string) => {
    const key = `${collaborator}-${dateStr}`;
    setActivePopover(key);
    
    // Check if there's an existing evaluation for this cell
    const existing = evaluations.find(
      e => e.collaborator_name === collaborator && e.evaluation_date === dateStr
    );
    
    if (existing) {
      setQuickForm({
        conversation_number: existing.conversation_number || '',
        scores: { ...existing.scores },
      });
    } else {
      setQuickForm({
        conversation_number: '',
        scores: {},
      });
    }
  };

  const handleQuickSave = async (collaborator: string, dateStr: string) => {
    if (criteria.length === 0) {
      toast.error('Cadastre critérios antes de avaliar');
      return;
    }

    setSaving(true);
    try {
      // Check if evaluation exists
      const existing = evaluations.find(
        e => e.collaborator_name === collaborator && e.evaluation_date === dateStr
      );

      let evaluationId: string;

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('excellence_evaluations')
          .update({
            conversation_number: quickForm.conversation_number || null,
          })
          .eq('id', existing.id);

        if (error) throw error;
        evaluationId = existing.id;

        // Delete existing scores
        await supabase
          .from('excellence_scores')
          .delete()
          .eq('evaluation_id', evaluationId);
      } else {
        // Create new
        const { data, error } = await supabase
          .from('excellence_evaluations')
          .insert({
            collaborator_name: collaborator,
            conversation_number: quickForm.conversation_number || null,
            evaluation_date: dateStr,
            evaluator_email: user?.email || null,
          })
          .select()
          .single();

        if (error) throw error;
        evaluationId = data.id;
      }

      // Insert scores
      const scoresToInsert = Object.entries(quickForm.scores).map(
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

      toast.success('Avaliação salva!');
      setActivePopover(null);
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

  const setQuickScore = (criteriaId: string, score: number) => {
    setQuickForm((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: score,
      },
    }));
  };

  // Get logo URL for printing
  const logoUrl = new URL(comboLogo, window.location.origin).href;

  const getPrintHeader = (title: string, subtitle: string) => `
    <div class="header">
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="${logoUrl}" alt="Logo" style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px;" />
        <div>
          <h1 style="margin: 0; color: #333; font-size: 22px;">${title}</h1>
          <h2 style="margin: 5px 0 0 0; color: #666; font-size: 14px; font-weight: normal;">${subtitle}</h2>
        </div>
      </div>
    </div>
  `;

  const handlePrintEvaluation = (evaluation: Evaluation) => {
    const scoresList = criteria.map((c) => {
      const score = evaluation.scores[c.id];
      const scoreLabel = score === 1 ? 'SIM' : score === 0 ? 'NÃO' : score === -1 ? 'N/A' : '-';
      return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${c.code}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${c.description}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold; color: ${score === 1 ? 'green' : score === 0 ? 'red' : '#666'};">
            ${scoreLabel}
          </td>
        </tr>
      `;
    }).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Avaliação - ${evaluation.collaborator_name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
          .info-item { background: #f5f5f5; padding: 10px; border-radius: 4px; }
          .info-label { font-size: 12px; color: #666; }
          .info-value { font-size: 14px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #333; color: white; padding: 10px; text-align: left; }
          .result { margin-top: 20px; padding: 15px; background: ${(evaluation.percentage || 0) >= 85 ? '#d4edda' : '#f8d7da'}; border-radius: 4px; text-align: center; }
          .result-label { font-size: 14px; color: #666; }
          .result-value { font-size: 32px; font-weight: bold; color: ${(evaluation.percentage || 0) >= 85 ? '#155724' : '#721c24'}; }
          .signature { margin-top: 40px; display: flex; justify-content: space-between; }
          .signature-line { width: 45%; text-align: center; }
          .signature-line hr { margin-bottom: 5px; }
          .signature-line span { font-size: 12px; color: #666; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${getPrintHeader('Avaliação Padrão de Excelência', 'Combo Iguassu - Sales Ops')}
        
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Colaborador</div>
            <div class="info-value">${evaluation.collaborator_name}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Data da Avaliação</div>
            <div class="info-value">${format(new Date(evaluation.evaluation_date), 'dd/MM/yyyy')}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Nº da Conversa</div>
            <div class="info-value">${evaluation.conversation_number || '-'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Avaliador</div>
            <div class="info-value">${evaluation.evaluator_email || '-'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 60px;">Código</th>
              <th>Critério</th>
              <th style="width: 80px; text-align: center;">Resultado</th>
            </tr>
          </thead>
          <tbody>
            ${scoresList}
          </tbody>
        </table>

        <div class="result">
          <div class="result-label">Resultado Final</div>
          <div class="result-value">${(evaluation.percentage || 0).toFixed(1)}%</div>
        </div>

        <div class="signature">
          <div class="signature-line">
            <hr />
            <span>Assinatura do Avaliador</span>
          </div>
          <div class="signature-line">
            <hr />
            <span>Assinatura do Colaborador</span>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handlePrintMonthlyGrid = (collaboratorName: string) => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const monthEvaluations = evaluations.filter((e) => {
      const date = parseISO(e.evaluation_date);
      return e.collaborator_name === collaboratorName && isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const totalEvaluations = monthEvaluations.length;
    const avgPercentage = totalEvaluations > 0 
      ? monthEvaluations.reduce((sum, e) => sum + (e.percentage || 0), 0) / totalEvaluations 
      : 0;

    // Generate detailed evaluation blocks
    const evaluationDetails = monthEvaluations
      .sort((a, b) => a.evaluation_date.localeCompare(b.evaluation_date))
      .map((evaluation) => {
        const pct = evaluation.percentage || 0;
        const scoreRows = criteria.map((c) => {
          const score = evaluation.scores[c.id];
          const scoreLabel = score === 1 ? 'SIM' : score === 0 ? 'NÃO' : score === -1 ? 'N/A' : '-';
          const scoreColor = score === 1 ? 'green' : score === 0 ? 'red' : '#666';
          return `
            <tr>
              <td style="border: 1px solid #ddd; padding: 4px 8px; font-size: 11px;">${c.code}</td>
              <td style="border: 1px solid #ddd; padding: 4px 8px; font-size: 11px;">${c.description}</td>
              <td style="border: 1px solid #ddd; padding: 4px 8px; text-align: center; font-weight: bold; color: ${scoreColor}; font-size: 11px;">
                ${scoreLabel}
              </td>
            </tr>
          `;
        }).join('');

        return `
          <div class="evaluation-block" style="page-break-inside: avoid; margin-bottom: 25px; border: 1px solid #ddd; border-radius: 4px; padding: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
              <div>
                <strong style="font-size: 14px;">Dia ${format(new Date(evaluation.evaluation_date), 'dd/MM/yyyy')}</strong>
                <span style="color: #666; font-size: 12px; margin-left: 10px;">Conversa: ${evaluation.conversation_number || '-'}</span>
              </div>
              <div style="background: ${pct >= 85 ? '#d4edda' : '#f8d7da'}; padding: 5px 15px; border-radius: 4px;">
                <strong style="color: ${pct >= 85 ? '#155724' : '#721c24'}; font-size: 16px;">${pct.toFixed(0)}%</strong>
              </div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="background: #f5f5f5; padding: 6px; text-align: left; font-size: 11px; border: 1px solid #ddd; width: 60px;">Código</th>
                  <th style="background: #f5f5f5; padding: 6px; text-align: left; font-size: 11px; border: 1px solid #ddd;">Critério</th>
                  <th style="background: #f5f5f5; padding: 6px; text-align: center; font-size: 11px; border: 1px solid #ddd; width: 70px;">Resultado</th>
                </tr>
              </thead>
              <tbody>
                ${scoreRows}
              </tbody>
            </table>
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
              Avaliador: ${evaluation.evaluator_email || '-'}
            </div>
          </div>
        `;
      }).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Grade Mensal - ${collaboratorName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
          .header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
          .info-section { background: #f5f5f5; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info-label { color: #666; font-size: 13px; }
          .info-value { font-weight: bold; font-size: 14px; }
          .summary { margin-bottom: 25px; display: flex; gap: 20px; justify-content: center; }
          .summary-item { background: #f5f5f5; padding: 15px 25px; border-radius: 4px; text-align: center; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; }
          .signature { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-line { width: 45%; text-align: center; }
          .signature-line hr { margin-bottom: 5px; }
          .signature-line span { font-size: 12px; color: #666; }
          .no-evaluations { text-align: center; padding: 40px; color: #666; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${getPrintHeader('Grade Mensal - Padrão de Excelência', 'Combo Iguassu - Sales Ops')}
        
        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Colaborador:</span>
            <span class="info-value">${collaboratorName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Período:</span>
            <span class="info-value">${MONTHS[selectedMonth]} de ${selectedYear}</span>
          </div>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total de Avaliações</div>
            <div class="summary-value">${totalEvaluations}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Média do Mês</div>
            <div class="summary-value" style="color: ${avgPercentage >= 85 ? 'green' : totalEvaluations > 0 ? 'red' : '#333'};">
              ${totalEvaluations > 0 ? `${avgPercentage.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>

        ${totalEvaluations === 0 
          ? '<div class="no-evaluations">Nenhuma avaliação registrada neste período.</div>'
          : `<h3 style="margin-bottom: 15px; font-size: 14px; color: #333;">Detalhamento das Avaliações</h3>${evaluationDetails}`
        }

        <div class="signature">
          <div class="signature-line">
            <hr />
            <span>Assinatura do Gestor</span>
          </div>
          <div class="signature-line">
            <hr />
            <span>Assinatura do Colaborador</span>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // Grid data
  const gridData = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Filter evaluations for the selected month
    const monthEvaluations = evaluations.filter((e) => {
      const date = parseISO(e.evaluation_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    // Get unique collaborators
    const collaboratorsInMonth = [...new Set(monthEvaluations.map((e) => e.collaborator_name))];
    const allCollaborators = colaboradores.length > 0 
      ? colaboradores 
      : collaboratorsInMonth;
    const uniqueCollaborators = [...new Set([...allCollaborators, ...collaboratorsInMonth])];

    // Build grid data
    const grid = uniqueCollaborators.map((collab) => {
      const row: Record<string, any> = { collaborator: collab };
      let totalEvaluations = 0;
      let totalPercentage = 0;

      daysInMonth.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const evaluation = monthEvaluations.find(
          (e) => e.collaborator_name === collab && e.evaluation_date === dateStr
        );
        row[dateStr] = evaluation || null;
        if (evaluation) {
          totalEvaluations++;
          totalPercentage += evaluation.percentage || 0;
        }
      });

      row.total = totalEvaluations;
      row.avgPercentage = totalEvaluations > 0 ? totalPercentage / totalEvaluations : 0;
      return row;
    });

    return { grid, daysInMonth };
  }, [evaluations, gridMonth, colaboradores]);

  // KPIs
  const kpis = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    
    const monthEvaluations = evaluations.filter((e) => {
      const date = parseISO(e.evaluation_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const totalEvaluations = monthEvaluations.length;
    const avgPercentage = totalEvaluations > 0
      ? monthEvaluations.reduce((sum, e) => sum + (e.percentage || 0), 0) / totalEvaluations
      : 0;
    const aboveTarget = monthEvaluations.filter((e) => (e.percentage || 0) >= 85).length;
    const belowTarget = totalEvaluations - aboveTarget;

    return { totalEvaluations, avgPercentage, aboveTarget, belowTarget };
  }, [evaluations, gridMonth]);

  // Collaborator Ranking
  const collaboratorRanking = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    
    const monthEvaluations = evaluations.filter((e) => {
      const date = parseISO(e.evaluation_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const collaboratorStats = monthEvaluations.reduce((acc, e) => {
      if (!acc[e.collaborator_name]) {
        acc[e.collaborator_name] = { total: 0, sum: 0 };
      }
      acc[e.collaborator_name].total += 1;
      acc[e.collaborator_name].sum += e.percentage || 0;
      return acc;
    }, {} as Record<string, { total: number; sum: number }>);

    return Object.entries(collaboratorStats)
      .map(([name, stats]) => ({
        name,
        avgPercentage: stats.sum / stats.total,
        total: stats.total,
      }))
      .sort((a, b) => b.avgPercentage - a.avgPercentage)
      .slice(0, 10);
  }, [evaluations, gridMonth]);

  // Worst Criteria Ranking
  const worstCriteriaRanking = useMemo(() => {
    const monthStart = startOfMonth(gridMonth);
    const monthEnd = endOfMonth(gridMonth);
    
    const monthEvaluations = evaluations.filter((e) => {
      const date = parseISO(e.evaluation_date);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });

    const criteriaStats = criteria.reduce((acc, c) => {
      acc[c.id] = { code: c.code, description: c.description, positive: 0, total: 0 };
      return acc;
    }, {} as Record<string, { code: string; description: string; positive: number; total: number }>);

    monthEvaluations.forEach((e) => {
      Object.entries(e.scores).forEach(([criteriaId, score]) => {
        if (criteriaStats[criteriaId] && score !== -1) {
          criteriaStats[criteriaId].total += 1;
          if (score === 1) criteriaStats[criteriaId].positive += 1;
        }
      });
    });

    return Object.entries(criteriaStats)
      .filter(([_, stats]) => stats.total > 0)
      .map(([id, stats]) => ({
        id,
        code: stats.code,
        description: stats.description,
        percentage: (stats.positive / stats.total) * 100,
        total: stats.total,
      }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 5);
  }, [evaluations, criteria, gridMonth]);

  // Year options
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  }, []);

  const getEvaluationDisplay = (evaluation: Evaluation | null) => {
    if (!evaluation) return null;
    const pct = evaluation.percentage || 0;
    return (
      <span className={cn(
        "text-xs font-medium",
        pct >= 85 ? "text-success" : "text-destructive"
      )}>
        {pct.toFixed(0)}%
      </span>
    );
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
      <SecondaryHeader title="Padrão de Excelência" />

      <main className="container mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="grid">Grade Mensal</TabsTrigger>
            <TabsTrigger value="list">Lista de Avaliações</TabsTrigger>
            <TabsTrigger value="criteria">Critérios</TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Avaliações</p>
                <p className="text-2xl font-bold">{kpis.totalEvaluations}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Média Geral</p>
                <p className={cn(
                  "text-2xl font-bold",
                  kpis.avgPercentage >= 85 ? "text-success" : "text-destructive"
                )}>
                  {kpis.avgPercentage.toFixed(1)}%
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Acima de 85%</p>
                <p className="text-2xl font-bold text-success">{kpis.aboveTarget}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Abaixo de 85%</p>
                <p className="text-2xl font-bold text-destructive">{kpis.belowTarget}</p>
              </Card>
            </div>

            {/* Rankings */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Collaborator Ranking */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Ranking de Colaboradores</CardTitle>
                </CardHeader>
                <CardContent>
                  {collaboratorRanking.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
                  ) : (
                    <div className="space-y-2">
                      {collaboratorRanking.map((collab, index) => (
                        <div key={collab.name} className="flex items-center gap-3">
                          <span className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                            index === 0 ? "bg-yellow-500 text-yellow-950" :
                            index === 1 ? "bg-gray-400 text-gray-950" :
                            index === 2 ? "bg-orange-400 text-orange-950" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {index + 1}
                          </span>
                          <span className="flex-1 text-sm truncate">{collab.name}</span>
                          <span className={cn(
                            "text-sm font-medium",
                            collab.avgPercentage >= 85 ? "text-success" : "text-destructive"
                          )}>
                            {collab.avgPercentage.toFixed(0)}%
                          </span>
                          <span className="text-xs text-muted-foreground">({collab.total})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Worst Criteria Ranking */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Critérios Mais Mal Avaliados</CardTitle>
                </CardHeader>
                <CardContent>
                  {worstCriteriaRanking.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
                  ) : (
                    <div className="space-y-2">
                      {worstCriteriaRanking.map((criterion, index) => (
                        <div key={criterion.id} className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-xs font-bold">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{criterion.code}</p>
                            <p className="text-xs text-muted-foreground truncate">{criterion.description}</p>
                          </div>
                          <span className="text-sm font-medium text-destructive">
                            {criterion.percentage.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-lg">Avaliações por Colaborador</CardTitle>
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
                {loadingEvaluations || loadingCriteria ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : criteria.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Cadastre critérios na aba "Critérios" antes de criar avaliações.
                  </p>
                ) : gridData.grid.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum colaborador encontrado. Carregue a planilha de vendas.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Colaborador</TableHead>
                          {gridData.daysInMonth.map((day) => (
                            <TableHead key={day.toISOString()} className="text-center min-w-[40px] px-1">
                              {format(day, 'd')}
                            </TableHead>
                          ))}
                          <TableHead className="text-center min-w-[60px]">Total</TableHead>
                          <TableHead className="text-center min-w-[60px]">Média</TableHead>
                          <TableHead className="text-center min-w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gridData.grid.map((row) => (
                          <TableRow key={row.collaborator}>
                            <TableCell className="sticky left-0 bg-card z-10 font-medium">
                              {row.collaborator}
                            </TableCell>
                            {gridData.daysInMonth.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const evaluation = row[dateStr] as Evaluation | null;
                              const cellKey = `${row.collaborator}-${dateStr}`;
                              
                              return (
                                <TableCell key={dateStr} className="text-center p-0">
                                  <Popover 
                                    open={activePopover === cellKey} 
                                    onOpenChange={(open) => {
                                      if (open) {
                                        openQuickEvaluation(row.collaborator, dateStr);
                                      } else {
                                        setActivePopover(null);
                                      }
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                          "h-8 w-8 p-0",
                                          evaluation && (evaluation.percentage || 0) >= 85 && "bg-success/10",
                                          evaluation && (evaluation.percentage || 0) < 85 && "bg-destructive/10"
                                        )}
                                      >
                                        {evaluation ? (
                                          getEvaluationDisplay(evaluation)
                                        ) : (
                                          <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 hover:opacity-100" />
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-4 pointer-events-auto" align="center">
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="font-medium text-sm">{row.collaborator}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {format(day, "dd 'de' MMMM", { locale: ptBR })}
                                            </p>
                                          </div>
                                          {evaluation && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => handleDeleteEvaluation(evaluation.id)}
                                            >
                                              <Trash2 className="h-3 w-3 text-destructive" />
                                            </Button>
                                          )}
                                        </div>
                                        
                                        <div className="space-y-1">
                                          <Label className="text-xs">Nº Conversa</Label>
                                          <Input
                                            placeholder="Ex: 12345"
                                            value={quickForm.conversation_number}
                                            onChange={(e) =>
                                              setQuickForm((prev) => ({
                                                ...prev,
                                                conversation_number: e.target.value,
                                              }))
                                            }
                                            className="h-8 text-sm"
                                          />
                                        </div>

                                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                          {criteria.map((criterion) => (
                                            <div 
                                              key={criterion.id} 
                                              className="flex items-center justify-between gap-2 py-1 border-b last:border-0"
                                            >
                                              <span className="text-xs truncate flex-1" title={criterion.description}>
                                                <span className="font-medium">{criterion.code}</span>
                                                {' - '}
                                                {criterion.description.length > 30 
                                                  ? criterion.description.slice(0, 30) + '...' 
                                                  : criterion.description}
                                              </span>
                                              <div className="flex gap-1">
                                                <Button
                                                  variant={quickForm.scores[criterion.id] === 1 ? 'default' : 'outline'}
                                                  size="icon"
                                                  className={cn(
                                                    'h-6 w-6',
                                                    quickForm.scores[criterion.id] === 1 && 'bg-success hover:bg-success/90'
                                                  )}
                                                  onClick={() => setQuickScore(criterion.id, 1)}
                                                >
                                                  <CheckCircle2 className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                  variant={quickForm.scores[criterion.id] === 0 ? 'default' : 'outline'}
                                                  size="icon"
                                                  className={cn(
                                                    'h-6 w-6',
                                                    quickForm.scores[criterion.id] === 0 && 'bg-destructive hover:bg-destructive/90'
                                                  )}
                                                  onClick={() => setQuickScore(criterion.id, 0)}
                                                >
                                                  <XCircle className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                  variant={quickForm.scores[criterion.id] === -1 ? 'default' : 'outline'}
                                                  size="icon"
                                                  className="h-6 w-6"
                                                  onClick={() => setQuickScore(criterion.id, -1)}
                                                >
                                                  <MinusCircle className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        <Button 
                                          onClick={() => handleQuickSave(row.collaborator, dateStr)}
                                          disabled={saving}
                                          className="w-full h-8"
                                          size="sm"
                                        >
                                          {saving ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <Save className="h-3 w-3 mr-1" />
                                          )}
                                          Salvar
                                        </Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-medium">
                              {row.total}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={cn(
                                "font-medium",
                                row.avgPercentage >= 85 ? "text-success" : row.total > 0 ? "text-destructive" : ""
                              )}>
                                {row.total > 0 ? `${row.avgPercentage.toFixed(0)}%` : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center p-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handlePrintMonthlyGrid(row.collaborator)}
                                title="Imprimir grade mensal"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Histórico de Avaliações</CardTitle>
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
                        <TableHead>Avaliador</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead className="w-20">Ações</TableHead>
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
                          <TableCell className="text-muted-foreground text-sm">
                            {evaluation.evaluator_email || '-'}
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
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePrintEvaluation(evaluation)}
                                title="Imprimir"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvaluation(evaluation.id)}
                                title="Excluir"
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
        </Tabs>
      </main>
    </div>
  );
}
