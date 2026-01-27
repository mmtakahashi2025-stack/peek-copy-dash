

# Plano Completo: Correções e Melhorias no Dashboard

## Problemas a Resolver

1. **Botao "ERP Online" visivel para nao-admin** - Ainda aparece para usuarios sem permissao
2. **Dados nao aparecem para nao-admin** - Ficam presos na mensagem "Aguardando dados do ERP"
3. **Evolucao de Vendas sem comparativo** - Nao mostra comparacao com ano anterior
4. **Dados do ultimo mes ao logar** - Dashboard nao carrega automaticamente o ultimo mes
5. **Identificacao dos dados visualizados** - Nao ha label indicando qual periodo/filtro esta sendo exibido

---

## 1. Ocultar Botao "ERP Online" para Nao-Admin

### Problema
O `SheetConfigDialog` renderiza o botao "ERP Online/Offline" sem verificar se o usuario e admin.

### Solucao
Adicionar verificacao de role dentro do proprio componente como guard de seguranca.

### Arquivo: `src/components/dashboard/SheetConfigDialog.tsx`

**Linha 1-31 - Adicionar import e guard:**
```tsx
import { useUserRole } from '@/hooks/useUserRole';

export function SheetConfigDialog() {
  const { isAdmin } = useUserRole();
  
  // Guard: nao renderiza para nao-admin
  if (!isAdmin) {
    return null;
  }
  
  // ... resto do componente
}
```

---

## 2. Permitir Nao-Admin Ver Dados do Cache (mesmo expirados)

### Problema
O cache tem regra de expiracao de 24h para os ultimos 3 meses. Quando expira, `loadMonthFromCache` retorna `null`, tratando como "sem dados". Para nao-admin isso causa tela vazia.

### Solucao
Modificar a logica de cache para:
- **Admin**: continua respeitando expiracao (incentiva refresh)
- **Nao-admin**: retorna dados mesmo expirados (stale read)

### Arquivo: `src/hooks/useErpCache.ts`

**Adicionar parametro `isAdmin` nas funcoes de cache:**

```tsx
// Adicionar parametro isAdmin em loadMonthFromCache
const loadMonthFromCache = async (year: number, month: number, isAdmin: boolean): Promise<...> => {
  // ... buscar dados do banco
  
  // Verificar expiracao APENAS para admin
  if (isAdmin && isWithinRefreshWindow(year, month)) {
    const hoursAgo = (Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60);
    if (hoursAgo > MAX_CACHE_AGE_HOURS) {
      // Para admin: cache expirado, precisa refresh
      return null;
    }
  }
  // Para nao-admin: sempre retorna dados se existirem
  return data;
};
```

### Arquivo: `src/contexts/SheetDataContext.tsx`

**Propagar `isAdmin` para as funcoes de cache:**

```tsx
// Na funcao loadErpDataProgressive
const cachedData = await getCachedData(dateFrom, dateTo, isAdmin);
```

---

## 3. Comparativo Ano Anterior na Evolucao de Vendas

### Problema
O grafico ja tem a estrutura para comparativo (`faturamentoAnterior`), mas o usuario relata que nao esta funcionando.

### Analise
Revisando o codigo, o comparativo JA EXISTE:
- Linha 146-153: calcula `faturamentoAnterior` para ano anterior
- Linha 258-264: renderiza barra do ano anterior com opacidade 40%
- Linha 221-223: mostra label "vs {ano-1}"

### Possivel Causa
Se nao ha dados do ano anterior no cache, as barras ficam zeradas. Isso e esperado se o admin nunca carregou dados historicos.

### Solucao
Adicionar indicador visual quando nao houver dados do ano anterior para comparacao:

### Arquivo: `src/components/dashboard/SalesEvolutionChart.tsx`

**Adicionar verificacao e mensagem:**

```tsx
// Verificar se tem dados do ano anterior
const hasPreviousYearData = yearlyComparisonData.some(d => d.faturamentoAnterior > 0);

// Na UI, abaixo do seletor de ano:
{!hasPreviousYearData && hasYearlyData && (
  <p className="text-xs text-muted-foreground">
    Dados de {selectedYearForAnnual - 1} nao disponiveis para comparacao
  </p>
)}
```

---

## 4. Carregar Dados do Ultimo Mes ao Logar

### Problema
Dashboard inicia com filtro do mes atual (dia 1 ate hoje), mas pode nao ter dados. Usuario quer ver dados do ultimo mes completo automaticamente.

### Solucao
Alterar os filtros iniciais para carregar o ultimo mes completo por padrao.

### Arquivo: `src/pages/Dashboard.tsx`

**Linhas 31-41 - Alterar estado inicial dos filtros:**

```tsx
// Antes: mes atual (incompleto)
dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
dateTo: new Date(),

// Depois: ultimo mes completo
const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0);

const [filters, setFilters] = useState<Filters>({
  dateFrom: lastMonthStart,
  dateTo: lastMonthEnd,
  // ... resto igual
});
```

---

## 5. Label Indicando Dados Visualizados

### Problema
Usuario nao sabe qual periodo/filtro esta sendo exibido nos cards de KPI.

### Solucao
Adicionar um label acima da grid de KPIs mostrando o periodo e filial selecionados.

### Arquivo: `src/pages/Dashboard.tsx`

**Antes da linha 176 (grid de KPIs) - Adicionar label:**

```tsx
{/* Label de dados visualizados */}
<div className="flex items-center gap-2 text-sm text-muted-foreground">
  <span className="font-medium">Visualizando:</span>
  <span>
    {filters.dateFrom?.toLocaleDateString('pt-BR')} a {filters.dateTo?.toLocaleDateString('pt-BR')}
  </span>
  {filters.filial !== 'todas' && (
    <>
      <span className="text-muted-foreground/50">|</span>
      <span>Filial: {filters.filial}</span>
    </>
  )}
</div>
```

---

## 6. Corrigir Reload de Dados (Remover Dependencia de isConnected)

### Problema
O `useEffect` de reload depende de `isConnected`, mas para nao-admin isso pode impedir o carregamento.

### Arquivo: `src/pages/Dashboard.tsx`

**Linhas 114-119 - Remover dependencia de isConnected:**

```tsx
// Antes
if (isConnected && filters.dateFrom && filters.dateTo) {

// Depois: sempre tenta carregar quando filtros mudam
if (filters.dateFrom && filters.dateTo && erpCredentials?.hasPassword) {
  loadErpData(filters.dateFrom, filters.dateTo);
}
```

---

## Resumo das Alteracoes por Arquivo

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/dashboard/SheetConfigDialog.tsx` | Adicionar guard `if (!isAdmin) return null` |
| `src/hooks/useErpCache.ts` | Parametro `isAdmin` nas funcoes de cache; nao expirar para nao-admin |
| `src/contexts/SheetDataContext.tsx` | Propagar `isAdmin` para funcoes de cache |
| `src/pages/Dashboard.tsx` | (1) Filtro inicial = ultimo mes completo; (2) Label de periodo acima dos KPIs; (3) Reload sem depender de isConnected |
| `src/components/dashboard/SalesEvolutionChart.tsx` | Mensagem quando nao houver dados do ano anterior |

---

## Resultado Esperado

| Funcionalidade | Antes | Depois |
|----------------|-------|--------|
| Botao ERP para nao-admin | Visivel | Oculto |
| Dados para nao-admin | "Aguardando dados" | Exibe dados do cache (mesmo antigos) |
| Comparativo ano anterior | Ja existe, mas sem feedback | Mensagem explicativa se nao houver dados |
| Filtro inicial | Mes atual (incompleto) | Ultimo mes completo |
| Identificacao de dados | Nenhuma | Label: "Visualizando: DD/MM/AAAA a DD/MM/AAAA" |

