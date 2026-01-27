
# Plano Completo: Corrigir Carregamento de Dados Anuais do Gráfico

## Problema Identificado (Causa Raiz)

O gráfico mostra "Dados não disponíveis" porque existe uma **condição de corrida** (race condition):

### Sequência Problemática:
```text
1. SalesEvolutionChart monta
2. useEffect dispara loadYearlyData([2025, 2024])
3. loadYearlyData chama getMonthData(2025, 1), getMonthData(2025, 2), ...
4. getMonthData chama loadMonthFromCache(year, month)
5. loadMonthFromCache verifica: if (!user) return null  ← PROBLEMA!
6. O user ainda não foi carregado (está null ou undefined)
7. Todos os meses retornam null
8. yearlyRawData = [] (vazio)
9. Gráfico mostra "Dados não disponíveis"
```

### Evidência no Código:

**useErpCache.ts - linha 113-114:**
```tsx
const loadMonthFromCache = useCallback(async (year: number, month: number) => {
  if (!user) return null;  // <-- RETORNA NULL SE USER NÃO CARREGOU
```

**SalesEvolutionChart.tsx - linha 114-117:**
```tsx
useEffect(() => {
  const yearsToLoad = [selectedYearForAnnual, selectedYearForAnnual - 1];
  loadYearlyData(yearsToLoad);  // <-- DISPARA IMEDIATAMENTE
}, [selectedYearForAnnual, loadYearlyData]);
```

---

## Solução Proposta

### Abordagem: Garantir que User está Disponível + Retry Automático

Modificar o fluxo para:
1. **Aguardar user carregado** antes de tentar buscar dados
2. **Re-executar** quando user ficar disponível
3. **Evitar múltiplas chamadas** com controle de estado

---

## Arquivos a Modificar

### 1. `src/contexts/SheetDataContext.tsx`

**Modificar `loadYearlyData` para verificar user e expor status:**

```tsx
// Adicionar dependência do user
const loadYearlyData = useCallback(async (years: number[]) => {
  if (years.length === 0) return;
  
  // Verificar se user está disponível via supabase diretamente
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[YearlyData] User not available yet, skipping load');
    return;
  }
  
  setIsLoadingYearly(true);
  const allData: RawSaleRow[] = [];
  
  try {
    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        const monthData = await getMonthData(year, month);
        if (monthData) {
          allData.push(...monthData);
          console.log(`[YearlyData] Loaded ${year}-${month}: ${monthData.length} records`);
        }
      }
    }
    
    setYearlyRawData(allData);
    console.log(`[YearlyData] Total: ${allData.length} records for years: ${years.join(', ')}`);
  } catch (error) {
    console.error('[YearlyData] Error loading yearly data:', error);
  } finally {
    setIsLoadingYearly(false);
  }
}, [getMonthData]);
```

---

### 2. `src/components/dashboard/SalesEvolutionChart.tsx`

**Modificar useEffect para reagir ao user e aguardar carregamento:**

```tsx
import { useAuth } from '@/contexts/AuthContext';

export function SalesEvolutionChart({ filialId = 'todas' }: SalesEvolutionChartProps) {
  const { user, loading: authLoading } = useAuth();
  const { rawData, yearlyRawData, isLoadingYearly, loadYearlyData } = useSheetData();
  
  // ... estados existentes ...
  
  // Track if we've already loaded for this year to avoid duplicate calls
  const [loadedYears, setLoadedYears] = useState<string>('');
  
  // Load yearly data when:
  // 1. User is authenticated (not loading anymore)
  // 2. Selected year changes
  useEffect(() => {
    // Don't load if auth is still loading
    if (authLoading) {
      console.log('[SalesEvolution] Auth still loading, waiting...');
      return;
    }
    
    // Don't load if no user
    if (!user) {
      console.log('[SalesEvolution] No user, skipping load');
      return;
    }
    
    const yearsKey = `${selectedYearForAnnual}-${selectedYearForAnnual - 1}`;
    
    // Avoid reloading same years
    if (loadedYears === yearsKey && yearlyRawData.length > 0) {
      console.log('[SalesEvolution] Years already loaded:', yearsKey);
      return;
    }
    
    console.log('[SalesEvolution] Loading years:', yearsKey);
    const yearsToLoad = [selectedYearForAnnual, selectedYearForAnnual - 1];
    loadYearlyData(yearsToLoad);
    setLoadedYears(yearsKey);
  }, [selectedYearForAnnual, loadYearlyData, user, authLoading, loadedYears, yearlyRawData.length]);

  // ... resto do componente ...
}
```

---

### 3. `src/hooks/useErpCache.ts`

**Melhorar logs e tratamento de erro no getMonthData:**

```tsx
// Modificar getMonthData para logar quando user não disponível
const getMonthData = useCallback(async (year: number, month: number): Promise<RawSaleRow[] | null> => {
  const entry = await loadMonthFromCache(year, month);
  if (!entry) {
    // Log detalhado para debug
    console.log(`[Cache] getMonthData(${year}-${month}): No data found (user: ${user ? 'yes' : 'no'})`);
  }
  return entry?.data || null;
}, [loadMonthFromCache, user]);
```

**Também modificar loadMonthFromCache para buscar user diretamente se necessário:**

```tsx
const loadMonthFromCache = useCallback(async (year: number, month: number): Promise<MonthlyCacheEntry | null> => {
  // Fallback: buscar user diretamente se não disponível via hook
  let currentUser = user;
  if (!currentUser) {
    const { data } = await supabase.auth.getUser();
    currentUser = data.user;
  }
  
  if (!currentUser) {
    console.log(`[Cache] loadMonthFromCache(${year}-${month}): User not available`);
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('erp_cache')
      .select('data, record_count, updated_at')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();
    // ... resto igual
  }
}, [user, isAdmin]);
```

---

## Fluxo Corrigido

```text
1. SalesEvolutionChart monta
2. useEffect verifica: authLoading = true → aguarda
3. Auth carrega user
4. useEffect re-executa: user disponível → continua
5. loadYearlyData([2025, 2024])
6. getMonthData busca cada mês do Supabase
7. yearlyRawData = [todos os registros de 2024 e 2025]
8. Gráfico renderiza barras comparativas corretamente!
```

---

## Melhorias Adicionais

### Debug Visual Temporário
Adicionar indicador de debug na UI para facilitar troubleshooting:

```tsx
{/* Debug info - remover em produção */}
{process.env.NODE_ENV === 'development' && (
  <p className="text-xs text-muted-foreground">
    Debug: {isLoadingYearly ? 'Loading...' : `${yearlyRawData.length} records`}
  </p>
)}
```

### Retry Automático
Se ainda falhar após 2 segundos, tentar novamente:

```tsx
useEffect(() => {
  if (authLoading || !user) return;
  
  const timer = setTimeout(() => {
    if (yearlyRawData.length === 0 && !isLoadingYearly) {
      console.log('[SalesEvolution] Retry loading...');
      loadYearlyData([selectedYearForAnnual, selectedYearForAnnual - 1]);
    }
  }, 2000);
  
  return () => clearTimeout(timer);
}, [yearlyRawData.length, isLoadingYearly, ...]);
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/contexts/SheetDataContext.tsx` | Verificar user via supabase.auth.getUser() antes de carregar dados |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Aguardar authLoading=false e user disponível antes de chamar loadYearlyData |
| `src/hooks/useErpCache.ts` | Fallback para buscar user diretamente + logs de debug |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| 2025 vs 2024 | "Dados não disponíveis" | Barras comparativas de 12 meses |
| Tempo de carregamento | Instantâneo (mas vazio) | ~1-2s (aguarda auth + busca dados) |
| Mensagem durante loading | Nenhuma | Skeleton loading |
| Logs de debug | Poucos | Detalhados para troubleshooting |
