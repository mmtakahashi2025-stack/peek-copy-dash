
# Plano: Otimizar Cache Local IndexedDB

## Problema Identificado

O cache local do IndexedDB esta armazenando dados brutos completos de todos os meses (37 meses atualmente), resultando em um tamanho estimado de 70-100 MB por navegador.

---

## Solucao Recomendada: Abordagem Hibrida

Combinar 3 estrategias para reducao maxima:

### 1. Limite de Periodo no Cache Local

Manter apenas os ultimos 12 meses no IndexedDB local. Meses mais antigos serao carregados do Supabase quando necessario.

```text
ANTES (37 meses):
[Jan/23] [Fev/23] ... [Dez/25] = ~95 MB

DEPOIS (12 meses):
[Fev/25] [Mar/25] ... [Jan/26] = ~26 MB
                                 (-73%)
```

### 2. Limpeza Automatica de Meses Antigos

Quando um novo mes for salvo, remover automaticamente meses que excedam o limite.

```typescript
// Nova constante em indexeddb.ts
const MAX_LOCAL_MONTHS = 12;

// Nova funcao
export async function pruneOldLocalMonths(maxMonths: number) {
  const allMonths = await getAllLocalMonths();
  if (allMonths.length <= maxMonths) return;
  
  // Ordenar por data (mais recente primeiro)
  allMonths.sort((a, b) => b.key.localeCompare(a.key));
  
  // Deletar meses excedentes
  for (let i = maxMonths; i < allMonths.length; i++) {
    const [year, month] = allMonths[i].key.split('-').map(Number);
    await deleteLocalMonthData(year, month);
  }
}
```

### 3. Configuracao de Retencao pelo Usuario

Adicionar opcao nas configuracoes para o usuario escolher:

```text
+------------------------------------------+
| Cache Local                              |
|                                          |
| Manter dados dos ultimos:                |
|  [6 meses]  [12 meses]  [24 meses]       |
|                                          |
| Tamanho atual: 26 MB (12 meses)          |
| [Limpar Cache Local]                     |
+------------------------------------------+
```

---

## Arquivos a Modificar

### 1. `src/lib/indexeddb.ts`

| Mudanca | Descricao |
|---------|-----------|
| Adicionar `MAX_LOCAL_MONTHS` | Constante para limite padrao (12) |
| Adicionar `pruneOldLocalMonths()` | Funcao para limpar meses antigos |
| Modificar `setLocalMonthData()` | Chamar prune apos salvar novo mes |

### 2. `src/hooks/useErpCache.ts`

| Mudanca | Descricao |
|---------|-----------|
| Integrar limpeza automatica | Chamar prune apos salvar dados |
| Expor funcao de config | Para UI de configuracoes |

### 3. `src/components/dashboard/CacheInfoButton.tsx`

| Mudanca | Descricao |
|---------|-----------|
| Mostrar tamanho real | Exibir MB usado no IndexedDB |
| Adicionar seletor de retencao | Dropdown 6/12/24 meses |
| Botao limpar cache local | Separado do cache Supabase |

---

## Detalhes Tecnicos

### Nova Funcao: Limpar Meses Antigos

```typescript
// src/lib/indexeddb.ts

const DEFAULT_MAX_LOCAL_MONTHS = 12;

export async function pruneOldLocalMonths(
  maxMonths: number = DEFAULT_MAX_LOCAL_MONTHS
): Promise<number> {
  const allMonths = await getAllLocalMonths();
  
  if (allMonths.length <= maxMonths) {
    return 0; // Nada a fazer
  }
  
  // Ordenar por chave (mais recente primeiro: 2026-01 > 2025-12)
  const sorted = allMonths.sort((a, b) => 
    b.key.localeCompare(a.key)
  );
  
  let deletedCount = 0;
  
  // Manter apenas os N mais recentes
  for (let i = maxMonths; i < sorted.length; i++) {
    const [year, month] = sorted[i].key.split('-').map(Number);
    const success = await deleteLocalMonthData(year, month);
    if (success) deletedCount++;
  }
  
  console.log(`[IndexedDB] Pruned ${deletedCount} old months, kept ${maxMonths}`);
  return deletedCount;
}
```

### Integracao no Save

```typescript
// Em useErpCache.ts - modificar setMonthData

const setMonthData = useCallback(async (...) => {
  // ... save to Supabase ...
  
  if (isIndexedDBAvailable()) {
    await setLocalMonthData(year, month, data);
    
    // Limpar meses antigos automaticamente
    const { pruneOldLocalMonths } = await import('@/lib/indexeddb');
    await pruneOldLocalMonths(12); // Manter ultimos 12 meses
    
    // Atualizar stats
    const stats = await getLocalCacheStats();
    setLocalCacheStats({...});
  }
  // ...
});
```

### UI de Configuracao

```tsx
// Em CacheInfoButton.tsx - adicionar secao

<div className="space-y-2">
  <Label>Manter dados locais dos ultimos:</Label>
  <Select 
    value={localRetention} 
    onValueChange={handleRetentionChange}
  >
    <SelectItem value="6">6 meses (~13 MB)</SelectItem>
    <SelectItem value="12">12 meses (~26 MB)</SelectItem>
    <SelectItem value="24">24 meses (~52 MB)</SelectItem>
  </Select>
</div>
```

---

## Economia de Espaco Esperada

| Configuracao | Meses | Registros | Tamanho Estimado |
|--------------|-------|-----------|------------------|
| 6 meses | 6 | ~35.000 | ~13 MB |
| 12 meses (padrao) | 12 | ~68.000 | ~26 MB |
| 24 meses | 24 | ~136.000 | ~52 MB |
| Sem limite | 37+ | ~200.000+ | ~95 MB+ |

**Reducao com 12 meses: -73% comparado a manter tudo**

---

## Fluxo de Funcionamento

```text
Usuario abre o dashboard
         |
         v
[Carregar do IndexedDB] <-- Ultimos 12 meses (instantaneo)
         |
         v
Usuario seleciona periodo antigo (ex: Jan/2023)
         |
         v
[Nao esta no IndexedDB local]
         |
         v
[Buscar do Supabase] --> Exibir dados
         |
         v
[NAO salvar no IndexedDB] <-- Evita acumulo
```

Dados antigos ficam apenas no Supabase e sao buscados sob demanda, sem poluir o cache local.

---

## Resultado Visual

```text
+------------------------------------------+
| Cache de Dados                           |
+------------------------------------------+
| ⚡ Cache Local (Instantaneo)             |
|   Meses: 12  |  Registros: 68.420        |
|   Tamanho: 26.3 MB                       |
|                                          |
|   Manter ultimos: [12 meses v]           |
|                                          |
|   [Limpar Cache Local]                   |
+------------------------------------------+
| 🗄️ Cache Supabase (Sincronizado)         |
|   Meses: 37  |  Tamanho: 12.2 MB         |
+------------------------------------------+
```

