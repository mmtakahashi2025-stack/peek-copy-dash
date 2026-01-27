
# Plano: Tooltips Interativos nos Rankings

## Funcionalidade

Adicionar tooltips informativos que aparecem ao posicionar o mouse sobre os itens dos rankings:

1. **Produtos Mais Vendidos**: Ao passar o mouse sobre um produto, mostrar os **3 maiores vendedores** daquele produto específico
2. **Ranking de Colaboradores**: Ao passar o mouse sobre um colaborador, mostrar os **3 produtos mais vendidos** por ele

---

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────┐
│                     Dashboard.tsx                            │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │ ProductRanking  │         │  RankingCard    │            │
│  │ + rawData prop  │         │ + rawData prop  │            │
│  └────────┬────────┘         └────────┬────────┘            │
│           │                           │                      │
│           ▼                           ▼                      │
│   HoverCard com                HoverCard com                 │
│   Top 3 Vendedores             Top 3 Produtos                │
│   do Produto                   do Colaborador                │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

### 1. `src/components/dashboard/ProductRankingCard.tsx`

**Alteracoes:**
- Adicionar prop `rawData` para calcular vendedores por produto
- Envolver cada item do ranking com `HoverCard` do Radix
- Calcular os 3 maiores vendedores para o produto quando hover

```tsx
// Nova interface e prop
interface ProductRankingCardProps {
  produtos: ProdutoData[];
  rawData: RawSaleRow[];  // Nova prop
}

// Funcao para calcular top vendedores de um produto
function getTopSellersForProduct(rawData: RawSaleRow[], productName: string): { nome: string; quantidade: number }[] {
  const byEmissor: Record<string, number> = {};
  
  rawData
    .filter(r => r.Item === productName)
    .forEach(row => {
      const emissor = row.Emissor;
      if (!emissor) return;
      byEmissor[emissor] = (byEmissor[emissor] || 0) + (row.Quantidade || 0);
    });
  
  return Object.entries(byEmissor)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3);
}

// No JSX, envolver cada item:
<HoverCard openDelay={200} closeDelay={100}>
  <HoverCardTrigger asChild>
    <div className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
      {/* conteudo existente do item */}
    </div>
  </HoverCardTrigger>
  <HoverCardContent className="w-64" side="left">
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Top Vendedores</h4>
      {topSellers.map((seller, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span>{i + 1}. {seller.nome}</span>
          <span className="text-muted-foreground">{seller.quantidade} un.</span>
        </div>
      ))}
    </div>
  </HoverCardContent>
</HoverCard>
```

---

### 2. `src/components/dashboard/RankingCard.tsx`

**Alteracoes:**
- Adicionar prop `rawData` para calcular produtos por colaborador
- Envolver cada item com `HoverCard`
- Calcular os 3 produtos mais vendidos pelo colaborador quando hover

```tsx
// Nova interface e prop
interface RankingCardProps {
  colaboradores: Colaborador[];
  rawData: RawSaleRow[];  // Nova prop
}

// Funcao para calcular top produtos de um colaborador
function getTopProductsForSeller(rawData: RawSaleRow[], sellerName: string): { nome: string; quantidade: number }[] {
  const byProduto: Record<string, number> = {};
  
  rawData
    .filter(r => r.Emissor === sellerName)
    .forEach(row => {
      const item = row.Item;
      if (!item) return;
      byProduto[item] = (byProduto[item] || 0) + (row.Quantidade || 0);
    });
  
  return Object.entries(byProduto)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 3);
}

// No JSX, envolver cada item:
<HoverCard openDelay={200} closeDelay={100}>
  <HoverCardTrigger asChild>
    <div className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
      {/* conteudo existente do colaborador */}
    </div>
  </HoverCardTrigger>
  <HoverCardContent className="w-72" side="left">
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Top Produtos Vendidos</h4>
      {topProducts.map((product, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span className="truncate flex-1">{i + 1}. {product.nome}</span>
          <span className="text-muted-foreground ml-2">{product.quantidade} un.</span>
        </div>
      ))}
    </div>
  </HoverCardContent>
</HoverCard>
```

---

### 3. `src/pages/Dashboard.tsx`

**Alteracoes:**
- Passar `rawData` como prop para ambos os componentes de ranking

```tsx
// Linha 236-237, adicionar rawData:
<RankingCard colaboradores={colaboradores} rawData={rawData} />
<ProductRankingCard produtos={produtos} rawData={rawData} />
```

---

## Detalhes Tecnicos

### Componente HoverCard
Ja existe no projeto: `src/components/ui/hover-card.tsx`

```tsx
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
```

### Performance
- Os calculos sao feitos apenas quando o usuario passa o mouse (on-demand)
- Usando `useMemo` dentro do map para evitar recalculos desnecessarios
- HoverCard tem `openDelay` de 200ms para evitar ativacoes acidentais

### UX
- Posicionamento do tooltip: `side="left"` para nao sobrepor o ranking
- Delay de abertura: 200ms (rapido mas evita flicker)
- Delay de fechamento: 100ms (permite mover para o tooltip se necessario)
- Truncate em nomes longos de produtos

---

## Exemplo Visual

**Produto Mais Vendido - Hover:**
```text
┌─────────────────────────────────────────┐
│ 1. Ingresso Cataratas   │  1.234 un.   │ ← Mouse aqui
└─────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Top Vendedores          │
│  ────────────────────    │
│  1. Joao Silva   450 un. │
│  2. Maria Lima   380 un. │
│  3. Pedro Costa  205 un. │
└──────────────────────────┘
```

**Colaborador - Hover:**
```text
┌─────────────────────────────────────────┐
│ 1. JS  Joao Silva  │  120 vendas       │ ← Mouse aqui
└─────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────┐
│  Top Produtos Vendidos             │
│  ────────────────────────────      │
│  1. Ingresso Cataratas   450 un.   │
│  2. Passeio Itaipu       280 un.   │
│  3. Combo Familia        150 un.   │
└────────────────────────────────────┘
```

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `ProductRankingCard.tsx` | Adicionar HoverCard com top 3 vendedores por produto |
| `RankingCard.tsx` | Adicionar HoverCard com top 3 produtos por colaborador |
| `Dashboard.tsx` | Passar `rawData` para os componentes de ranking |

---

## Resultado Esperado

| Interacao | Antes | Depois |
|-----------|-------|--------|
| Hover em produto | Apenas highlight | Mostra 3 maiores vendedores |
| Hover em colaborador | Apenas highlight | Mostra 3 produtos mais vendidos |
| Performance | - | Calculo on-demand, sem impacto no carregamento |
