
# Plano: Carregamento Ultra-Leve Estilo Power BI

## Problema Atual

O sistema transfere dados brutos demais:
- **78 MB** de JSONB no Supabase
- **30 MB** para carregar 12 meses de dados brutos
- Rankings e KPIs calculados no browser a partir de **200k registros**

Power BI resolve isso com **modelos tabulares pré-agregados**. Vamos aplicar os mesmos princípios.

---

## Estratégia: Três Níveis de Agregação

```text
+----------------------------------------------------------+
| NÍVEL 1: AGREGADOS ULTRA-LEVES (existente)               |
| - erp_monthly_aggregates: 1.281 rows (~5KB)              |
| - Usado para: Gráfico Anual (já funciona bem!)           |
+----------------------------------------------------------+
| NÍVEL 2: AGREGADOS DIÁRIOS (NOVO)                        |
| - erp_daily_aggregates: ~1.200 rows/ano (~50KB)          |
| - Usado para: Gráficos Mensal e Semanal                  |
| - Elimina query de 2-3 MB por mês                        |
+----------------------------------------------------------+
| NÍVEL 3: AGREGADOS DE RANKING (NOVO)                     |
| - erp_ranking_cache: ~100 rows/mês (~10KB)               |
| - Usado para: Rankings de colaboradores e produtos       |
| - Elimina cálculo client-side sobre 200k registros       |
+----------------------------------------------------------+
```

---

## Implementação

### FASE 1: Agregados Diários (Maior Impacto)

#### Nova Tabela: `erp_daily_aggregates`

```sql
CREATE TABLE erp_daily_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  filial TEXT NOT NULL DEFAULT 'todas',
  colaborador TEXT,
  faturamento NUMERIC NOT NULL DEFAULT 0,
  quantidade_vendas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, filial, COALESCE(colaborador, ''))
);
```

#### Benefícios:
- **Antes**: Query de 2-3 MB para dados diários de um mês
- **Depois**: Query de ~50 KB para 31 dias agregados
- **Redução**: 98% no tamanho da transferência

### FASE 2: Agregados de Ranking

#### Nova Tabela: `erp_ranking_cache`

```sql
CREATE TABLE erp_ranking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  ranking_type TEXT NOT NULL, -- 'colaborador' ou 'produto'
  filial TEXT NOT NULL DEFAULT 'todas',
  ranking_data JSONB NOT NULL, -- Array ordenado top 10
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year, month, ranking_type, filial)
);
```

#### Estrutura do JSONB:
```json
[
  { "nome": "MAURICIO", "faturamento": 245000, "vendas": 342 },
  { "nome": "RODRIGO", "faturamento": 198000, "vendas": 289 },
  ...
]
```

#### Benefícios:
- **Antes**: Iterar sobre 200k registros no browser para calcular rankings
- **Depois**: Query de ~1 KB retorna rankings prontos
- **Redução**: 99.9% no processamento client-side

---

## Arquivos a Criar/Modificar

### Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/recalculate-aggregates/index.ts` | Edge function para recalcular todos os agregados |

### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useChartAggregates.ts` | Adicionar `fetchDailyAggregates()` |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Usar agregados diários nas abas Mensal/Semanal |
| `src/components/dashboard/RankingCard.tsx` | Usar `erp_ranking_cache` ao invés de calcular |
| `src/components/dashboard/ProductRankingCard.tsx` | Usar `erp_ranking_cache` ao invés de calcular |
| `src/contexts/SheetDataContext.tsx` | Calcular e salvar rankings quando cache é atualizado |

---

## Fluxo de Dados Otimizado

```text
ANTES (Lento):
Usuario -> Supabase (2-3 MB) -> Browser calcula -> Exibe

DEPOIS (Power BI Style):
Admin atualiza cache -> Edge Function calcula agregados
Usuario -> Supabase (5-50 KB) -> Exibe diretamente
```

---

## Comparativo de Performance

| Operação | Antes | Depois | Redução |
|----------|-------|--------|---------|
| Gráfico Anual | ~5 KB | ~5 KB | - (já otimizado) |
| Gráfico Mensal | ~2.5 MB | ~15 KB | 99.4% |
| Gráfico Semanal | ~2.5 MB | ~2 KB | 99.9% |
| Ranking Colaboradores | 200k rows client | ~1 KB | 99.9% |
| Ranking Produtos | 200k rows client | ~1 KB | 99.9% |
| **Dashboard Inicial** | **~30 MB + CPU** | **~100 KB** | **99.7%** |

---

## Ordem de Implementação

1. Criar tabela `erp_daily_aggregates` com índices
2. Modificar `calculateAndSaveAggregates` para também calcular diários
3. Atualizar gráfico Mensal/Semanal para usar agregados diários
4. Criar tabela `erp_ranking_cache`
5. Modificar salvamento do cache para calcular rankings
6. Atualizar componentes de ranking para usar cache
7. Criar Edge Function para recalcular agregados históricos

---

## Detalhes Técnicos

### Hook: `useDailyAggregates`

```typescript
const fetchDailyAggregates = async (
  year: number,
  month: number,
  filialId?: string
): Promise<DailyAggregate[]> => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  let query = supabase
    .from('erp_daily_aggregates')
    .select('date, faturamento, quantidade_vendas')
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .is('colaborador', null);
  
  if (filialId === 'todas' || !filialId) {
    query = query.eq('filial', 'todas');
  } else {
    query = query.eq('filial', filialId);
  }
  
  const { data } = await query;
  return data || [];
};
```

### Cálculo de Ranking (no Backend)

```typescript
function calculateRankings(data: RawSaleRow[], year: number, month: number) {
  // Top 10 colaboradores por faturamento
  const colaboradorTotals = new Map<string, { faturamento: number; vendas: number }>();
  
  data.forEach(row => {
    if (row.Tipo === 'PC') return;
    const key = row.Emissor;
    if (!colaboradorTotals.has(key)) {
      colaboradorTotals.set(key, { faturamento: 0, vendas: 0 });
    }
    const entry = colaboradorTotals.get(key)!;
    entry.faturamento += row.Líquido || 0;
    entry.vendas += 1;
  });
  
  const sorted = Array.from(colaboradorTotals.entries())
    .map(([nome, data]) => ({ nome, ...data }))
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 10);
  
  return sorted;
}
```

---

## Resultado Final

Com estas otimizações, o dashboard terá performance similar ao Power BI:

- **Carregamento inicial**: < 500ms (atualmente 3-5s)
- **Troca de filtros**: < 100ms (atualmente 1-2s)
- **Uso de memória**: < 10 MB (atualmente 50-100 MB)
- **Experiência**: Instantânea como Power BI Desktop
