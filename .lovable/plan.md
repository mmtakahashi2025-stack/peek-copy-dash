

# Plano: Corrigir Cálculo do Lucro - Usar Dados Reais do ERP

## Problema Identificado

O gráfico está mostrando **R$ 275.037** para o lucro de Janeiro 2026, mas o valor correto é **~R$ 391.301,39**.

### Causa Raiz

A edge function `recalculate-aggregates` está calculando o lucro incorretamente:

```typescript
// ATUAL (linha 193) - ERRADO!
const lucro = liquido * 0.2; // Calcula 20% fixo
```

Porém, os dados brutos do ERP **já contêm o campo `Lucro` real**:

| Campo | Exemplo |
|-------|---------|
| Líquido | R$ 128,25 |
| Lucro | R$ 13,25 (real do ERP) |
| % Lucro | 10,33% |

**Dados verificados no banco:**
- Lucro REAL (soma do campo `Lucro`): **R$ 406.046,82**
- Lucro calculado com 20%: ~R$ 280.000 (incorreto)

---

## Solução

Modificar a edge function para usar o campo `Lucro` real dos dados do ERP ao invés de calcular uma margem fictícia.

---

## Mudanças Necessárias

### Arquivo: `supabase/functions/recalculate-aggregates/index.ts`

#### 1. Atualizar interface `RawSaleRow` (linhas 8-17)

Adicionar o campo `Lucro`:

```typescript
interface RawSaleRow {
  Filial: string;
  Emissor: string;
  'Venda #': number;
  'Data Venda': number | string;
  Item: string;
  Tipo: string;
  Quantidade: number;
  Líquido: number;
  Lucro: number;  // <-- ADICIONAR
}
```

#### 2. Usar o campo Lucro real (linha 193)

**De:**
```typescript
const lucro = liquido * 0.2; // Default 20% margin
```

**Para:**
```typescript
const lucro = row.Lucro || 0; // Usar lucro real do ERP
```

---

## Após Implementação

Será necessário executar o recálculo dos agregados para atualizar os valores de lucro:

```bash
POST /functions/v1/recalculate-aggregates
Body: { "forceAll": true }
```

Isso irá reprocessar todos os 37 meses de dados históricos com o lucro correto.

---

## Resultado Esperado

| Métrica | Antes (incorreto) | Depois (correto) |
|---------|-------------------|------------------|
| Lucro Jan/2026 | ~R$ 275.037 | ~R$ 406.046 |
| Base do cálculo | 20% do faturamento | Campo `Lucro` do ERP |

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/recalculate-aggregates/index.ts` | Usar campo `Lucro` real do ERP |

---

## Complexidade

Mudança simples:
- Adicionar 1 campo na interface (~1 linha)
- Alterar 1 linha de cálculo

Após a mudança, executar recálculo para corrigir dados históricos.

