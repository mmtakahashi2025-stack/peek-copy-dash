

# Plano: Simplificar Tooltip e Adicionar Legendas Anuais

## Resumo das Mudanças

1. **Tooltip simplificado** - Mostrar apenas faturamento OU lucro dependendo do modo selecionado
2. **Legendas de melhor/pior mês** - Já adaptam ao viewMode (funcionando)
3. **Novas legendas de totais anuais** - Adicionar faturamento anual e lucro anual abaixo do gráfico

---

## Mudanças Necessárias

### Arquivo: `src/components/dashboard/SalesEvolutionChart.tsx`

#### 1. Modificar `AnnualTooltipContent` (linhas 60-126)

Simplificar o tooltip para mostrar apenas a métrica ativa. O tooltip precisa receber o `viewMode` como prop.

**De (mostra ambos faturamento e lucro):**
```typescript
const AnnualTooltipContent = ({ active, payload, label }: any) => {
  // ... mostra faturamento E lucro sempre
};
```

**Para (mostra apenas a métrica selecionada):**
```typescript
const AnnualTooltipContent = ({ active, payload, label, viewMode }: any) => {
  const dataPoint = payload[0]?.payload;
  if (!dataPoint) return null;
  
  const isLucro = viewMode === 'lucro';
  const atual = isLucro ? dataPoint.lucro : dataPoint.faturamento;
  const anterior = isLucro ? dataPoint.lucroAnterior : dataPoint.faturamentoAnterior;
  const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : 0;
  const isGrowth = atual > anterior;
  const isDecline = atual < anterior;
  
  return (
    <div className="...">
      <p className="font-medium mb-2">{label}</p>
      <span>{isLucro ? 'LUCRO' : 'FATURAMENTO'}</span>
      <span>{formatCurrencyFull(atual)} ({variacao}%)</span>
      <span>Ano anterior: {formatCurrencyFull(anterior)}</span>
    </div>
  );
};
```

#### 2. Passar `viewMode` para o tooltip (linha 495)

```typescript
<ChartTooltip content={<AnnualTooltipContent viewMode={viewMode} />} />
```

#### 3. Adicionar cálculo de totais anuais (novo useMemo após linha 376)

```typescript
const annualTotals = useMemo(() => {
  const totalFaturamento = yearlyComparisonData.reduce((sum, d) => sum + d.faturamento, 0);
  const totalFaturamentoAnterior = yearlyComparisonData.reduce((sum, d) => sum + d.faturamentoAnterior, 0);
  const totalLucro = yearlyComparisonData.reduce((sum, d) => sum + d.lucro, 0);
  const totalLucroAnterior = yearlyComparisonData.reduce((sum, d) => sum + d.lucroAnterior, 0);
  
  const variacaoFat = totalFaturamentoAnterior > 0 
    ? ((totalFaturamento - totalFaturamentoAnterior) / totalFaturamentoAnterior) * 100 
    : 0;
  const variacaoLucro = totalLucroAnterior > 0 
    ? ((totalLucro - totalLucroAnterior) / totalLucroAnterior) * 100 
    : 0;
  
  return {
    faturamento: totalFaturamento,
    faturamentoAnterior: totalFaturamentoAnterior,
    lucro: totalLucro,
    lucroAnterior: totalLucroAnterior,
    variacaoFat,
    variacaoLucro,
  };
}, [yearlyComparisonData]);
```

#### 4. Adicionar legendas de totais anuais (após linha 545, antes de fechar TabsContent)

Nova seção abaixo das legendas de melhor/pior mês:

```text
╔══════════════════════════════════════════════════════════════════════════╗
║  📈 Melhor: Dezembro - R$ 1.850.000    ↑ +15.2%                          ║
║  📉 Pior: Fevereiro - R$ 620.000       ↓ -8.5%                           ║
║  ─────────────────────────────────────────────────────────────────────── ║
║  💰 Faturamento Anual: R$ 12.500.000 (2024: R$ 11.200.000)   ↑ +11.6%    ║
║  📊 Lucro Anual: R$ 2.500.000 (2024: R$ 2.150.000)           ↑ +16.3%    ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Interface Visual Final

### Tooltip (quando Faturamento selecionado)
```text
┌─────────────────────────────┐
│  Dezembro                   │
│  ───────────────────────    │
│  FATURAMENTO                │
│  ↗ R$ 1.850.000 (+15.2%)    │
│  ───────────────────────    │
│  Ano anterior:              │
│  R$ 1.606.000               │
└─────────────────────────────┘
```

### Tooltip (quando Lucro selecionado)
```text
┌─────────────────────────────┐
│  Dezembro                   │
│  ───────────────────────    │
│  LUCRO                      │
│  ↗ R$ 370.000 (+18.5%)      │
│  ───────────────────────    │
│  Ano anterior:              │
│  R$ 312.000                 │
└─────────────────────────────┘
```

### Legendas completas
```text
📈 Melhor: Dezembro - R$ 1.850.000    ↑ +15.2%
📉 Pior: Fevereiro - R$ 620.000       ↓ -8.5%
────────────────────────────────────────────────
💰 Faturamento Anual: R$ 12.500.000   ↑ +11.6%
📊 Lucro Anual: R$ 2.500.000          ↑ +16.3%
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/dashboard/SalesEvolutionChart.tsx` | Simplificar tooltip, adicionar prop viewMode, calcular totais anuais, adicionar legendas |

---

## Detalhes da Implementação

1. **AnnualTooltipContent** (linhas 60-126): 
   - Adicionar prop `viewMode`
   - Usar `payload[0].payload` para acessar dados completos
   - Renderizar apenas a métrica selecionada

2. **Chamada do tooltip** (linha 495):
   - Passar `viewMode={viewMode}` como prop

3. **Novo useMemo `annualTotals`** (após linha 376):
   - Calcular soma de todos os meses para faturamento e lucro
   - Calcular variação percentual vs ano anterior

4. **Nova seção de legendas anuais** (após linha 545):
   - Exibir faturamento anual com variação
   - Exibir lucro anual com variação
   - Mostrar valores do ano anterior para contexto

---

## Complexidade

Mudança de média complexidade:
- Refatorar tooltip (~30 linhas)
- Adicionar useMemo para totais (~15 linhas)
- Adicionar legendas (~25 linhas)

Nenhuma alteração no banco de dados ou edge functions necessária.

