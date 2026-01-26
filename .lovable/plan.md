
## Plano Consolidado: Importação de Leads + Filtro de Filiais ERP

### Objetivo
Implementar duas funcionalidades em uma única atualização para economia de créditos:
1. **Importação de Leads via Google Sheets** - Na tela de Configurações do Sistema (admin only)
2. **Filtro de Filiais do ERP** - Retornar apenas dados das 4 empresas especificadas

---

### Empresas permitidas (filtro ERP)

```text
- Combo Iguassu
- Combo Iguassu Agências
- Combo Iguassu Cataratas
- Combo Iguassu Web
```

---

### Arquivos a modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/fetch-erp-data/index.ts` | Adicionar filtro de filiais após transformação |
| `src/components/dashboard/SystemSettingsDialog.tsx` | Adicionar seção de importação de leads |

---

### Implementação Detalhada

#### 1. fetch-erp-data/index.ts - Filtro de Filiais

Adicionar constante com filiais permitidas e filtrar dados antes de retornar:

```typescript
// Lista de filiais permitidas (logo após os imports)
const ALLOWED_FILIAIS = [
  'Combo Iguassu',
  'Combo Iguassu Agências',
  'Combo Iguassu Cataratas',
  'Combo Iguassu Web',
];

// Filtrar dados antes de retornar (linha ~540, antes do return final)
const filteredData = allData.filter(row => 
  ALLOWED_FILIAIS.includes(row.Filial)
);

// Atualizar logs e response para usar filteredData
```

**Ponto de inserção:** Após linha 540 (antes de calcular uniqueSales)

---

#### 2. SystemSettingsDialog.tsx - Importação de Leads

Adicionar nova seção abaixo das configurações de ERP:

**Estrutura visual:**
```text
┌─────────────────────────────────────────┐
│ ⚙️ Configurações do Sistema            │
├─────────────────────────────────────────┤
│ Status: ✓ ERP configurado              │
│                                         │
│ Email do ERP: [________________]        │
│ Senha do ERP: [________________] 👁️     │
│                                         │
│ [    Testar Conexão    ]               │
├─────────────────────────────────────────┤
│ 📊 Importar Leads (Separador)          │
│                                         │
│ URL da planilha:                        │
│ [________________________________]      │
│                                         │
│ [    Importar Planilha    ]            │
│                                         │
│ Resultado: 150 registros importados    │
├─────────────────────────────────────────┤
│ [Cancelar]        [Salvar ERP]         │
└─────────────────────────────────────────┘
```

**Lógica de processamento:**

```typescript
// Detectar colunas de data
const isDateCol = (col: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(col);

// Converter DD/MM/YYYY → YYYY-MM-DD
const toISO = (d: string) => {
  const [day, month, year] = d.split('/');
  return `${year}-${month}-${day}`;
};

// Processar linhas da planilha
const records: LeadRecord[] = [];
rows.forEach(row => {
  const collaborator = row['VENDEDOR'];
  if (!collaborator) return;
  
  Object.entries(row).forEach(([col, val]) => {
    if (isDateCol(col) && typeof val === 'number' && val > 0) {
      records.push({
        collaborator_name: String(collaborator),
        record_date: toISO(col),
        leads_count: val
      });
    }
  });
});

// Upsert em lotes de 100
for (let i = 0; i < records.length; i += 100) {
  await supabase.from('lead_records').upsert(
    records.slice(i, i + 100),
    { onConflict: 'collaborator_name,record_date' }
  );
}
```

**Estados adicionais:**
- `sheetUrl: string` - URL da planilha
- `isImporting: boolean` - Estado de loading
- `importResult: { success: boolean; count: number } | null` - Resultado

---

### Fluxo de Dados

```text
FILTRO ERP:
API ERP → fetch-erp-data → Transforma → Filtra (4 filiais) → Retorna

IMPORTAÇÃO LEADS:
Admin → URL → fetch-sheets → Parse → Upsert lead_records
```

---

### Pré-requisitos já implementados

- Constraint `lead_records_collaborator_date_unique` (migração existente)
- Edge function `fetch-sheets` com JWT
- RLS: apenas admin pode inserir em `lead_records`
- Hook `useUserRole` com flag `canEdit`

---

### Custo estimado

| Item | Créditos |
|------|----------|
| Atualizar fetch-erp-data (filtro) | ~0.3 |
| Atualizar SystemSettingsDialog (importação) | ~0.7 |
| **Total** | **~1.0** |

Nenhuma migração SQL necessária.

---

### Seção Técnica

#### Estrutura esperada da planilha de leads

| VENDEDOR | 01/01/2025 | 02/01/2025 | 03/01/2025 |
|----------|------------|------------|------------|
| Ana      | 5          | 3          | 7          |
| Bruno    | 2          | 4          | 1          |

#### Tratamento de erros

- URL inválida → toast de erro
- Planilha vazia → "Nenhum dado encontrado"
- Falha na importação → exibe erro específico
- Sucesso parcial → exibe quantidade importada

#### Filtro de filiais (case-sensitive)

O filtro é exato. Se a API retornar "COMBO IGUASSU" (maiúsculas), não será incluído. Caso necessário, pode-se normalizar com `.toLowerCase()` na comparação.
