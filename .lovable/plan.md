
# Plano: Legendas Visuais + Modo Semana + Card Maior

## Resumo das Mudancas

Vamos implementar as 3 melhorias no grafico de Evolucao de Vendas de forma eficiente, editando apenas 2 arquivos.

---

## 1. Legendas Visuais no Grafico

Adicionar uma legenda visual abaixo dos seletores mostrando claramente:
- **Quadrado colorido (primario)** + "2026" (ano atual)
- **Quadrado cinza (40% opacidade)** + "2025" (ano anterior)

```text
[■] 2026 (atual)   [■] 2025 (anterior)
```

---

## 2. Terceiro Modo: SEMANA

Adicionar aba "SEMANA" entre ANO e MES com:
- Seletor de semana (Semana 1, 2, 3... do mes)
- Seletor de mes e ano
- Grafico mostrando os 7 dias da semana selecionada

```text
+--------------------------------------------------+
|  [ANO] [SEMANA] [MES]                            |
|                                                  |
|  SEMANA [1 v]   MES [Janeiro v]   ANO [2026 v]   |
|                                                  |
|  [Seg] [Ter] [Qua] [Qui] [Sex] [Sab] [Dom]       |
+--------------------------------------------------+
```

---

## 3. Card Ocupando 3 Colunas

Alterar o layout do grid no Dashboard para que o grafico ocupe toda a largura, com os rankings abaixo em 2 colunas:

```text
ANTES:
+---------------+---------------+---------------+
| Evolucao (1)  | Ranking (1)   | Produtos (1)  |
+---------------+---------------+---------------+

DEPOIS:
+-----------------------------------------------+
|          Evolucao de Vendas (3 colunas)       |
+-----------------------------------------------+
+----------------------+------------------------+
| Ranking Vendedores   | Produtos Mais Vendidos |
+----------------------+------------------------+
```

---

## Arquivos a Modificar

### Arquivo 1: `src/components/dashboard/SalesEvolutionChart.tsx`

| Mudanca | Localizacao |
|---------|-------------|
| Adicionar aba "SEMANA" no TabsList | Linha 265-268 |
| Adicionar estado `selectedWeek` | Linha 109 |
| Adicionar funcao `getWeekDates()` | Apos linha 95 |
| Adicionar TabsContent para semana | Apos linha 352 |
| Adicionar legenda visual na aba anual | Apos linha 293 |

### Arquivo 2: `src/pages/Dashboard.tsx`

| Mudanca | Localizacao |
|---------|-------------|
| Separar chart em linha propria com `col-span-3` | Linhas 227-239 |
| Rankings em grid de 2 colunas abaixo | Nova linha |

---

## Detalhes Tecnicos

### Legenda Visual (Recharts)

Usar o componente `<Legend>` do Recharts ou criar uma legenda manual com divs estilizados:

```tsx
{/* Legenda manual para controle total do estilo */}
<div className="flex items-center gap-4 mt-2">
  <div className="flex items-center gap-1.5">
    <div className="w-3 h-3 rounded-sm bg-primary" />
    <span className="text-xs text-muted-foreground">{selectedYearForAnnual} (atual)</span>
  </div>
  <div className="flex items-center gap-1.5">
    <div className="w-3 h-3 rounded-sm bg-muted-foreground opacity-40" />
    <span className="text-xs text-muted-foreground">{previousYear} (anterior)</span>
  </div>
</div>
```

### Calculo de Semanas do Mes

```tsx
// Calcular semanas do mes selecionado
const getWeeksInMonth = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: { start: number; end: number }[] = [];
  
  let currentDay = 1;
  while (currentDay <= lastDay.getDate()) {
    const weekStart = currentDay;
    const dayOfWeek = new Date(year, month, currentDay).getDay();
    // Semana vai ate domingo (0) ou fim do mes
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const weekEnd = Math.min(currentDay + daysUntilSunday, lastDay.getDate());
    
    weeks.push({ start: weekStart, end: weekEnd });
    currentDay = weekEnd + 1;
  }
  
  return weeks;
};
```

### Novo Layout Dashboard

```tsx
{/* Chart ocupando largura total */}
<div className="grid grid-cols-1 gap-6">
  <SalesEvolutionChart 
    filialId={filters.filial}
    colaboradorId={filters.colaborador}
    dateFrom={filters.dateFrom}
    dateTo={filters.dateTo}
    compareEnabled={filters.compareEnabled}
    compareDateFrom={filters.compareDateFrom}
    compareDateTo={filters.compareDateTo}
  />
</div>

{/* Rankings lado a lado */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <RankingCard colaboradores={colaboradores} rawData={rawData} />
  <ProductRankingCard produtos={produtos} rawData={rawData} />
</div>
```

---

## Economia de Creditos

| Aspecto | Otimizacao |
|---------|------------|
| Arquivos editados | Apenas 2 (vs. criar novos) |
| Reutilizacao | Usa mesma logica de `loadDailyData` para semana |
| Componentes | Reutiliza ChartContainer e BarChart existentes |
| Legenda | Manual com divs (simples, sem dependencias) |

---

## Resultado Visual Esperado

```text
+-----------------------------------------------+
|          Evolucao de Vendas                   |
|  [ANO] [SEMANA] [MES]                         |
|                                               |
|  ANO [2026 v]  comparado com 2025             |
|  [■] 2026 (atual)  [□] 2025 (anterior)        |
|                                               |
|  [===== GRAFICO BARRAS 12 MESES =====]        |
+-----------------------------------------------+

+----------------------+------------------------+
| Ranking Vendedores   | Produtos Mais Vendidos |
| 1. Fulano R$ 50K     | 1. Produto A  120 un   |
| 2. Ciclano R$ 45K    | 2. Produto B  98 un    |
+----------------------+------------------------+
```
