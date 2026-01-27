
# Ocultar Botoes Admin e Reorganizar Layout

## Resumo das Alteracoes

1. **Ocultar botoes de cache e refresh para usuarios nao-admin**
2. **Reorganizar modulos para ficarem lado a lado**

---

## 1. Ocultar Botoes Admin-Only

**Arquivo:** `src/components/dashboard/DashboardFilters.tsx`

### Botao de Refresh ERP (linhas 389-410)
Envolver o botao `RefreshCw` em uma verificacao `isAdmin`:

```tsx
// Antes (linhas 389-410): Visivel para todos
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="outline" size="icon" onClick={...}>
        <RefreshCw className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    ...
  </Tooltip>
</TooltipProvider>

// Depois: Apenas para admin
{isAdmin && (
  <TooltipProvider>
    <Tooltip>
      ...
    </Tooltip>
  </TooltipProvider>
)}
```

### Botao de Cache (linha 413)
Envolver o `CacheInfoButton` em verificacao `isAdmin`:

```tsx
// Antes
<CacheInfoButton />

// Depois
{isAdmin && <CacheInfoButton />}
```

---

## 2. Reorganizar Layout dos Modulos

**Objetivo:** Colocar os tres modulos (Evolucao de Vendas, Ranking Colaboradores, Produtos Mais Vendidos) lado a lado em telas grandes.

### Alteracoes Necessarias

**Arquivo:** `src/components/dashboard/SalesEvolutionChart.tsx`

| Linha | Antes | Depois |
|-------|-------|--------|
| 193 | `lg:col-span-2` | `lg:col-span-1` |
| 205, 227, 279, 312 | `h-[300px]` / `h-[240px]` | `h-[280px]` / `h-[220px]` |

**Arquivo:** `src/pages/Dashboard.tsx`

A grid atual `grid-cols-1 lg:grid-cols-3` ja suporta 3 colunas. Com o chart usando apenas 1 coluna, os tres modulos ficarao lado a lado automaticamente.

---

## Visualizacao do Layout

**Antes (Grid 3 colunas):**
```text
+---------------------+---------------------+---------------------+
|     Evolucao de Vendas (col-span-2)       |    Ranking          |
+---------------------+---------------------+---------------------+
|     Produtos                              |                     |
+-------------------------------------------+---------------------+
```

**Depois (Grid 3 colunas):**
```text
+---------------+---------------+---------------+
|   Evolucao    |    Ranking    |   Produtos    |
|   de Vendas   | Colaboradores | Mais Vendidos |
+---------------+---------------+---------------+
```

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/dashboard/DashboardFilters.tsx` | Envolver `RefreshCw` e `CacheInfoButton` em `{isAdmin && ...}` |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Mudar `lg:col-span-2` para `lg:col-span-1`, ajustar alturas |

---

## Resultado Esperado

- Usuarios **nao-admin** nao verao os botoes de cache e refresh do ERP
- Os tres modulos (grafico + 2 rankings) aparecerao **lado a lado** em telas grandes
- Em telas menores (mobile/tablet), os modulos continuarao empilhados verticalmente
