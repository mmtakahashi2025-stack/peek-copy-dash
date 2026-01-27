
# Plano: Implementar Cache no Navegador para Carregamento Instantaneo (estilo Power BI)

## Analise do Problema

**Situacao atual:**
1. Os dados estao em cache no **Supabase** (banco de dados na nuvem)
2. Cada vez que o usuario abre o dashboard, os dados sao buscados via rede
3. Mesmo com cache no Supabase, ha latencia de rede (~100-500ms por requisicao)
4. Um dashboard com 12 meses de dados faz varias requisicoes ao Supabase

**Por que o Power BI e instantaneo:**
- Power BI usa cache **local no navegador** (IndexedDB)
- Os dados ficam salvos no dispositivo do usuario
- Ao abrir, mostra dados locais **imediatamente** enquanto verifica atualizacoes em segundo plano

---

## Solucao Proposta: Cache de 2 Camadas

```text
+------------------+     +------------------+     +------------------+
|   Navegador      |     |    Supabase      |     |      ERP API     |
|   (IndexedDB)    | <-- |    (Cache)       | <-- |    (Origem)      |
+------------------+     +------------------+     +------------------+
    ^                         ^                        ^
    |                         |                        |
  INSTANTANEO              ~100ms                   ~2-5s
  (0ms latencia)           (rede)                  (API lenta)
```

### Fluxo de Carregamento:
1. **Imediato**: Carrega dados do IndexedDB local (0ms)
2. **Background**: Verifica se ha dados novos no Supabase
3. **Atualiza**: Se houver novos dados, atualiza a tela automaticamente

---

## Arquitetura Tecnica

### 1. Criar Hook de Cache Local

**Novo arquivo:** `src/hooks/useLocalCache.ts`

```typescript
// Usa IndexedDB para armazenar dados localmente
// IndexedDB suporta gigabytes de dados (muito mais que localStorage)

interface LocalCacheEntry {
  key: string;           // "erp-2026-01"
  data: RawSaleRow[];    // Dados do mes
  timestamp: number;     // Quando foi salvo
  checksum: string;      // Hash para detectar mudancas
}

// Funcoes principais:
// - getLocalData(year, month) -> dados instantaneos
// - setLocalData(year, month, data) -> salva localmente
// - getLocalChecksum(year, month) -> para comparar com Supabase
```

### 2. Modificar useErpCache.ts

Adicionar camada de cache local **antes** de consultar Supabase:

```typescript
const getMonthData = async (year: number, month: number) => {
  // 1. PRIMEIRO: Tentar cache local (instantaneo)
  const localData = await getLocalData(year, month);
  if (localData) {
    console.log(`[Cache] Dados locais para ${year}-${month} (instantaneo)`);
    
    // 2. BACKGROUND: Verificar se Supabase tem versao mais nova
    checkForUpdates(year, month, localData.checksum);
    
    return localData.data;
  }
  
  // 3. FALLBACK: Buscar do Supabase se nao houver local
  const supabaseData = await loadMonthFromCache(year, month);
  if (supabaseData) {
    // Salvar localmente para proxima vez
    await setLocalData(year, month, supabaseData);
    return supabaseData;
  }
  
  return null;
};
```

### 3. Estrategia de Sincronizacao

| Situacao | Acao |
|----------|------|
| Dados locais existem | Mostra imediatamente + verifica atualizacoes em background |
| Dados locais nao existem | Busca do Supabase + salva localmente |
| Supabase tem versao nova | Atualiza dados locais + refresh na tela |
| Usuario limpa cache | Limpa local + Supabase (admin) |

### 4. Indicador Visual de Sincronizacao

Adicionar badge no header mostrando estado do cache:
- **Verde**: Dados atualizados
- **Amarelo**: Sincronizando...
- **Cinza**: Usando cache local (offline)

---

## Arquivos a Criar/Modificar

### Novos Arquivos:
1. `src/hooks/useLocalCache.ts` - Hook para IndexedDB
2. `src/lib/indexeddb.ts` - Utilitarios de IndexedDB

### Arquivos a Modificar:
1. `src/hooks/useErpCache.ts` - Integrar cache local
2. `src/contexts/SheetDataContext.tsx` - Usar nova estrategia
3. `src/components/dashboard/CacheInfoButton.tsx` - Mostrar cache local

---

## Beneficios Esperados

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tempo de carregamento inicial | 1-3s | **< 100ms** |
| Carregamento apos primeira visita | 1-3s | **Instantaneo** |
| Funcionamento offline | Nao | **Sim** |
| Uso de dados de rede | Alto | **Minimo** |

---

## Detalhes Tecnicos

### Por que IndexedDB e nao localStorage?

| Caracteristica | localStorage | IndexedDB |
|----------------|--------------|-----------|
| Limite de tamanho | 5-10 MB | **Gigabytes** |
| Performance | Sincrono (bloqueia) | **Assincrono** |
| Tipos de dados | Apenas strings | **Objetos, arrays, blobs** |
| Indices | Nao | **Sim** |

### Estrutura do IndexedDB:

```text
Database: "combo-iguassu-cache"
  Store: "erp-monthly"
    - key: "2026-01" -> { data: [...], timestamp: 1706000000, checksum: "abc123" }
    - key: "2026-02" -> { data: [...], timestamp: 1706100000, checksum: "def456" }
    - key: "2025-12" -> { data: [...], timestamp: 1705000000, checksum: "ghi789" }
```

### Calculo de Checksum:

Para detectar se os dados mudaram sem baixar tudo:
```typescript
function calculateChecksum(data: RawSaleRow[]): string {
  // Hash simples baseado em quantidade + soma de valores
  const count = data.length;
  const totalRevenue = data.reduce((sum, r) => sum + (r['Líquido'] || 0), 0);
  return `${count}-${totalRevenue.toFixed(2)}`;
}
```

---

## Implementacao em Fases

### Fase 1: Cache Local Basico
- Criar hook useLocalCache com IndexedDB
- Integrar com useErpCache
- Mostrar dados locais instantaneamente

### Fase 2: Sincronizacao em Background
- Verificar atualizacoes do Supabase em segundo plano
- Atualizar tela automaticamente se houver novos dados
- Adicionar indicador de sincronizacao

### Fase 3: Suporte Offline
- Detectar quando esta offline
- Mostrar badge "Modo Offline"
- Sincronizar automaticamente ao reconectar

---

## Exemplo de Experiencia do Usuario

```text
1. Usuario abre o dashboard pela primeira vez:
   [Carregando...] -> Busca do Supabase -> Salva localmente
   Tempo: ~1-2s

2. Usuario abre o dashboard na segunda vez:
   [Dados aparecem INSTANTANEAMENTE] -> Background verifica atualizacoes
   Tempo: < 100ms

3. Usuario abre offline:
   [Dados locais] + Badge "Modo Offline"
   Tempo: < 100ms
```

Isso proporcionara uma experiencia similar ao Power BI, onde os dados aparecem imediatamente ao abrir o aplicativo.
