
# Plano: Corrigir Carregamento do Gráfico de Evolução de Vendas

## Problemas Identificados

| # | Problema | Impacto |
|---|----------|---------|
| 1 | `useAggregateCalculator` não salva `total_lucro` nos agregados diários | Lucro sempre zero na visualização mensal |
| 2 | `useAggregateCalculator` não salva `total_lucro` nos agregados mensais | Lucro sempre zero na visualização anual |
| 3 | `isInitialMountRef` impede sincronização inicial do ano no gráfico | Gráfico ignora o ano selecionado nos filtros na primeira renderização |

---

## Solução

### 1. Atualizar `useAggregateCalculator.ts` - Adicionar campo `lucro`

**Alterações necessárias:**

a) Adicionar campo `lucro` em todas as estruturas de dados:
```typescript
// Linha ~64-69: Monthly Map
const monthlyMap = new Map<string, {
  filial: string;
  colaborador: string | null;
  faturamento: number;
  lucro: number;  // ADICIONAR
  vendas: number;
}>();
```

b) Acumular lucro durante o processamento:
```typescript
// Adicionar após cada linha de faturamento
agg.lucro += row.Lucro || 0;
```

c) Incluir `total_lucro` nas linhas de insert:
```typescript
// monthlyRows
monthlyRows.push({
  year, month,
  filial: agg.filial,
  colaborador: agg.colaborador,
  faturamento: agg.faturamento,
  total_lucro: agg.lucro,  // ADICIONAR
  quantidade_vendas: agg.vendas,
  updated_at: new Date().toISOString(),
});

// dailyRows
dailyRows.push({
  date: entry.date,
  filial: entry.filial,
  colaborador: entry.colaborador,
  faturamento: entry.faturamento,
  total_lucro: entry.lucro,  // ADICIONAR
  quantidade_vendas: entry.vendas,
});
```

### 2. Atualizar `SalesEvolutionChart.tsx` - Corrigir sincronização inicial

**Alteração necessária:**

Remover a condição `!isInitialMountRef.current` para permitir sincronização na primeira renderização:

```typescript
// ANTES (linha ~193-200)
useEffect(() => {
  if (dateFrom && !isInitialMountRef.current) {
    setSelectedMonth(dateFrom.getMonth());
    setSelectedYear(dateFrom.getFullYear());
    setSelectedYearForAnnual(dateFrom.getFullYear());
  }
  isInitialMountRef.current = false;
}, [dateFrom]);

// DEPOIS
useEffect(() => {
  if (dateFrom) {
    setSelectedMonth(dateFrom.getMonth());
    setSelectedYear(dateFrom.getFullYear());
    setSelectedYearForAnnual(dateFrom.getFullYear());
  }
}, [dateFrom]);
```

E remover a declaração `isInitialMountRef` que não será mais necessária.

---

## Arquivos a Modificar

| Arquivo | Operação | Descrição |
|---------|----------|-----------|
| `src/hooks/useAggregateCalculator.ts` | Editar | Adicionar campo `lucro` em todas as estruturas e salvamentos |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Editar | Remover bloqueio de sincronização inicial |

---

## Detalhes Técnicos

### Estruturas de dados a atualizar em useAggregateCalculator.ts:

1. **monthlyMap** (linha 64): adicionar `lucro: number`
2. **filialTotals** (linha 71): adicionar `lucro: number`
3. **dailyMap** (linha 80): adicionar `lucro: number`
4. **filialDailyTotals** (linha 88): adicionar `lucro: number`
5. **globalDailyTotals** (linha 89): adicionar `lucro: number`

### Acumuladores a adicionar:

- Linha 119 (após faturamento): `agg.lucro += row.Lucro || 0;`
- Linha 128 (após faturamento): `ft.lucro += row.Lucro || 0;`
- Linha 140 (após faturamento): `entry.lucro += row.Lucro || 0;`
- Linha 153 (após faturamento): `fdt.lucro += row.Lucro || 0;`
- Linha 161 (após faturamento): `gt.lucro += row.Lucro || 0;`

### Campos a incluir no insert:

- `monthlyRows` (linhas 218-250): adicionar `total_lucro: agg.lucro`
- `dailyRows` (linhas 273-302): adicionar `total_lucro: entry.lucro`
- Global total (linhas 240-251): adicionar lucro ao reduce e ao insert

---

## Fluxo de Execução

```text
1. Editar useAggregateCalculator.ts
   └── Adicionar lucro em todas as estruturas
   └── Adicionar acumuladores de lucro
   └── Incluir total_lucro nos inserts

2. Editar SalesEvolutionChart.tsx
   └── Remover isInitialMountRef
   └── Sincronizar ano com filtro na montagem inicial

3. Recarregar dados do ERP (ou recalcular agregados)
   └── Os novos agregados incluirão total_lucro
   └── O gráfico carregará o ano correto dos filtros
```

---

## Resultado Esperado

- O gráfico carregará automaticamente o ano selecionado nos filtros globais (2026)
- Os agregados salvos pelo frontend incluirão `total_lucro`
- A visualização mensal mostrará dados de lucro corretamente
- Consistência total entre faturamento e lucro em todas as visualizações
