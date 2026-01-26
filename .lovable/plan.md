# ✅ PLANO CONCLUÍDO

## Status: Implementado em 26/01/2026

---

## Plano Otimizado: Importar Leads + Roles Simplificados + ERP Centralizado

---

## Etapa 1: Migrações SQL (1 operação)

Executar todas as alterações de banco de dados em uma única migração:

```sql
-- 1. Constraint para upsert de leads
ALTER TABLE lead_records 
ADD CONSTRAINT lead_records_collaborator_date_unique 
UNIQUE (collaborator_name, record_date);

-- 2. Tabela de configurações do sistema
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  encrypted_value text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings"
ON public.system_settings FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read non-sensitive settings"
ON public.system_settings FOR SELECT
USING (encrypted_value IS NULL);

-- 3. Funções para credenciais ERP do sistema
CREATE OR REPLACE FUNCTION public.save_system_erp_credentials(
  p_email text, p_password text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem configurar ERP';
  END IF;
  
  INSERT INTO system_settings (setting_key, setting_value)
  VALUES ('erp_email', p_email)
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = p_email, updated_at = now();
  
  INSERT INTO system_settings (setting_key, encrypted_value)
  VALUES ('erp_password', encrypt_erp_password(p_password))
  ON CONFLICT (setting_key) DO UPDATE SET encrypted_value = encrypt_erp_password(p_password), updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.get_system_erp_credentials()
RETURNS TABLE(email text, password text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    (SELECT setting_value FROM system_settings WHERE setting_key = 'erp_email'),
    decrypt_erp_password((SELECT encrypted_value FROM system_settings WHERE setting_key = 'erp_password'));
END; $$;

-- 4. RLS restritivo para edições (apenas admin)
DROP POLICY IF EXISTS "Public insert for targets" ON kpi_targets;
DROP POLICY IF EXISTS "Public update for targets" ON kpi_targets;
DROP POLICY IF EXISTS "Public delete for targets" ON kpi_targets;

CREATE POLICY "Admin insert targets" ON kpi_targets FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update targets" ON kpi_targets FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete targets" ON kpi_targets FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Repetir para lead_records e excellence_* (similar)
```

---

## Etapa 2: Hooks e Contextos (1 arquivo por operação, 2 total)

### 2.1 Atualizar useUserRole.ts

Adicionar flags simplificados:

```typescript
return {
  role,
  isAdmin: role === 'admin',
  isReader: role !== 'admin',  // Novo
  canEdit: role === 'admin',   // Novo
  isLoading,
  refetch,
};
```

### 2.2 Atualizar SheetDataContext.tsx

Modificar `refreshErpCredentials` para usar credenciais do sistema:

```typescript
const { data } = await supabase.rpc('get_system_erp_credentials');
setErpCredentials({
  email: data?.[0]?.email || '',
  password: data?.[0]?.password || null,
  hasPassword: !!data?.[0]?.password,
});
```

---

## Etapa 3: Componentes UI (agrupados, 2-3 operações)

### 3.1 Criar SystemSettingsDialog + Atualizar DashboardHeader (1 operação)

Criar `SystemSettingsDialog.tsx` e atualizar `DashboardHeader.tsx` juntos:
- Novo componente para admin configurar email/senha ERP
- Remover referência ao ErpPasswordDialog
- Adicionar botão "Configurações" (admin only)

### 3.2 Atualizar Leads.tsx com Importação (1 operação)

Adicionar em uma única atualização:
- Botão "Importar Planilha"
- Modal com input de URL
- Lógica de processamento (fetch → parse → upsert)
- Proteção de edição (`canEdit`)

### 3.3 Proteger Targets + Excellence + UserRoles (1 operação)

Atualizar os 3 arquivos em paralelo:
- Adicionar `useUserRole()` com `canEdit`
- Ocultar/desabilitar botões de edição para leitores
- Simplificar dropdown de roles para admin/reader

---

## Etapa 4: Limpeza (1 operação)

- Remover `ErpPasswordDialog.tsx`
- Remover rota `/auth` se ainda existir

---

## Resumo de Créditos Otimizado

| Etapa | Operações | Créditos Est. |
|-------|-----------|---------------|
| SQL Migrations | 1 | ~1.0 |
| Hooks + Contextos | 2 | ~1.0 |
| UI (Settings + Header) | 1 | ~1.0 |
| Leads.tsx (importação) | 1 | ~1.5 |
| Proteção (3 arquivos) | 1 | ~0.5 |
| Limpeza | 1 | ~0.3 |
| **Total** | **7** | **~5-6** |

---

## Fluxo Final

```text
ADMINISTRADOR                         LEITOR
     │                                    │
     ▼                                    ▼
┌─────────────────┐              ┌─────────────────┐
│ Configurar ERP  │              │ Visualizar:     │
│ Gerenciar Users │              │ - Dashboard     │
│ Editar Metas    │              │ - Metas         │
│ Importar Leads  │              │ - Leads         │
│ Criar Avaliações│              │ - Avaliações    │
└─────────────────┘              └─────────────────┘
```

---

## Seção Técnica

### Parsing da Planilha de Leads

```typescript
// Detectar colunas de data
const isDateCol = (col: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(col);

// Converter DD/MM/YYYY → YYYY-MM-DD
const toISO = (d: string) => {
  const [day, month, year] = d.split('/');
  return `${year}-${month}-${day}`;
};

// Processar linhas
rows.forEach(row => {
  const collaborator = row['VENDEDOR'];
  Object.entries(row).forEach(([col, val]) => {
    if (isDateCol(col) && typeof val === 'number' && val > 0) {
      records.push({ collaborator_name: collaborator, record_date: toISO(col), leads_count: val });
    }
  });
});

// Upsert em lotes
for (let i = 0; i < records.length; i += 100) {
  await supabase.from('lead_records').upsert(records.slice(i, i + 100), {
    onConflict: 'collaborator_name,record_date'
  });
}
```

### Credenciais ERP Centralizadas

O admin configura uma vez, todos os usuários usam as mesmas credenciais para buscar dados do ERP.

