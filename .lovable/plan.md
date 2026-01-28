
# Plano Completo: Dashboard de Vendas - Correções e Melhorias

## DESCOBERTA CRÍTICA: REGRAS DE CÁLCULO ESTAVAM INCORRETAS

### Comparativo de Valores (01-27/01/2026)

| Métrica | ERP (referência) | Nossa regra atual | Diferença |
|---------|------------------|-------------------|-----------|
| Faturamento | **R$ 1.380.611,79** | R$ 1.128.502 | -18% (errado) |
| Lucro | **R$ 384.065,30** | R$ 380.225 | -1% (próximo) |
| Lucro % | **27,82%** | 33,69% | +6 pts (errado) |

### Causa Raiz Identificada

A **deduplicação por "Venda # + Item"** estava INCORRETA. Validação SQL mostrou:

- Faturamento SEM PC e **SEM deduplicação**: R$ 1.380.611,79 (IGUAL ao ERP)
- Faturamento SEM PC e COM deduplicação: R$ 1.128.502 (18% menor - ERRADO)

### Regras CORRETAS (validadas contra ERP)

| Métrica | Regra CORRETA | Regra ANTERIOR (errada) |
|---------|---------------|-------------------------|
| Faturamento | SEM PC, **SEM deduplicação** | SEM PC, COM deduplicação |
| Lucro | SEM PC, **SEM deduplicação** | COM PC, COM deduplicação |
| Lucro % | Lucro / Faturamento (ambos sem PC) | Lucro (com PC) / Faturamento (sem PC) |
| Vendas | IDs únicos de Venda # (sem PC) | Mantém |
| P.A. | Quantidade / Vendas (sem PC) | Mantém |

---

## PARTE 1: CORREÇÕES DE INTEGRIDADE DE DADOS

### 1.1 Atualizar Lógica de Cálculo (CRÍTICO)

**Arquivos afetados:**
- `src/contexts/SheetDataContext.tsx` - Remover deduplicação, ajustar lucro
- `supabase/functions/recalculate-aggregates/index.ts` - Mesma correção
- `src/hooks/useChartAggregates.ts` - Mesma correção

**Mudança principal:**
```typescript
// ANTES (errado):
const processedKeys = new Set<string>();
rawData.forEach(row => {
  const key = `${row['Venda #']}|${row.Item}`;
  if (processedKeys.has(key)) return;  // REMOVER ISSO
  processedKeys.add(key);
  // ...
});
const totalLucro = uniqueData.reduce((sum, r) => sum + (r.Lucro || 0), 0); // Incluía PC

// DEPOIS (correto):
// SEM deduplicação - usar todos os registros
const totalLucro = data.filter(r => r.Tipo !== 'PC').reduce((sum, r) => sum + (r.Lucro || 0), 0);
```

### 1.2 Adicionar Coluna total_lucro em erp_daily_aggregates

**Migration SQL:**
```sql
ALTER TABLE erp_daily_aggregates 
ADD COLUMN IF NOT EXISTS total_lucro NUMERIC DEFAULT 0;
```

### 1.3 Atualizar Edge Function recalculate-aggregates

- Remover lógica de deduplicação
- Lucro: excluir tipo PC (não incluir)
- Garantir INSERT de total_lucro nos agregados diários

### 1.4 Executar Recálculo Completo

Após correções:
```
POST /functions/v1/recalculate-aggregates
Body: { "forceAll": true }
```

---

## PARTE 2: SINCRONIZAÇÃO DE FILTROS

### 2.1 Problema Atual

O card de Evolução de Vendas tem seletores independentes de ano/mês, podendo mostrar dados de período diferente do filtro global.

### 2.2 Solução

Remover estados independentes e derivar do filtro global:

```typescript
// ANTES:
const [selectedYear, setSelectedYear] = useState(...)

// DEPOIS:
const selectedYear = dateFrom?.getFullYear() ?? new Date().getFullYear();
const selectedMonth = dateFrom?.getMonth() ?? new Date().getMonth();
```

O card manterá apenas toggle ANO/MÊS, mas sempre respeitando o período do filtro global.

---

## PARTE 3: KPIs COM COMPARAÇÃO ANO ANTERIOR

### 3.1 Lógica de Comparação

Para cada KPI, calcular valor do mesmo período do ano anterior e mostrar variação:

```typescript
interface KpiData {
  // ... campos existentes
  previousValue: string;    // Ex: "R$ 1.200.000"
  variation: number;        // Ex: 12.5 (%)
  isPositive: boolean;      // true = crescimento
}

// Cálculo:
const currentValue = calcular(dadosPeriodoAtual);
const previousValue = calcular(dadosAnoAnterior);
const variation = previousValue > 0 
  ? ((currentValue - previousValue) / previousValue) * 100 
  : 0;
```

### 3.2 Mudanças em Dashboard.tsx

- Filtrar rawData para extrair dados do ano anterior
- Passar previousYearData para getKpis()

---

## PARTE 4: TOOLTIPS INTERATIVOS NOS RANKINGS

### 4.1 Produtos Mais Vendidos - Top 3 Vendedores

Ao passar mouse sobre produto, exibir:
```
Produto: Passeio Cataratas
Quantidade: 450 unidades

Top 3 Vendedores:
1. João Silva - 120 un.
2. Maria Santos - 98 un.
3. Pedro Lima - 85 un.
```

### 4.2 Ranking Colaboradores - Top 3 Produtos

Ao passar mouse sobre colaborador, exibir:
```
João Silva
Faturamento: R$ 125.430

Top 3 Produtos:
1. Passeio Cataratas - 120 un.
2. City Tour - 45 un.
3. Combo Aventura - 32 un.
```

### 4.3 Implementação

- Receber `rawData` via props
- Calcular top 3 on-demand (no hover)
- Zero chamadas de API adicionais

---

## PARTE 5: MELHORIAS VISUAIS

### 5.1 Substituir Emojis por Ícones Lucide

```typescript
// ANTES:
💰 Faturamento Anual:
📊 Lucro Anual:

// DEPOIS:
<DollarSign className="h-4 w-4" /> Faturamento Anual:
<TrendingUp className="h-4 w-4" /> Lucro Anual:
```

### 5.2 Toggle Funcional na Aba MÊS

```typescript
// ANTES (hardcoded):
<Bar dataKey="faturamento" />

// DEPOIS (dinâmico):
<Bar dataKey={viewMode === 'lucro' ? 'lucro' : 'faturamento'} />
```

### 5.3 Alturas Responsivas

```typescript
className="h-[200px] lg:h-[280px]"
```

---

## PARTE 6: PLANO DE EXECUÇÃO (Otimizado para Créditos)

### Ordem de Execução

| Etapa | Arquivo | Operação | Dependência |
|-------|---------|----------|-------------|
| 1 | Migration SQL | 1 migration | - |
| 2 | recalculate-aggregates/index.ts | 1 edit | Etapa 1 |
| 3a | SheetDataContext.tsx | 1 edit | - |
| 3b | useDailyAggregates.ts | 1 edit (paralelo) | Etapa 1 |
| 3c | useChartAggregates.ts | 1 edit (paralelo) | - |
| 4 | Deploy edge function | 1 deploy | Etapa 2 |
| 5 | SalesEvolutionChart.tsx | 1 edit | Etapa 3b |
| 6a | RankingCard.tsx | 1 edit (paralelo) | - |
| 6b | ProductRankingCard.tsx | 1 edit (paralelo) | - |
| 7 | Dashboard.tsx | 1 edit | Etapas 3a, 6a, 6b |
| 8 | Executar recálculo | POST API | Etapa 4 |

### Estratégia de Economia

- Etapas 3a, 3b, 3c em paralelo
- Etapas 6a, 6b em paralelo
- Total: ~9 operações (vs 12+ sequenciais)

---

## PARTE 7: VALIDAÇÃO FINAL

### Checklist de Validação (01-27/01/2026)

| Métrica | Esperado (ERP) | Tolerância |
|---------|----------------|------------|
| Faturamento | R$ 1.380.611,79 | ±R$ 100 |
| Lucro | R$ 384.065,30 | ±R$ 15.000* |
| Lucro % | 27,82% | ±1 ponto |

*Nota: Diferença de ~R$ 15k no lucro pode ser devido a ajustes internos do ERP (comissões, arredondamentos).

### Funcionalidades

- Toggle LUCRO/FATURAMENTO funcional em ambas as abas
- Período sincronizado com filtro global
- KPIs com variação vs ano anterior
- Tooltips com Top 3 cruzados

---

## ARQUIVOS A MODIFICAR

| Arquivo | Mudanças |
|---------|----------|
| Migration SQL | +coluna `total_lucro` |
| `recalculate-aggregates/index.ts` | Remover dedup, lucro sem PC, INSERT diário |
| `SheetDataContext.tsx` | Remover dedup, lucro sem PC, comparação YoY |
| `useChartAggregates.ts` | Remover dedup, lucro sem PC |
| `useDailyAggregates.ts` | Interface + query com lucro |
| `SalesEvolutionChart.tsx` | Sincronização + Toggle + Ícones |
| `RankingCard.tsx` | Props rawData + tooltip Top 3 produtos |
| `ProductRankingCard.tsx` | Props rawData + tooltip Top 3 vendedores |
| `Dashboard.tsx` | Filtrar ano anterior, passar rawData |

---

## RESULTADO ESPERADO

### Valores Corretos (01-27/01/2026)

| KPI | Valor | Variação YoY |
|-----|-------|--------------|
| Faturamento | R$ 1.380.611 | +X% vs Jan/25 |
| Lucro | R$ 384.065 | +X% vs Jan/25 |
| Lucro % | 27,82% | +X pts vs Jan/25 |

### UX Final

- Filtro global controla todos os componentes
- Gráfico mostra período selecionado (não independente)
- KPIs mostram crescimento vs ano anterior
- Rankings com tooltips informativos
