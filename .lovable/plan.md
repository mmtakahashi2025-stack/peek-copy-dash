

# Plano: Corrigir Duplicatas e Cálculo de Lucro

## Problema Identificado

Os dados de Janeiro 2026 estão mostrando **R$ 275.037** (incorreto) ao invés de **~R$ 391.271** (correto).

### Causa Raiz: Registros Duplicados + Cálculo Errado

1. **Duplicatas no cache**: A paginação semanal do `fetch-erp-data` está criando registros duplicados (5.485 registros ao invés de 4.015 únicos)
2. **Falta de deduplicação**: Ao recalcular agregados, duplicatas são contadas múltiplas vezes
3. **Filtro incorreto de PC**: O lucro **deve incluir** itens tipo 'PC' (pacotes), diferente do faturamento

### Valores verificados (Janeiro 2026):

| Cenário | Lucro |
|---------|-------|
| **Correto: COM PC, deduplicado** | **R$ 391.421,50** |
| Errado: SEM PC, deduplicado | R$ 339.684,35 |
| Errado: COM duplicatas | R$ 406.626,91 |
| Exibido atualmente | ~R$ 275.037,00 |

---

## Mudanças Necessárias

### 1. Edge Function `recalculate-aggregates/index.ts`

#### Adicionar deduplicação por Venda # + Item

Antes de processar, criar Set de chaves únicas para evitar contar duplicatas:

```typescript
// Criar map para deduplicação por Venda # + Item
const processedKeys = new Set<string>();

rawData.forEach(row => {
  const key = `${row['Venda #']}|${row.Item}`;
  if (processedKeys.has(key)) return; // Skip duplicata
  processedKeys.add(key);
  
  // ... resto do processamento
});
```

#### Separar lógica de PC para faturamento vs lucro

- **Faturamento**: Excluir tipo 'PC' (comportamento atual correto)
- **Lucro**: **Incluir** tipo 'PC' (correção necessária)

```typescript
// Para faturamento (sem PC)
if (row.Tipo !== 'PC') {
  faturamento += row.Líquido || 0;
}

// Para lucro (com PC)
lucro += row.Lucro || 0;
```

---

### 2. Hook `useChartAggregates.ts` (Frontend)

#### Adicionar deduplicação e campo total_lucro

O hook está salvando agregados sem deduplicação e sem campo `total_lucro`:

```typescript
// Adicionar deduplicação
const processedKeys = new Set<string>();

data.forEach(row => {
  const key = `${row['Venda #']}|${row.Item}`;
  if (processedKeys.has(key)) return;
  processedKeys.add(key);

  const liquido = row.Líquido || 0;
  const lucro = row.Lucro || 0;

  // Faturamento: excluir PC
  if (row.Tipo !== 'PC') {
    // acumular faturamento
  }
  
  // Lucro: incluir PC
  // acumular lucro sempre
});
```

#### Incluir total_lucro nas inserções

```typescript
rows.push({
  year,
  month,
  filial,
  colaborador,
  faturamento,
  total_lucro: lucro,  // ADICIONAR
  quantidade_vendas,
  updated_at,
});
```

---

### 3. Verificar Cards de KPI (`SheetDataContext.tsx`)

#### Lucro %
- Verificar se está deduplicando os dados
- Verificar se está usando PC no cálculo de lucro

#### P.A. (Peças por Atendimento)
- Verificar cálculo: totalQuantidade / totalVendas(únicas)

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/recalculate-aggregates/index.ts` | Deduplicar por Venda#+Item, incluir PC no lucro |
| `src/hooks/useChartAggregates.ts` | Deduplicar dados, adicionar total_lucro no INSERT |
| `src/contexts/SheetDataContext.tsx` | Verificar e corrigir KPIs de Lucro% e P.A. |

---

## Regras de Cálculo Finais

| Métrica | Tipo PC | Deduplicação |
|---------|---------|--------------|
| Faturamento | Excluir | Sim (Venda # + Item) |
| Lucro | **Incluir** | Sim (Venda # + Item) |
| Quantidade | Incluir | Sim |
| Vendas Únicas | N/A | Por Venda # |

---

## Resultado Esperado

| Métrica Jan/2026 | Antes | Depois |
|------------------|-------|--------|
| Lucro no Gráfico | R$ 275.037 | ~R$ 391.421 |
| Lucro % no Card | ~29% | ~27.2%* |

*Nota: O percentual pode mudar porque faturamento será calculado sem duplicatas também (R$ 1.140.945 ao invés de R$ 1.403.730).

---

## Após Implementação

Executar recálculo completo:
```
POST /functions/v1/recalculate-aggregates
Body: { "forceAll": true }
```

