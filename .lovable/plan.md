

# Plano de Otimizacao do Banco de Dados

## Analise dos Problemas Encontrados

### 1. Indices Duplicados (Desperdicio de Espaco e Performance)

**Problema Identificado:**
```text
Tabela erp_cache:
- erp_cache_user_year_month_unique (user_id, year, month) - UNICO
- idx_erp_cache_user_period (user_id, year, month) - DUPLICADO!
- erp_cache_year_month_key (year, month) - Parcialmente redundante

Tabela lead_records:
- lead_records_collaborator_date_unique (collaborator_name, record_date) - UNICO  
- lead_records_collaborator_name_record_date_key (collaborator_name, record_date) - DUPLICADO!
```

**Impacto:** Indices duplicados ocupam espaco e sao atualizados em cada INSERT/UPDATE, desperdicando recursos.

---

### 2. Tabela erp_cache com Dados JSONB Grandes

**Estatisticas Atuais:**
- 32 registros
- 12 MB total (media de ~375KB por mes)
- Cada mes tem ~5.000-7.500 registros JSONB

**Problema:** Cada query carrega o campo JSONB inteiro (~2MB por mes), mesmo quando so precisamos verificar se existe.

---

### 3. Sequential Scans Excessivos

**Problema Identificado:**
```text
excellence_evaluations: 2.361 seq_scans vs 97 idx_scans (24:1 ratio!)
erp_cache: 1.837 seq_scans vs 493 idx_scans (4:1 ratio)
excellence_scores: 1.021 seq_scans vs 385 idx_scans (3:1 ratio)
```

**Causa:** Falta de indices nas colunas usadas em filtros (ex: `evaluation_date`, `year`, `month`).

---

### 4. Falta de Indices para Consultas Frequentes

**Consultas nao otimizadas:**
- `excellence_evaluations.evaluation_date` (filtros por data)
- `lead_records.record_date` (filtros por data)
- `kpi_targets.year` + `month` + `kpi_type` (combinacao frequente)

---

## Solucao Proposta

### Fase 1: Remover Indices Duplicados

```sql
-- Remover indices redundantes que desperdicam espaco
DROP INDEX IF EXISTS idx_erp_cache_user_period;
DROP INDEX IF EXISTS lead_records_collaborator_name_record_date_key;
```

**Impacto:** Libera espaco e reduz overhead de escrita.

---

### Fase 2: Adicionar Indices Estrategicos

```sql
-- Indice para consultas de excellence_evaluations por data
CREATE INDEX idx_excellence_evaluations_date 
ON excellence_evaluations(evaluation_date);

-- Indice para consultas de excellence_scores por evaluation_id
CREATE INDEX idx_excellence_scores_evaluation 
ON excellence_scores(evaluation_id);

-- Indice para consultas de lead_records por data
CREATE INDEX idx_lead_records_date 
ON lead_records(record_date);

-- Indice para erp_cache por (year, month) sem user_id
-- Usado em queries globais de cache
CREATE INDEX idx_erp_cache_period 
ON erp_cache(year, month);
```

---

### Fase 3: Otimizar RLS com Cache de Sessao

**Problema:** Funcao `has_role()` e chamada em CADA LINHA de CADA QUERY.

**Solucao:** Usar cache de sessao para evitar lookups repetidos:

```sql
-- Versao otimizada com cache de sessao
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cached_result boolean;
BEGIN
  -- Tentar obter do cache de sessao primeiro
  BEGIN
    cached_result := current_setting('app.is_admin')::boolean;
    RETURN cached_result;
  EXCEPTION WHEN OTHERS THEN
    -- Nao esta no cache, calcular
    NULL;
  END;
  
  -- Calcular e armazenar no cache
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO cached_result;
  
  -- Salvar no cache da sessao
  PERFORM set_config('app.is_admin', cached_result::text, false);
  
  RETURN cached_result;
END;
$$;
```

---

### Fase 4: Adicionar Campo de Metadados ao erp_cache

**Problema:** Para verificar se um mes existe no cache, precisamos fazer SELECT * que carrega o campo JSONB de 2MB.

**Solucao:** Adicionar coluna de tamanho para queries leves:

```sql
-- Adicionar coluna de tamanho para queries rapidas
ALTER TABLE erp_cache ADD COLUMN IF NOT EXISTS data_size integer;

-- Atualizar tamanhos existentes
UPDATE erp_cache SET data_size = length(data::text);

-- Criar indice para queries de verificacao rapida
CREATE INDEX idx_erp_cache_quick_check 
ON erp_cache(year, month, record_count, data_size);
```

---

### Fase 5: Otimizar Queries no Codigo

**Arquivo: `src/hooks/useErpCache.ts`**

Modificar `updateCacheMeta` para nao carregar dados desnecessarios:

```typescript
// ANTES (carrega todos os campos)
const { data, error } = await supabase
  .from('erp_cache')
  .select('year, month, record_count, created_at, updated_at');

// DEPOIS (seleciona apenas o necessario)
const { data, error } = await supabase
  .from('erp_cache')
  .select('year, month, record_count, updated_at');
```

Modificar `getMonthData` para usar query mais especifica:

```typescript
// ANTES
const { data, error } = await supabase
  .from('erp_cache')
  .select('data, record_count, updated_at')
  .eq('year', year)
  .eq('month', month)
  .maybeSingle();

// DEPOIS (usar hint para indice)
const { data, error } = await supabase
  .from('erp_cache')
  .select('data, record_count, updated_at')
  .eq('year', year)
  .eq('month', month)
  .limit(1)
  .maybeSingle();
```

---

### Fase 6: Implementar Batch Loading Otimizado

**Arquivo: `src/contexts/SheetDataContext.tsx`**

Usar a funcao `getMultipleMonthsData` do hook para carregar todos os meses de uma vez:

```typescript
// ANTES: Promise.all com N queries individuais
const results = await Promise.all(
  monthsToFetch.map(async ({ year, month }) => {
    const data = await getMonthData(year, month);
    return data || [];
  })
);

// DEPOIS: Uma unica query com OR conditions
const batchResult = await getMultipleMonthsData(monthsToFetch);
const results = monthsToFetch.map(({ year, month }) => {
  return batchResult.get(`${year}-${month}`) || [];
});
```

---

### Fase 7: VACUUM e ANALYZE

```sql
-- Executar apos as alteracoes para atualizar estatisticas
ANALYZE erp_cache;
ANALYZE lead_records;
ANALYZE excellence_evaluations;
ANALYZE excellence_scores;
ANALYZE kpi_targets;
```

---

## Resumo das Migracoes SQL

```sql
-- 1. Remover indices duplicados
DROP INDEX IF EXISTS idx_erp_cache_user_period;
DROP INDEX IF EXISTS lead_records_collaborator_name_record_date_key;

-- 2. Criar novos indices otimizados
CREATE INDEX IF NOT EXISTS idx_excellence_evaluations_date 
  ON excellence_evaluations(evaluation_date);
  
CREATE INDEX IF NOT EXISTS idx_excellence_scores_evaluation 
  ON excellence_scores(evaluation_id);
  
CREATE INDEX IF NOT EXISTS idx_lead_records_date 
  ON lead_records(record_date);
  
CREATE INDEX IF NOT EXISTS idx_erp_cache_period 
  ON erp_cache(year, month);

-- 3. Adicionar coluna de metadados
ALTER TABLE erp_cache ADD COLUMN IF NOT EXISTS data_size integer;

-- 4. Atualizar estatisticas
ANALYZE erp_cache;
ANALYZE lead_records;
ANALYZE excellence_evaluations;
ANALYZE excellence_scores;
ANALYZE kpi_targets;
```

---

## Alteracoes no Codigo

| Arquivo | Alteracao |
|---------|-----------|
| `useErpCache.ts` | Usar `getMultipleMonthsData` como default |
| `useErpCache.ts` | Adicionar `.limit(1)` em queries single |
| `SheetDataContext.tsx` | Usar batch loading em `loadYearlyData` |

---

## Resultado Esperado

| Metrica | Antes | Depois |
|---------|-------|--------|
| Indices duplicados | 4 | 0 |
| Seq scans em excellence_evaluations | 2.361 | ~100 |
| Tempo para verificar cache | ~500ms | ~50ms |
| Queries para carregar 24 meses | 24 | 1 |
| Espaco ocupado por indices | +32KB redundante | 0 |

---

## Ganhos de Performance

```text
Carregamento inicial Dashboard:
  Antes:  ~3-5 segundos (24 queries sequenciais)
  Depois: ~0.5-1 segundo (1 query batch)

Verificacao de cache:
  Antes:  ~500ms (carrega JSONB de 2MB)
  Depois: ~50ms (query em metadados apenas)

Consultas de excellence:
  Antes:  Seq scan (examina todas as linhas)
  Depois: Index scan (vai direto aos registros)
```

