
# Plano: Corrigir Duplicacao de Dados no Grafico de Evolucao

## Problema Identificado

O tooltip do grafico esta mostrando valores incorretos (aproximadamente 2.5x maiores que o esperado) devido a uma duplicacao na soma dos dados agregados.

### Causa Raiz

Quando o filtro `filialId = 'todas'`, a query no `fetchAggregates` nao aplica filtro de filial:

```typescript
// Em useChartAggregates.ts - linha 48-50
if (filialId && filialId !== 'todas') {
  query = query.eq('filial', filialId);
}
```

Isso retorna TODOS os registros com `colaborador IS NULL`:

| filial | faturamento (Jan/2026) |
|--------|------------------------|
| Combo Iguassu | 325.261 |
| Combo Iguassu Agencias | 92.244 |
| Combo Iguassu Cataratas | 313.233 |
| Combo Iguassu Web | 644.446 |
| **todas** | **1.375.184** (total consolidado) |

O `getYearlyChartData` soma TODOS esses registros:
```typescript
const currentYearData = aggregateData
  .filter(a => a.year === currentYear && a.month === month)
  .reduce((sum, a) => sum + a.faturamento, 0);
```

**Resultado:** 325.261 + 92.244 + 313.233 + 644.446 + 1.375.184 = **2.750.368** (ERRADO!)

O valor correto e apenas **1.375.184** (o registro `filial = 'todas'`).

---

## Solucao

Modificar a query para filtrar `filial = 'todas'` quando o usuario seleciona "todas" as filiais:

```typescript
// ANTES (errado):
if (filialId && filialId !== 'todas') {
  query = query.eq('filial', filialId);
}

// DEPOIS (correto):
if (filialId === 'todas') {
  query = query.eq('filial', 'todas');
} else if (filialId) {
  query = query.eq('filial', filialId);
}
```

---

## Arquivo a Modificar

### `src/hooks/useChartAggregates.ts`

| Linha | Mudanca |
|-------|---------|
| 47-50 | Adicionar filtro explicito para `filial = 'todas'` |

### Codigo Atualizado:

```typescript
// Filter by filial
if (filialId === 'todas' || !filialId) {
  // When "todas" is selected, use the pre-calculated total
  query = query.eq('filial', 'todas');
} else {
  // When a specific filial is selected
  query = query.eq('filial', filialId);
}
```

---

## Validacao dos Valores

Apos a correcao, os valores esperados serao:

| Mes | Ano Atual (2026) | Ano Anterior (2025) | Variacao |
|-----|------------------|---------------------|----------|
| Jan | R$ 1.375.184 | R$ 1.736.631 | -20.8% |

---

## Impacto

- Corrige duplicacao para filtro "todas" (que e o padrao)
- Mantem comportamento correto para filiais especificas
- Sem impacto em outras funcionalidades
- Mudanca minima (apenas 4 linhas)
