

# Auditoria de Performance e Plano de Otimização Ultra-Leve

## Resumo Executivo

O sistema atual já implementa uma estratégia de 3 níveis de agregação (Power BI style), mas ainda há **gargalos críticos** que impactam a experiência do usuário. A análise identificou **7 oportunidades de melhoria** que podem reduzir o tempo de carregamento inicial de **3-5 segundos para menos de 200ms**.

---

## Diagnóstico Atual

### O Que Funciona Bem

| Componente | Status | Performance |
|------------|--------|-------------|
| `erp_monthly_aggregates` | Populado (1.281 rows) | Excelente (5KB) |
| `erp_daily_aggregates` | Populado (19.823 rows) | Bom (50KB/mes) |
| `erp_ranking_cache` | Populado (370 rows) | Excelente (1KB/ranking) |
| IndexedDB local cache | Funcional | Instant (0ms) |
| Indices no banco | Bem configurados | N/A |

### Gargalos Identificados

---

## 1. Rankings Ainda Calculam Client-Side (CRITICO)

**Problema:** Apesar de `erp_ranking_cache` existir e estar populado (370 entries), os componentes `RankingCard` e `ProductRankingCard` ainda recebem `rawData` e calculam rankings no browser.

**Evidencia no codigo:**
```typescript
// Dashboard.tsx linha 239
<RankingCard colaboradores={colaboradores} rawData={rawData} />
<ProductRankingCard produtos={produtos} rawData={rawData} />

// RankingCard.tsx - Calcula Top Produtos por Vendedor ON HOVER
function getTopProductsForSeller(rawData: RawSaleRow[], sellerName: string)

// ProductRankingCard.tsx - Calcula Top Sellers por Produto ON HOVER
function getTopSellersForProduct(rawData: RawSaleRow[], productName: string)
```

**Impacto:** Iteracao sobre 5.000-20.000 registros a cada hover, causando lag perceptivel.

**Solucao:** Consumir `erp_ranking_cache` diretamente via `useRankingCache` hook (ja existe, mas nao e usado).

---

## 2. KPIs Recalculados Client-Side (CRITICO)

**Problema:** Funcao `getKpis` em `SheetDataContext.tsx` itera sobre `rawData` (5.000-20.000 registros) para calcular vendas, faturamento, ticket medio, lucro.

**Evidencia:**
```typescript
// SheetDataContext.tsx linhas 986-996
const revenueData = filteredData.filter(r => r.Tipo !== 'PC');
const totalFaturamento = revenueData.reduce((sum, r) => sum + (r.Líquido || 0), 0);
const totalLucro = revenueData.reduce((sum, r) => sum + (r.Lucro || 0), 0);
```

**Impacto:** 100-300ms de CPU bloqueando UI em cada mudanca de filtro.

**Solucao:** Criar `erp_kpi_aggregates` ou expandir `erp_monthly_aggregates` com campos adicionais (lucro, ticket_medio, etc).

---

## 3. rawData Carregado Mesmo Sem Necessidade (MEDIO)

**Problema:** O dashboard carrega `rawData` completo (~2-3MB por mes) mesmo quando os agregados ja estao disponiveis. Isso e necessario apenas para:
- HoverCards (Top Produtos/Vendedores)
- Calculo de KPIs

**Impacto:** 2-3 segundos de network + 50-100MB de memoria.

**Solucao:** Lazy loading de `rawData` apenas quando usuario interage com HoverCards, ou eliminar completamente usando cache de rankings.

---

## 4. Queries Duplicadas na Inicializacao (MEDIO)

**Problema:** O dashboard faz multiplas queries ao iniciar:
- `loadErpData` no `useEffect` (linha 72)
- `loadErpData` novamente quando filtros mudam (linha 121)
- `fetchExcellencePercentage` + `fetchLeadsTotal` (linhas 79-81)

**Evidencia nos logs:**
```
[Cache] Combined 5661 records from Supabase cache, filtered to 5661
[Cache] Using cached data: 5661 records
[Cache] Combined 5661 records from Supabase cache, filtered to 5661  <- DUPLICADO
```

**Solucao:** Debounce + consolidar efeitos em um unico fluxo de inicializacao.

---

## 5. Background Sync Nao Atualiza UI (BAIXO)

**Problema:** O IndexedDB faz background sync para verificar se Supabase tem dados mais novos, mas:
- Apenas loga no console
- Nao atualiza os dados na UI
- Nao notifica o usuario

**Evidencia:**
```typescript
// useErpCache.ts linhas 337-339
console.log(`[Cache] Background sync needed for ${key}: Supabase is ${...}min newer`);
// Could trigger a refresh here, but for now just log
```

**Solucao:** Implementar atualizacao silenciosa com diff de dados.

---

## 6. HoverCards Calculam a Cada Interacao (BAIXO)

**Problema:** `getTopProductsForSeller` e `getTopSellersForProduct` recalculam a cada hover, mesmo que os dados nao mudem.

**Solucao:** Memoizar resultados em um Map ou usar `useMemo` com dependencias corretas.

---

## 7. Falta de Skeleton/Placeholder Semantico (UX)

**Problema:** Durante carregamento, o usuario ve skeletons genericos que nao dao contexto do que esta sendo carregado.

**Solucao:** Usar Skeleton com formato especifico (grafico, ranking, KPI) + mensagens de progresso semanticas.

---

## Plano de Implementacao

### FASE 1: Eliminar Calculo Client-Side (Alto Impacto)

**Objetivo:** Reduzir processamento client-side de 200-300ms para 0ms.

#### 1.1 Atualizar RankingCard para usar cache

Modificar `RankingCard.tsx` e `ProductRankingCard.tsx`:

```typescript
// ANTES: Recebe rawData e calcula
<RankingCard colaboradores={colaboradores} rawData={rawData} />

// DEPOIS: Consome cache diretamente
<RankingCard year={year} month={month} filialId={filters.filial} />
```

O componente usara `useRankingCache` para buscar dados pre-calculados.

#### 1.2 Criar KPI Aggregates

Expandir `erp_monthly_aggregates` ou criar nova tabela com campos:
- `total_lucro`
- `total_quantidade`
- `unique_vendas` (count distinct)
- `ticket_medio` (calculado)

#### 1.3 Lazy Load de rawData

Carregar `rawData` apenas quando:
- Usuario clica em HoverCard
- Usuario exporta dados
- Funcionalidade especifica requer dados brutos

---

### FASE 2: Otimizar Inicializacao (Medio Impacto)

#### 2.1 Consolidar Queries de Inicializacao

Criar um unico `useEffect` que:
1. Verifica cache local (IndexedDB)
2. Carrega agregados leves (monthly/ranking)
3. Renderiza UI imediatamente
4. Background sync de rawData se necessario

#### 2.2 Implementar Query Batching

Agrupar queries relacionadas:
```typescript
// ANTES: 4 queries separadas
const [excellence, leads, kpiTargets, rankings] = await Promise.all([...]);

// DEPOIS: 1 query com join ou RPC
const dashboardData = await supabase.rpc('get_dashboard_data', { year, month });
```

---

### FASE 3: UX de Carregamento (Baixo Impacto Tecnico, Alto UX)

#### 3.1 Progressive Loading

Renderizar componentes conforme dados chegam:
1. Header + Filtros (instant)
2. KPIs (100ms - do cache agregado)
3. Grafico Anual (100ms - do monthly aggregates)
4. Rankings (100ms - do ranking cache)
5. Grafico Mensal/Semanal (lazy - apenas se usuario clicar)

#### 3.2 Optimistic UI

Mostrar dados do cache local imediatamente, atualizar silenciosamente se Supabase tiver dados mais novos.

---

## Metricas de Sucesso

| Metrica | Antes | Depois | Reducao |
|---------|-------|--------|---------|
| Tempo ate primeiro KPI | 3-5s | <200ms | 95%+ |
| Memoria usada | 50-100MB | <10MB | 90%+ |
| CPU durante filtros | 200-300ms | <50ms | 85%+ |
| Network transfer | 2-3MB/mes | <100KB | 97%+ |

---

## Detalhes Tecnicos

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/dashboard/RankingCard.tsx` | Consumir `useRankingCache` |
| `src/components/dashboard/ProductRankingCard.tsx` | Consumir `useRankingCache` |
| `src/pages/Dashboard.tsx` | Remover passagem de `rawData` para rankings |
| `src/contexts/SheetDataContext.tsx` | Lazy load de rawData, usar agregados para KPIs |
| `src/hooks/useAggregateCalculator.ts` | Adicionar campos de KPI aos agregados |

### Nova Tabela (Opcional)

```sql
-- Expandir erp_monthly_aggregates com campos adicionais
ALTER TABLE erp_monthly_aggregates 
ADD COLUMN IF NOT EXISTS total_lucro NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS unique_vendas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ticket_medio NUMERIC GENERATED ALWAYS AS (
  CASE WHEN unique_vendas > 0 THEN faturamento / unique_vendas ELSE 0 END
) STORED;
```

### Fluxo Otimizado

```text
Usuario abre dashboard
        |
        v
[IndexedDB] Dados locais disponiveis?
   |               |
  SIM             NAO
   |               |
   v               v
Renderiza       Query Supabase
UI instant      (agregados leves)
   |               |
   v               v
Background      Salva IndexedDB
sync check      + Renderiza UI
   |
   v
Dados novos? --> Atualiza silenciosamente
```

---

## Ordem de Prioridade

1. **Atualizar Rankings para usar cache** (maior impacto imediato)
2. **Remover passagem de rawData para rankings**
3. **Adicionar campos de KPI aos agregados mensais**
4. **Lazy load de rawData**
5. **Consolidar queries de inicializacao**
6. **Memoizar HoverCard calculations**
7. **Progressive loading UI**

