
# Plano: Corrigir Tooltips (HoverCard) nos Rankings

## Problema Identificado

Os HoverCards (tooltips) nos cards de Produtos e Vendedores nao estao aparecendo porque o componente `HoverCardContent` nao esta sendo renderizado atraves de um **Portal**.

### Causa Raiz

O arquivo `src/components/ui/hover-card.tsx` exporta o `HoverCardContent` sem encapsula-lo em um `HoverCardPortal`. Isso causa:

1. O conteudo do hover ser renderizado dentro da hierarquia DOM do componente pai
2. Se o pai tem `overflow: hidden` ou scroll, o tooltip fica cortado ou invisivel
3. Problemas de z-index pois o elemento nao esta no topo do DOM

---

## Solucao

Modificar o componente `HoverCardContent` para usar o `HoverCardPortal` internamente:

### Arquivo: `src/components/ui/hover-card.tsx`

```text
ANTES:
const HoverCardContent = React.forwardRef<...>(
  ({ className, align = "center", sideOffset = 4, ...props }, ref) => (
    <HoverCardPrimitive.Content ... />
  )
);

DEPOIS:
const HoverCardContent = React.forwardRef<...>(
  ({ className, align = "center", sideOffset = 4, ...props }, ref) => (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content ... />
    </HoverCardPrimitive.Portal>
  )
);
```

---

## Mudancas Necessarias

| Arquivo | Acao |
|---------|------|
| `src/components/ui/hover-card.tsx` | Adicionar `HoverCardPrimitive.Portal` envolvendo o `Content` |

---

## Detalhes Tecnicos

O `HoverCardPrimitive.Portal` renderiza o conteudo diretamente no `document.body`, garantindo:
- Z-index funcional (elemento no topo do DOM)
- Sem interferencia de `overflow: hidden` dos pais
- Posicionamento correto mesmo em containers com scroll

Esta e a mesma abordagem usada pelo shadcn/ui em versoes mais recentes e por outros componentes como `Dialog`, `Popover`, etc.

---

## Resultado Esperado

Ao passar o mouse sobre um produto ou vendedor nos rankings, o tooltip aparecera mostrando:
- **Produtos**: Top 3 vendedores daquele produto
- **Vendedores**: Top 3 produtos vendidos por aquele colaborador
