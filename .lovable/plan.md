

# Plano: Integrar Filtros do Dashboard no Modulo de Evolucao de Vendas

## Contexto Atual

O componente `SalesEvolutionChart` recebe os parametros de filtro do Dashboard:
- `filialId` - Ja utilizado
- `dateFrom` / `dateTo` - **NAO utilizado**
- `compareEnabled` / `compareDateFrom` / `compareDateTo` - **NAO utilizado**

Atualmente, o grafico tem seletores internos independentes (ano, mes) que ignoram completamente os filtros aplicados pelo usuario no Dashboard.

---

## Comportamento Proposto

### Tab "Anual"
- **Ano selecionado**: Extraido automaticamente de `dateFrom` do filtro
- **Comparativo**: Quando `compareEnabled=true`, usar `compareDateFrom` para definir o ano de comparacao (em vez de sempre usar ano-1)
- **Manter seletor de ano**: Usuario pode sobrescrever, mas default vem do filtro

### Tab "Mensal"
- **Mes e ano selecionados**: Extraidos automaticamente de `dateFrom` do filtro
- **Manter seletores de mes/ano**: Usuario pode ajustar, mas default vem do filtro

### Filtro de Filial
- Ja funciona corretamente (usa `filialId`)

### Filtro de Colaborador
- **NOVO**: Adicionar suporte para filtrar por colaborador no grafico
- Prop `colaboradorId` a ser adicionada

---

## Alteracoes Tecnicas

### 1. `src/components/dashboard/SalesEvolutionChart.tsx`

**Atualizar interface de props:**
```typescript
interface SalesEvolutionChartProps {
  filialId?: string;
  colaboradorId?: string;  // NOVO
  dateFrom?: Date;
  dateTo?: Date;
  compareEnabled?: boolean;
  compareDateFrom?: Date;
  compareDateTo?: Date;
}
```

**Sincronizar estado inicial com filtros:**
```typescript
// Extrair mes/ano dos filtros quando definidos
const [selectedMonth, setSelectedMonth] = useState(() => {
  return dateFrom ? dateFrom.getMonth() : new Date().getMonth();
});

const [selectedYear, setSelectedYear] = useState(() => {
  return dateFrom ? dateFrom.getFullYear() : new Date().getFullYear();
});

const [selectedYearForAnnual, setSelectedYearForAnnual] = useState(() => {
  return dateFrom ? dateFrom.getFullYear() : new Date().getFullYear();
});
```

**Reagir a mudancas nos filtros:**
```typescript
// Atualizar estado quando filtros do dashboard mudarem
useEffect(() => {
  if (dateFrom) {
    setSelectedMonth(dateFrom.getMonth());
    setSelectedYear(dateFrom.getFullYear());
    setSelectedYearForAnnual(dateFrom.getFullYear());
  }
}, [dateFrom]);
```

**Usar ano de comparacao do filtro:**
```typescript
// Determinar ano de comparacao
const previousYear = useMemo(() => {
  if (compareEnabled && compareDateFrom) {
    return compareDateFrom.getFullYear();
  }
  return selectedYearForAnnual - 1;
}, [compareEnabled, compareDateFrom, selectedYearForAnnual]);
```

**Adicionar filtro de colaborador:**
```typescript
const yearlyComparisonData = useMemo(() => {
  let filtered = yearlyRawData;
  
  // Filtrar por filial
  if (filialId !== 'todas') {
    filtered = filtered.filter(r => normalizeFilialId(r.Filial) === filialId);
  }
  
  // NOVO: Filtrar por colaborador
  if (colaboradorId && colaboradorId !== 'todos') {
    filtered = filtered.filter(r => r.Emissor === colaboradorId);
  }
  
  // ... resto do calculo
}, [yearlyRawData, filialId, colaboradorId, selectedYearForAnnual]);
```

**Exibir indicador de comparacao dinamica:**
```typescript
// No JSX, mostrar label de comparacao baseado no filtro
<span className="text-sm text-muted-foreground">
  vs {previousYear}
  {compareEnabled && " (filtro)"}
</span>
```

---

### 2. `src/pages/Dashboard.tsx`

**Passar prop de colaborador para o grafico:**
```typescript
<SalesEvolutionChart 
  filialId={filters.filial}
  colaboradorId={filters.colaborador}  // NOVO
  dateFrom={filters.dateFrom}
  dateTo={filters.dateTo}
  compareEnabled={filters.compareEnabled}
  compareDateFrom={filters.compareDateFrom}
  compareDateTo={filters.compareDateTo}
/>
```

---

## Fluxo de Dados Atualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│                     DashboardFilters                             │
│   dateFrom, dateTo, filial, colaborador, compare settings       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ onFiltersChange
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard.tsx                             │
│                      filters state                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ props
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SalesEvolutionChart                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ useEffect: Sincroniza estado interno com props dos filtros│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  selectedYearForAnnual ← dateFrom.getFullYear()                 │
│  selectedMonth ← dateFrom.getMonth()                            │
│  selectedYear ← dateFrom.getFullYear()                          │
│  previousYear ← compareEnabled ? compareDateFrom.year : year-1  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comportamento do Usuario

| Acao | Resultado |
|------|-----------|
| Selecionar "Dezembro/2025" no filtro | Tab Mensal mostra Dez/2025, Tab Anual mostra 2025 |
| Ativar "Comparar" com "Dezembro/2024" | Tab Anual mostra barras de 2025 vs 2024 |
| Selecionar filial "Centro" | Grafico filtra dados apenas da filial Centro |
| Selecionar colaborador "Joao" | Grafico mostra apenas vendas do Joao |
| Mudar ano manualmente no grafico | Sobrescreve temporariamente o filtro |

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `SalesEvolutionChart.tsx` | Sincronizar estado com props `dateFrom`, `dateTo` |
| `SalesEvolutionChart.tsx` | Usar `compareDateFrom` para ano de comparacao |
| `SalesEvolutionChart.tsx` | Adicionar filtro por `colaboradorId` |
| `Dashboard.tsx` | Passar `colaboradorId` para o componente |

---

## Resultado Esperado

O modulo de Evolucao de Vendas agora:
1. Responde automaticamente aos filtros de data do Dashboard
2. Usa o periodo de comparacao definido pelo usuario (quando ativado)
3. Filtra por filial E colaborador
4. Mantém a opcao de ajuste manual para exploracao independente

