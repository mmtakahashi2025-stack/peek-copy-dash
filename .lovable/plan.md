
# Plano: Adicionar Icones de Crescimento/Queda no Tooltip

## Objetivo

Adicionar indicadores visuais (setas) no tooltip do grafico de evolucao de vendas para mostrar se houve crescimento ou queda comparando o ano atual com o ano anterior.

---

## Visualizacao Esperada

```text
+------------------------+
|  Nov                   |
|  ▲ R$ 2.696.870,00     |  <- Verde com seta para cima (atual maior)
|    R$ 2.995.307,00     |  <- Cinza (ano anterior)
|  +12,4%                |  <- Percentual de variacao
+------------------------+

OU

+------------------------+
|  Mar                   |
|  ▼ R$ 1.800.000,00     |  <- Vermelho com seta para baixo (atual menor)
|    R$ 2.100.000,00     |
|  -14,3%                |
+------------------------+
```

---

## Mudanca Tecnica

### Arquivo: `src/components/dashboard/SalesEvolutionChart.tsx`

Substituir o `ChartTooltipContent` padrao por um tooltip customizado que:

1. Acessa os valores `faturamento` (atual) e `faturamentoAnterior` do payload
2. Calcula a variacao percentual: `((atual - anterior) / anterior) * 100`
3. Exibe icone apropriado:
   - **TrendingUp** (verde) se atual > anterior
   - **TrendingDown** (vermelho) se atual < anterior
   - **Minus** (neutro) se igual

### Codigo do Tooltip Customizado:

```tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Custom tooltip content component
const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length < 2) return null;
  
  const atual = payload.find((p: any) => p.dataKey === 'faturamento')?.value || 0;
  const anterior = payload.find((p: any) => p.dataKey === 'faturamentoAnterior')?.value || 0;
  
  const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : 0;
  const isGrowth = atual > anterior;
  const isDecline = atual < anterior;
  
  return (
    <div className="bg-background border rounded-lg p-2 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      <div className="flex items-center gap-1">
        {isGrowth && <TrendingUp className="h-3 w-3 text-green-500" />}
        {isDecline && <TrendingDown className="h-3 w-3 text-red-500" />}
        {!isGrowth && !isDecline && <Minus className="h-3 w-3 text-muted-foreground" />}
        <span className={isGrowth ? 'text-green-500' : isDecline ? 'text-red-500' : ''}>
          {formatCurrencyFull(atual)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {formatCurrencyFull(anterior)}
      </p>
      {anterior > 0 && (
        <p className={`text-xs font-medium ${isGrowth ? 'text-green-500' : isDecline ? 'text-red-500' : 'text-muted-foreground'}`}>
          {isGrowth ? '+' : ''}{variacao.toFixed(1)}%
        </p>
      )}
    </div>
  );
};
```

### Uso no BarChart:

```tsx
<ChartTooltip 
  content={<CustomTooltipContent />}
/>
```

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/dashboard/SalesEvolutionChart.tsx` | Adicionar componente `CustomTooltipContent` e usar no `ChartTooltip` da aba anual |

---

## Detalhes da Implementacao

1. **Import** dos icones Lucide: `TrendingUp`, `TrendingDown`, `Minus`
2. **Criar** componente `CustomTooltipContent` antes do componente principal
3. **Substituir** `<ChartTooltipContent />` por `<CustomTooltipContent />` na aba "anual"
4. **Manter** tooltip padrao nas abas "semana" e "mes" (nao tem comparativo)

---

## Resultado Final

O tooltip mostrara:
- Nome do mes (Jan, Fev, etc.)
- Valor atual com icone de tendencia (▲ verde ou ▼ vermelho)
- Valor do ano anterior (cinza)
- Percentual de variacao (+X% ou -X%)

Isso proporcionara uma visualizacao clara e imediata do desempenho comparativo.
