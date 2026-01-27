
# Cache Global de ERP: Admin Busca, Todos Visualizam

## Resumo

Alterar a arquitetura de cache do ERP para que:
1. **Apenas admins** possam buscar dados da API do ERP
2. **Todos os usuarios autenticados** possam visualizar o mesmo cache global
3. Eliminar dados duplicados (atualmente 3 usuarios com caches separados)

---

## Alteracoes Necessarias

### 1. Migracao de Banco de Dados

**Objetivo:** Remover a restricao por `user_id` e tornar o cache global.

```sql
-- Remover constraint unique atual (user_id, year, month)
ALTER TABLE erp_cache DROP CONSTRAINT IF EXISTS erp_cache_user_id_year_month_key;

-- Adicionar nova constraint unique sem user_id
ALTER TABLE erp_cache ADD CONSTRAINT erp_cache_year_month_key UNIQUE (year, month);

-- Tornar user_id opcional (registra quem fez a ultima atualizacao)
ALTER TABLE erp_cache ALTER COLUMN user_id DROP NOT NULL;

-- Fazer o mesmo para erp_consolidated_cache
ALTER TABLE erp_consolidated_cache DROP CONSTRAINT IF EXISTS erp_consolidated_cache_user_id_key;
ALTER TABLE erp_consolidated_cache ADD CONSTRAINT erp_consolidated_cache_dates_key 
  UNIQUE (start_date, end_date);
ALTER TABLE erp_consolidated_cache ALTER COLUMN user_id DROP NOT NULL;

-- Atualizar RLS policies
DROP POLICY IF EXISTS "Users can view own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can insert own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can update own erp_cache" ON erp_cache;
DROP POLICY IF EXISTS "Users can delete own erp_cache" ON erp_cache;

-- Novas policies: todos leem, apenas admin escreve
CREATE POLICY "Authenticated users can read erp_cache" 
  ON erp_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert erp_cache" 
  ON erp_cache FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update erp_cache" 
  ON erp_cache FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete erp_cache" 
  ON erp_cache FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

-- Mesma logica para erp_consolidated_cache
DROP POLICY IF EXISTS "Users can view own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can insert own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can update own erp_consolidated_cache" ON erp_consolidated_cache;
DROP POLICY IF EXISTS "Users can delete own erp_consolidated_cache" ON erp_consolidated_cache;

CREATE POLICY "Authenticated users can read erp_consolidated_cache" 
  ON erp_consolidated_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert erp_consolidated_cache" 
  ON erp_consolidated_cache FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update erp_consolidated_cache" 
  ON erp_consolidated_cache FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete erp_consolidated_cache" 
  ON erp_consolidated_cache FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

-- Limpar dados duplicados (manter apenas o mais recente de cada mes)
DELETE FROM erp_cache a
USING erp_cache b
WHERE a.id < b.id 
  AND a.year = b.year 
  AND a.month = b.month;

DELETE FROM erp_consolidated_cache a
USING erp_consolidated_cache b
WHERE a.id < b.id 
  AND a.start_date = b.start_date 
  AND a.end_date = b.end_date;
```

---

### 2. Hook useErpCache.ts

**Alteracoes:**
- Remover filtro por `user_id` nas queries de leitura
- Manter `user_id` apenas como registro de quem atualizou
- Verificar se usuario e admin antes de permitir escrita

| Funcao | Antes | Depois |
|--------|-------|--------|
| `loadMonthFromCache` | `.eq('user_id', user.id)` | Sem filtro de user_id |
| `saveMonthToCache` | `user_id: user.id` | Verificar admin + `updated_by: user.id` |
| `updateCacheMeta` | `.eq('user_id', user.id)` | Sem filtro de user_id |
| `clearAllCache` | `.eq('user_id', user.id)` | Verificar admin + limpar tudo |

---

### 3. SheetDataContext.tsx

**Alteracoes:**
- Adicionar verificacao `isAdmin` antes de chamar `loadErpData`
- Usuarios nao-admin so podem ler do cache, nunca buscar da API
- Manter botao de refresh visivel apenas para admin

| Funcao | Alteracao |
|--------|-----------|
| `loadErpDataProgressive` | Verificar `isAdmin` antes de chamar API |
| `refreshData` | So permitir para admin |

---

### 4. Dashboard.tsx

**Alteracoes:**
- Mostrar mensagem diferente para usuarios nao-admin quando nao ha dados
- Esconder botao de "Atualizar dados" para nao-admin

---

### 5. Componentes de UI

**DashboardHeader.tsx ou LoadingProgress.tsx:**
- Botao de refresh visivel apenas para admin
- Indicador de "ultima atualizacao" para todos

---

## Fluxo de Dados

```text
+------------------+          +------------------+          +------------------+
|     Admin        |  busca   |    API ERP       |  salva   |   erp_cache      |
|   (isAdmin)      | -------> |                  | -------> | (tabela global)  |
+------------------+          +------------------+          +------------------+
                                                                    |
                                                                    | leitura
                                                                    v
                                                            +------------------+
                                                            |  Todos usuarios  |
                                                            |  (autenticados)  |
                                                            +------------------+
```

---

## Resumo Tecnico

| Arquivo | Tipo de Alteracao |
|---------|-------------------|
| `migracao SQL` | Alterar constraints, RLS policies, limpar duplicados |
| `src/hooks/useErpCache.ts` | Remover filtro user_id na leitura, verificar admin na escrita |
| `src/contexts/SheetDataContext.tsx` | Verificar isAdmin antes de fetch API |
| `src/pages/Dashboard.tsx` | UI condicional para admin/reader |
| `src/integrations/supabase/types.ts` | Atualizado automaticamente |

---

## Beneficios

1. **Menos requisicoes a API do ERP** - dados buscados uma vez, usados por todos
2. **Consistencia** - todos veem os mesmos dados
3. **Menor uso de armazenamento** - elimina duplicacao entre usuarios
4. **Seguranca** - apenas admin pode modificar dados de vendas

