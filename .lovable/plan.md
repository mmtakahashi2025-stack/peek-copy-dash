

# Plano: Melhorias no Card de Evolução de Vendas

## Resumo das Mudanças Solicitadas

1. **Excluir a visão semanal** do card de evolução de vendas
2. **Adicionar legendas** abaixo do gráfico indicando o melhor e pior mês do ano
3. **Adicionar lucro ao tooltip** (não apenas faturamento)
4. **Adicionar toggle Faturamento/Lucro** para alternar a visualização principal do gráfico

---

## Mudanças Necessárias

### 1. Alteração no Banco de Dados

Adicionar campo `total_lucro` à tabela `erp_monthly_aggregates`:

```sql
ALTER TABLE erp_monthly_aggregates 
ADD COLUMN IF NOT EXISTS total_lucro NUMERIC DEFAULT 0;
```

---

### 2. Modificar `src/hooks/useChartAggregates.ts`

- Adicionar campo `lucro: number` na interface `MonthlyAggregate`
- Adicionar campos `lucro: number` e `lucroAnterior: number` na interface `ChartDataPoint`
- Incluir `total_lucro` no SELECT da query `fetchAggregates`
- Atualizar `getYearlyChartData` para incluir lucro nos dados retornados

---

### 3. Modificar `src/components/dashboard/SalesEvolutionChart.tsx`

#### 3.1 Remover Visão Semanal

- Remover a aba "SEMANA" e todo o conteúdo associado
- Remover estados: `selectedWeek`, `weeklyData`, `isLoadingWeekly`, etc.
- Simplificar para apenas duas abas: ANO e MÊS

#### 3.2 Adicionar Toggle Faturamento/Lucro

Novo estado e controle:
```typescript
const [viewMode, setViewMode] = useState<'faturamento' | 'lucro'>('faturamento');
```

Interface visual com botões de toggle:
```
╔══════════════════════════════════════════════════════════════╗
║  Evolução de Vendas                                          ║
╠══════════════════════════════════════════════════════════════╣
║  [ ANO ]  [ MÊS ]                         [FATURAMENTO|LUCRO]║
║                                                              ║
║  ANO [2025 ▾]  comparado com 2024                            ║
║  ■ 2025 (atual)   ■ 2024 (anterior)                          ║
╚══════════════════════════════════════════════════════════════╝
```

O gráfico de barras usa dinamicamente:
- `dataKey={viewMode === 'faturamento' ? 'faturamento' : 'lucro'}`
- `dataKey={viewMode === 'faturamento' ? 'faturamentoAnterior' : 'lucroAnterior'}`

#### 3.3 Adicionar Legendas de Melhor/Pior Mês

Cálculo baseado no modo de visualização ativo:
```typescript
const bestAndWorstMonth = useMemo(() => {
  const metric = viewMode === 'faturamento' ? 'faturamento' : 'lucro';
  const monthsWithData = yearlyComparisonData.filter(d => d[metric] > 0);
  
  if (monthsWithData.length === 0) return null;
  
  const best = monthsWithData.reduce((max, curr) => 
    curr[metric] > max[metric] ? curr : max
  );
  const worst = monthsWithData.reduce((min, curr) => 
    curr[metric] < min[metric] ? curr : min
  );
  
  return { best, worst, metric };
}, [yearlyComparisonData, viewMode]);
```

Renderização abaixo do gráfico:
```
📈 Melhor: Dezembro - R$ 1.850.000    ↑ +15.2%
📉 Pior: Fevereiro - R$ 620.000       ↓ -8.5%
```

#### 3.4 Atualizar Tooltip

O tooltip sempre mostra ambos (faturamento e lucro), independente do modo:
```
┌─────────────────────────────┐
│  Dezembro                   │
│  ───────────────────────    │
│  Faturamento:               │
│  R$ 1.850.000  (+15.2%)     │
│                             │
│  Lucro:                     │
│  R$ 370.000  (+18.5%)       │
│  ───────────────────────    │
│  Ano anterior:              │
│  Fat: R$ 1.606.000          │
│  Lucro: R$ 312.000          │
└─────────────────────────────┘
```

---

### 4. Atualizar Edge Function

Modificar `supabase/functions/recalculate-aggregates/index.ts` para calcular e salvar `total_lucro` junto com os demais campos ao processar os dados mensais.

---

## Interface Visual Final

```
╔══════════════════════════════════════════════════════════════════════════╗
║  Evolução de Vendas                                                      ║
╠══════════════════════════════════════════════════════════════════════════╣
║  ┌─────┐ ┌─────┐                                    ┌────────────────┐   ║
║  │ ANO │ │ MÊS │                                    │FATURAMENTO│LUCRO│  ║
║  └─────┘ └─────┘                                    └────────────────┘   ║
║                                                                          ║
║  ANO [2025 ▾]  comparado com 2024                                        ║
║  ■ 2025 (atual)   ■ 2024 (anterior)                                      ║
║                                                                          ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │                    ▇▇                                              │  ║
║  │  ▇▇               ▇▇▇  ▇▇                                         │  ║
║  │  ▇▇  ▇▇      ▇▇  ▇▇▇  ▇▇  ▇▇                                      │  ║
║  │  ▇▇  ▇▇  ▇▇  ▇▇  ▇▇▇  ▇▇  ▇▇  ▇▇  ▇▇  ▇▇  ▇▇  ▇▇                  │  ║
║  │  Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez                   │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║  📈 Melhor: Dezembro - R$ 1.850.000    ↑ +15.2%                          ║
║  📉 Pior: Fevereiro - R$ 620.000       ↓ -8.5%                           ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | Adicionar coluna `total_lucro` em `erp_monthly_aggregates` |
| `src/hooks/useChartAggregates.ts` | Incluir lucro nas interfaces e queries |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Remover SEMANA, adicionar toggle, legendas, tooltip |
| `supabase/functions/recalculate-aggregates/index.ts` | Calcular e salvar lucro |

---

## Fluxo de Implementação

```text
1. Migração DB: Adicionar coluna total_lucro
            |
            v
2. Atualizar useChartAggregates hook
   - Incluir lucro no fetch e cálculo
            |
            v
3. Refatorar SalesEvolutionChart
   - Remover aba SEMANA (~200 linhas)
   - Adicionar toggle Faturamento/Lucro
   - Adicionar legendas melhor/pior mês
   - Atualizar tooltip com lucro
            |
            v
4. Atualizar recalculate-aggregates
   - Incluir cálculo de lucro
            |
            v
5. Executar recálculo para popular lucro histórico
```

---

## Considerações Técnicas

- O toggle usa `ToggleGroup` do shadcn/ui para consistência visual
- As legendas de melhor/pior mês se adaptam ao modo de visualização selecionado
- O tooltip sempre mostra informação completa (faturamento + lucro) para contexto
- Após implementação, será necessário executar o recálculo de agregados para popular o campo `total_lucro` nos dados históricos

