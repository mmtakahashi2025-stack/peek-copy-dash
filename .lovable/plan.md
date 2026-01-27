
# Plano: Corrigir Gráfico de Evolução de Vendas - Comparativo Anual

## Problema Identificado

O gráfico de **Evolução de Vendas** mostra "Dados de 2025 não disponíveis para comparação" mesmo tendo todos os meses de 2025 no banco de dados.

### Causa Raiz
O `rawData` usado pelo gráfico só contém os dados do **período filtrado no Dashboard** (por padrão: último mês completo = Dezembro/2025).

Quando o usuário seleciona 2026 no gráfico e tenta comparar com 2025, o `rawData` só tem Dezembro/2025, então os outros 11 meses aparecem zerados, acionando a mensagem de "dados não disponíveis".

### Fluxo Atual (Problemático)
```text
Dashboard: filtro = Dez/2025
    ↓
loadErpData(Dez/2025)
    ↓
rawData = [apenas registros de Dez/2025]
    ↓
SalesEvolutionChart usa rawData
    ↓
Gráfico 2026 vs 2025: só encontra dados de Dez/2025
    ↓
"Dados de 2025 não disponíveis"
```

---

## Solução Proposta

O gráfico de evolução de vendas precisa de **dados completos dos anos** para funcionar corretamente. Vamos criar uma fonte de dados separada para o gráfico que carrega os anos completos do cache, independente do filtro do Dashboard.

### Abordagem: Dados Anuais Dedicados para o Gráfico

1. **Criar novo estado no SheetDataContext** para armazenar dados anuais completos (`yearlyRawData`)
2. **Nova função `loadYearlyData`** que carrega anos inteiros do cache para o gráfico
3. **SalesEvolutionChart usa `yearlyRawData`** em vez de `rawData`

---

## Arquivos a Modificar

### 1. `src/contexts/SheetDataContext.tsx`

**Adicionar novo estado e função:**

```tsx
// Novo estado para dados anuais (usado pelo gráfico de evolução)
const [yearlyRawData, setYearlyRawData] = useState<RawSaleRow[]>([]);

// Função para carregar anos completos do cache
const loadYearlyData = useCallback(async (years: number[]) => {
  const allData: RawSaleRow[] = [];
  
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const monthData = await getMonthData(year, month);
      if (monthData) {
        allData.push(...monthData);
      }
    }
  }
  
  setYearlyRawData(allData);
}, [getMonthData]);
```

**Expor no contexto:**
```tsx
value={{
  // ... existentes
  yearlyRawData,
  loadYearlyData,
}}
```

---

### 2. `src/hooks/useErpCache.ts`

**Adicionar função `getMonthData`** (se não existir) para buscar dados de um mês específico do cache:

```tsx
const getMonthData = useCallback(async (year: number, month: number): Promise<RawSaleRow[] | null> => {
  const { data, error } = await supabase
    .from('erp_cache')
    .select('data')
    .eq('year', year)
    .eq('month', month)
    .single();
    
  if (error || !data) return null;
  return data.data as RawSaleRow[];
}, []);
```

---

### 3. `src/components/dashboard/SalesEvolutionChart.tsx`

**Alterar para usar `yearlyRawData`:**

```tsx
export function SalesEvolutionChart({ filialId = 'todas' }) {
  const { yearlyRawData, loadYearlyData } = useSheetData();
  
  // Carregar anos relevantes quando o componente monta ou ano selecionado muda
  useEffect(() => {
    const yearsToLoad = [selectedYearForAnnual, selectedYearForAnnual - 1];
    loadYearlyData(yearsToLoad);
  }, [selectedYearForAnnual, loadYearlyData]);
  
  // Usar yearlyRawData em vez de rawData
  const yearlyComparisonData = useMemo(() => {
    const filialFiltered = filialId === 'todas' 
      ? yearlyRawData  // ← Alterado de rawData para yearlyRawData
      : yearlyRawData.filter(r => normalizeFilialId(r.Filial) === filialId);
    // ... resto igual
  }, [yearlyRawData, filialId, selectedYearForAnnual]);
}
```

---

## Comportamento Esperado Após Implementação

| Cenário | Antes | Depois |
|---------|-------|--------|
| Gráfico 2026 vs 2025 | "Dados de 2025 não disponíveis" | Mostra barras comparativas de todos os meses |
| Filtro Dashboard: Dez/2025 | Afeta gráfico de evolução | Não afeta - gráfico tem dados próprios |
| Cache com anos incompletos | Mostra mensagem de erro | Mostra dados disponíveis, omite meses sem dados |

---

## Fluxo Após Correção

```text
Dashboard: filtro = Dez/2025
    ↓
loadErpData(Dez/2025)
    ↓
rawData = [registros de Dez/2025] ← usado pelos KPIs e rankings

SalesEvolutionChart monta
    ↓
loadYearlyData([2026, 2025])
    ↓
yearlyRawData = [todos os registros de 2025 + 2026 do cache]
    ↓
Gráfico 2026 vs 2025: encontra todos os meses
    ↓
Barras comparativas funcionando!
```

---

## Otimizações Adicionais

1. **Cache local no componente**: Evitar recarregar anos já carregados
2. **Loading state**: Mostrar skeleton enquanto carrega dados anuais
3. **Memo dos anos**: Só recarregar quando o ano selecionado mudar de verdade

---

## Resumo de Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useErpCache.ts` | Adicionar `getMonthData()` para buscar mês específico |
| `src/contexts/SheetDataContext.tsx` | Adicionar `yearlyRawData` e `loadYearlyData()` |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Usar `yearlyRawData` e chamar `loadYearlyData` no mount |
