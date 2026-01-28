# Plano: Corrigir Duplicatas e Cálculo de Lucro

## ✅ IMPLEMENTADO

### Problema Identificado

Os dados de Janeiro 2026 estavam mostrando **R$ 275.037** (incorreto) ao invés de **~R$ 391.271** (correto).

### Causa Raiz: Registros Duplicados + Cálculo Errado

1. **Duplicatas no cache**: A paginação semanal do `fetch-erp-data` estava criando registros duplicados (5.485 registros ao invés de 4.015 únicos)
2. **Falta de deduplicação**: Ao recalcular agregados, duplicatas eram contadas múltiplas vezes
3. **Filtro incorreto de PC**: O lucro **deve incluir** itens tipo 'PC' (pacotes), diferente do faturamento

---

## Correções Aplicadas

### 1. Edge Function `recalculate-aggregates/index.ts` ✅

- Adicionada deduplicação por `Venda # + Item` antes de processar
- Separada lógica de PC para faturamento vs lucro:
  - **Faturamento**: Exclui tipo 'PC' 
  - **Lucro**: **Inclui** tipo 'PC'

### 2. Hook `useChartAggregates.ts` ✅

- Adicionada deduplicação por `Venda # + Item`
- Campo `total_lucro` agora é incluído nas inserções
- Lucro inclui itens tipo 'PC'

### 3. Cards de KPI `SheetDataContext.tsx` ✅

- Adicionada deduplicação por `Venda # + Item` no cálculo dos KPIs
- Lucro% agora inclui itens tipo 'PC' no cálculo
- P.A. agora usa dados deduplicados

---

## Regras de Cálculo Finais

| Métrica | Tipo PC | Deduplicação |
|---------|---------|--------------|
| Faturamento | Excluir | Sim (Venda # + Item) |
| Lucro | **Incluir** | Sim (Venda # + Item) |
| Quantidade | Incluir | Sim |
| Vendas Únicas | Excluir PC | Por Venda # |

---

## Próximo Passo

Executar recálculo completo via "Manutenção de Dados" nas configurações ou:
```
POST /functions/v1/recalculate-aggregates
Body: { "forceAll": true }
```

---

## Resultado Esperado

| Métrica Jan/2026 | Antes | Depois |
|------------------|-------|--------|
| Lucro no Gráfico | R$ 275.037 | ~R$ 391.421 |
| Lucro % no Card | ~29% | ~34.3%* |

*O percentual pode mudar porque faturamento será calculado sem duplicatas também.
