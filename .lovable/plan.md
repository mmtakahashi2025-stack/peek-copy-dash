
# Revisao Completa: Modulo de Evolucao de Vendas

## Problemas Identificados

### 1. Grafico Mensal (Vendas por Dia) - Fonte de Dados Incorreta
**Linha 209-211 do SalesEvolutionChart.tsx:**
```tsx
const dailyData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? rawData    // PROBLEMA: usa rawData do Dashboard
    : rawData.filter(...)
```

O grafico mensal usa `rawData` (dados filtrados pelo Dashboard) em vez de `yearlyRawData` (cache completo). Quando o Dashboard esta filtrado para Janeiro/2026, e o usuario seleciona Dezembro/2025 no grafico, nao encontra dados.

### 2. Carregamento de Anos Incompleto
O `loadYearlyData` so carrega os anos do grafico anual (`selectedYearForAnnual` e `selectedYearForAnnual - 1`), mas ignora o ano selecionado no grafico mensal (`selectedYear`).

### 3. Carregamento Sequencial Lento
Cada mes e buscado sequencialmente (um apos o outro), tornando o carregamento de 24 meses muito lento (~24 requisicoes sequenciais).

---

## Solucao Proposta

### Arquitetura Otimizada

```text
┌─────────────────────────────────────────────────────────────┐
│                    SalesEvolutionChart                       │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │   Aba Anual     │         │   Aba Mensal    │            │
│  │  (12 meses)     │         │  (dias do mes)  │            │
│  └────────┬────────┘         └────────┬────────┘            │
│           │                           │                      │
│           └──────────┬────────────────┘                      │
│                      ▼                                       │
│              yearlyRawData                                   │
│           (cache unificado)                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  loadYearlyData()                            │
│        Carrega anos em PARALELO do banco                     │
│   (selectedYearForAnnual, selectedYearForAnnual-1,          │
│    selectedYear do grafico mensal)                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Alteracoes por Arquivo

### 1. `src/components/dashboard/SalesEvolutionChart.tsx`

#### 1.1 Corrigir Fonte de Dados do Grafico Mensal
Alterar `dailyData` para usar `yearlyRawData`:

```tsx
// ANTES (linha 208-237)
const dailyData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? rawData    // ERRADO
    : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);
  ...
}, [rawData, filialId, selectedMonth, selectedYear]);

// DEPOIS
const dailyData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? yearlyRawData    // CORRETO
    : yearlyRawData.filter(r => normalizeFilialId(r.Filial) === filialId);
  ...
}, [yearlyRawData, filialId, selectedMonth, selectedYear]);
```

#### 1.2 Incluir Ano do Grafico Mensal no Carregamento
Atualizar o useEffect para carregar todos os anos necessarios:

```tsx
// ANTES (linhas 131-143)
const yearsKey = `${selectedYearForAnnual}-${selectedYearForAnnual - 1}`;
const yearsToLoad = [selectedYearForAnnual, selectedYearForAnnual - 1];

// DEPOIS - Incluir ano do grafico mensal
const yearsSet = new Set([
  selectedYearForAnnual,
  selectedYearForAnnual - 1,
  selectedYear,  // Ano selecionado no grafico mensal
]);
const yearsToLoad = Array.from(yearsSet).sort((a, b) => b - a);
const yearsKey = yearsToLoad.join('-');
```

Adicionar `selectedYear` as dependencias:

```tsx
}, [selectedYearForAnnual, selectedYear, loadYearlyData, user, authLoading, yearlyRawData.length]);
```

#### 1.3 Adicionar Loading State ao Grafico Mensal

```tsx
// ANTES (linha 375)
{!hasDailyData ? (
  <div className="h-full flex items-center justify-center text-muted-foreground">
    {rawData.length === 0 
      ? 'Carregue dados para visualizar o grafico'
      : `Nenhum dado encontrado...`}
  </div>
) : (...)}

// DEPOIS - Adicionar skeleton durante loading
{isLoadingYearly ? (
  <div className="h-full flex flex-col gap-2 p-4">
    <Skeleton className="h-full w-full" />
  </div>
) : !hasDailyData ? (
  <div className="h-full flex items-center justify-center text-muted-foreground">
    {yearlyRawData.length === 0 
      ? 'Carregando dados...'
      : `Nenhum dado encontrado para ${mesesCompletos[selectedMonth]}/${selectedYear}`}
  </div>
) : (...)}
```

---

### 2. `src/contexts/SheetDataContext.tsx`

#### 2.1 Otimizar Carregamento Paralelo
Modificar `loadYearlyData` para buscar meses em paralelo (mais rapido):

```tsx
const loadYearlyData = useCallback(async (years: number[]) => {
  if (years.length === 0) return;
  
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (!currentUser) {
    console.log('[YearlyData] User not available yet, skipping load');
    return;
  }
  
  setIsLoadingYearly(true);
  
  try {
    // Gerar lista de todos os meses a buscar
    const monthsToFetch: { year: number; month: number }[] = [];
    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        monthsToFetch.push({ year, month });
      }
    }
    
    // Buscar todos os meses em PARALELO (muito mais rapido)
    const results = await Promise.all(
      monthsToFetch.map(async ({ year, month }) => {
        const data = await getMonthData(year, month);
        if (data) {
          console.log(`[YearlyData] Loaded ${year}-${month}: ${data.length} records`);
        }
        return data || [];
      })
    );
    
    // Combinar todos os resultados
    const allData = results.flat();
    setYearlyRawData(allData);
    console.log(`[YearlyData] Total: ${allData.length} records for years: ${years.join(', ')}`);
  } catch (error) {
    console.error('[YearlyData] Error loading yearly data:', error);
  } finally {
    setIsLoadingYearly(false);
  }
}, [getMonthData]);
```

#### 2.2 Adicionar Cache Inteligente de Anos
Evitar recarregar anos ja carregados:

```tsx
// Novo estado para rastrear anos ja carregados
const [loadedYears, setLoadedYears] = useState<Set<number>>(new Set());

const loadYearlyData = useCallback(async (years: number[]) => {
  // Filtrar apenas anos que ainda nao foram carregados
  const newYears = years.filter(y => !loadedYears.has(y));
  
  if (newYears.length === 0) {
    console.log('[YearlyData] All years already loaded:', years.join(', '));
    return;
  }
  
  // ... buscar apenas newYears ...
  
  // Mesclar novos dados com dados existentes
  setYearlyRawData(prev => {
    const combined = [...prev, ...allData];
    // Remover duplicatas por ID de venda + data
    const unique = Array.from(
      new Map(combined.map(r => [`${r['Venda #']}-${r['Data Venda']}`, r])).values()
    );
    return unique;
  });
  
  // Marcar anos como carregados
  setLoadedYears(prev => new Set([...prev, ...newYears]));
}, [getMonthData, loadedYears]);
```

---

### 3. `src/hooks/useErpCache.ts`

#### 3.1 Adicionar Funcao de Busca em Lote
Nova funcao para buscar multiplos meses de uma vez (mais eficiente):

```tsx
// Buscar multiplos meses de uma vez
const getMultipleMonthsData = useCallback(async (
  months: { year: number; month: number }[]
): Promise<Map<string, RawSaleRow[]>> => {
  let currentUser = user;
  if (!currentUser) {
    const { data } = await supabase.auth.getUser();
    currentUser = data.user;
  }
  
  if (!currentUser) return new Map();
  
  const result = new Map<string, RawSaleRow[]>();
  
  // Buscar todos os meses de uma unica query
  const { data, error } = await supabase
    .from('erp_cache')
    .select('year, month, data, record_count')
    .or(months.map(m => `and(year.eq.${m.year},month.eq.${m.month})`).join(','));
  
  if (error || !data) {
    console.error('[Cache] Error loading multiple months:', error);
    return result;
  }
  
  for (const row of data) {
    const key = `${row.year}-${row.month}`;
    const rawData = row.data as unknown;
    if (Array.isArray(rawData)) {
      result.set(key, rawData as RawSaleRow[]);
      console.log(`[Cache] Batch loaded ${key}: ${row.record_count} records`);
    }
  }
  
  return result;
}, [user]);
```

---

## Resumo das Alteracoes

| Arquivo | Alteracao | Impacto |
|---------|-----------|---------|
| `SalesEvolutionChart.tsx` | Usar `yearlyRawData` no grafico mensal | Corrige "dados nao encontrados" |
| `SalesEvolutionChart.tsx` | Incluir `selectedYear` no carregamento | Garante dados para qualquer mes selecionado |
| `SalesEvolutionChart.tsx` | Adicionar skeleton no grafico mensal | Melhor UX durante loading |
| `SheetDataContext.tsx` | Carregamento paralelo com `Promise.all` | 5-10x mais rapido |
| `SheetDataContext.tsx` | Cache de anos carregados | Evita requisicoes duplicadas |
| `useErpCache.ts` | Funcao de busca em lote | Menos requisicoes ao banco |

---

## Resultado Esperado

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tempo de carregamento (24 meses) | ~24 segundos | ~2-3 segundos |
| Grafico mensal Dez/2025 com filtro Jan/2026 | "Dados nao encontrados" | Mostra barras diarias |
| Trocar ano no grafico mensal | Demora ou falha | Instantaneo (cache) |
| Requisicoes ao banco por ano | 12 sequenciais | 1 batch ou paralelo |

---

## Fluxo Corrigido

```text
Usuario abre Dashboard (filtro: Jan/2026)
    │
    ├─▶ rawData = [registros Jan/2026] (usado por KPIs)
    │
    └─▶ SalesEvolutionChart monta
           │
           ├─▶ loadYearlyData([2026, 2025]) em PARALELO
           │      └─▶ yearlyRawData = [~130.000 registros]
           │
           ├─▶ Aba Anual: usa yearlyRawData ✓
           │
           └─▶ Aba Mensal: usa yearlyRawData ✓
                  │
                  └─▶ Usuario seleciona Dez/2025
                         │
                         └─▶ Encontra dados! Barras aparecem ✓
```
