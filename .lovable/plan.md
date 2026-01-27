

# Correção: Dados Não Visualizados por Não-Admin e Botão ERP Online

## Problemas Identificados

### 1. Botão "ERP Online" Visível Para Todos
O componente `SheetConfigDialog` (que renderiza o botão "ERP Online") está sendo exibido para todos os usuários no header, sem verificação de role.

**Localização:** `src/components/dashboard/DashboardHeader.tsx`
- Linha 75 (desktop): `<SheetConfigDialog />`
- Linha 135 (mobile): `<SheetConfigDialog />`

### 2. Dados Não Sendo Carregados Para Não-Admin
O `loadErpData` só é chamado quando `isAdmin` é true, impedindo que usuários não-admin carreguem dados do cache.

**Localização:** `src/pages/Dashboard.tsx`
- Linhas 60-71: Auto-load bloqueado para não-admin
- Linhas 116-120: Reload em mudança de filtro bloqueado para não-admin

**Causa raiz:** A função `loadErpData` internamente já diferencia entre admin (busca API + cache) e não-admin (apenas cache). Porém, a chamada está sendo bloqueada no Dashboard antes mesmo de chegar ao contexto.

---

## Alterações Necessárias

### Arquivo 1: `src/components/dashboard/DashboardHeader.tsx`

| Linha | Alteração |
|-------|-----------|
| 75 | Envolver `<SheetConfigDialog />` em `{isAdmin && ...}` |
| 135 | Envolver `<SheetConfigDialog />` em `{isAdmin && ...}` |

**Código:**
```tsx
// Desktop (linha 75)
{isAdmin && <SheetConfigDialog />}

// Mobile (linha 135)
{isAdmin && <SheetConfigDialog />}
```

### Arquivo 2: `src/pages/Dashboard.tsx`

Modificar a lógica de carregamento para permitir que não-admin também carreguem dados (do cache).

| Linhas | Antes | Depois |
|--------|-------|--------|
| 60-71 | Auto-load só para admin | Auto-load para todos (cache será lido) |
| 116-120 | Reload só para admin | Reload para todos (não-admin lerá do cache) |

**Linha 60-71 - Remover condição `isAdmin`:**
```tsx
// Antes
if (
  !initialLoadDone && 
  !isLoading && 
  !isConnected && 
  erpCredentials?.hasPassword &&
  isAdmin  // <-- Remover
) {

// Depois
if (
  !initialLoadDone && 
  !isLoading && 
  !isConnected && 
  erpCredentials?.hasPassword
) {
```

**Linha 116-120 - Remover condição `isAdmin`:**
```tsx
// Antes
if (isConnected && filters.dateFrom && filters.dateTo && isAdmin) {
  loadErpData(filters.dateFrom, filters.dateTo);
}

// Depois
if (isConnected && filters.dateFrom && filters.dateTo) {
  loadErpData(filters.dateFrom, filters.dateTo);
}
```

---

## Fluxo Após Correção

| Usuário | Ação no Dashboard | Resultado |
|---------|-------------------|-----------|
| Admin | Auto-load / Filtrar | Busca API + salva cache + exibe dados |
| Não-Admin | Auto-load / Filtrar | Lê do cache global + exibe dados |

A função `loadErpDataProgressive` (no contexto) já possui a lógica correta:
1. Verifica quais meses estão em cache
2. Para não-admin, apenas carrega do cache (não faz fetch da API)
3. Se não houver cache, exibe mensagem "aguardando dados do ERP"

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/DashboardHeader.tsx` | Adicionar `{isAdmin && ...}` ao redor de `<SheetConfigDialog />` (desktop + mobile) |
| `src/pages/Dashboard.tsx` | Remover condição `isAdmin` das linhas 66 e 117 para permitir carregamento de cache para não-admin |

---

## Resultado Esperado

- Botão "ERP Online" visível **apenas para admin**
- Usuários não-admin poderão **visualizar dados do cache global** carregado pelo admin
- Se não houver dados em cache, não-admin verá mensagem "aguardando dados do ERP"

