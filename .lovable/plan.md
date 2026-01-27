
# Melhorias no Grafico de Evolucao de Vendas

## Resumo das Mudancas

1. **Aba Mensal**: Adicionar seletores de mes e ano para navegacao livre
2. **Aba Ultimos 12 Meses**: Adicionar comparativo com o mesmo periodo do ano anterior

---

## Alteracoes Detalhadas

### Arquivo: `src/components/dashboard/SalesEvolutionChart.tsx`

#### 1. Adicionar Estado Local para Mes/Ano Selecionado

```typescript
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Dentro do componente, adicionar estados:
const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
```

#### 2. Atualizar chartConfig para Suportar Comparativo

```typescript
const chartConfig: ChartConfig = {
  faturamento: {
    label: 'Faturamento Atual',
    color: 'hsl(var(--primary))',
  },
  faturamentoAnterior: {
    label: 'Periodo Anterior',
    color: 'hsl(var(--muted-foreground))',
  },
};
```

#### 3. Modificar `last12MonthsData` para Incluir Comparativo

```typescript
const last12MonthsData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? rawData 
    : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

  const now = new Date();
  const months: { year: number; month: number; label: string }[] = [];
  
  // Ultimos 12 meses
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      label: `${meses[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`,
    });
  }

  // Agrupar faturamento por ano-mes
  const monthlyFaturamento: { [key: string]: number } = {};
  
  filialFiltered.forEach(row => {
    const rowDate = parseRowDate(row['Data Venda']);
    if (!rowDate || isNaN(rowDate.getTime())) return;
    
    const key = `${rowDate.getFullYear()}-${rowDate.getMonth()}`;
    if (row.Tipo !== 'PC') {
      monthlyFaturamento[key] = (monthlyFaturamento[key] || 0) + (row.Líquido || 0);
    }
  });

  // Retornar dados com comparativo do ano anterior
  return months.map(m => {
    const currentKey = `${m.year}-${m.month}`;
    const previousKey = `${m.year - 1}-${m.month}`;
    
    return {
      mes: m.label,
      faturamento: Math.round(monthlyFaturamento[currentKey] || 0),
      faturamentoAnterior: Math.round(monthlyFaturamento[previousKey] || 0),
    };
  });
}, [rawData, filialId]);
```

#### 4. Modificar `dailyData` para Usar Mes/Ano Selecionado

```typescript
const dailyData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? rawData 
    : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

  // Usar mes/ano selecionado ao inves do filtro de datas
  const targetYear = selectedYear;
  const targetMonth = selectedMonth;
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const dailyFaturamento: { [day: number]: number } = {};
  
  filialFiltered.forEach(row => {
    const rowDate = parseRowDate(row['Data Venda']);
    if (!rowDate || isNaN(rowDate.getTime())) return;
    
    if (rowDate.getFullYear() === targetYear && rowDate.getMonth() === targetMonth) {
      const day = rowDate.getDate();
      if (row.Tipo !== 'PC') {
        dailyFaturamento[day] = (dailyFaturamento[day] || 0) + (row.Líquido || 0);
      }
    }
  });

  return Array.from({ length: daysInMonth }, (_, i) => ({
    dia: String(i + 1).padStart(2, '0'),
    faturamento: Math.round(dailyFaturamento[i + 1] || 0),
  }));
}, [rawData, filialId, selectedMonth, selectedYear]);
```

#### 5. Gerar Opcoes de Anos Dinamicamente

```typescript
const yearOptions = useMemo(() => {
  const currentYear = new Date().getFullYear();
  // Gerar range de 5 anos atras ate o ano atual
  return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
}, []);
```

#### 6. Atualizar UI da Aba Mensal com Seletores

```typescript
<TabsContent value="mensal" className="h-[300px]">
  {/* Seletores de Mes e Ano */}
  <div className="flex gap-2 mb-4">
    <Select 
      value={String(selectedMonth)} 
      onValueChange={(v) => setSelectedMonth(parseInt(v))}
    >
      <SelectTrigger className="w-[140px] h-8">
        <SelectValue placeholder="Mes" />
      </SelectTrigger>
      <SelectContent>
        {mesesCompletos.map((mes, index) => (
          <SelectItem key={index} value={String(index)}>{mes}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    
    <Select 
      value={String(selectedYear)} 
      onValueChange={(v) => setSelectedYear(parseInt(v))}
    >
      <SelectTrigger className="w-[100px] h-8">
        <SelectValue placeholder="Ano" />
      </SelectTrigger>
      <SelectContent>
        {yearOptions.map((year) => (
          <SelectItem key={year} value={String(year)}>{year}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  
  {/* Grafico de barras diarias */}
  <div className="h-[250px]">
    {/* ... conteudo do grafico ... */}
  </div>
</TabsContent>
```

#### 7. Atualizar Grafico de 12 Meses com Barras Comparativas

```typescript
<TabsContent value="12meses" className="h-[300px]">
  <ChartContainer config={chartConfig} className="h-full w-full">
    <BarChart data={last12MonthsData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
      <XAxis 
        dataKey="mes" 
        tick={{ fontSize: 11 }}
        className="fill-muted-foreground"
        tickLine={false}
        axisLine={false}
      />
      <YAxis 
        tick={{ fontSize: 11 }}
        tickFormatter={formatCurrency}
        className="fill-muted-foreground"
        tickLine={false}
        axisLine={false}
        width={60}
      />
      <ChartTooltip 
        content={<ChartTooltipContent />} 
        formatter={(value: number) => formatCurrencyFull(value)}
      />
      {/* Barra do periodo anterior (mais clara, atras) */}
      <Bar 
        dataKey="faturamentoAnterior" 
        name="Periodo Anterior"
        fill="hsl(var(--muted-foreground))" 
        opacity={0.4}
        radius={[4, 4, 0, 0]}
      />
      {/* Barra do periodo atual (cor principal, frente) */}
      <Bar 
        dataKey="faturamento" 
        name="Faturamento Atual"
        fill="hsl(var(--primary))" 
        radius={[4, 4, 0, 0]}
      />
    </BarChart>
  </ChartContainer>
</TabsContent>
```

#### 8. Atualizar Titulo da Aba Mensal

```typescript
<TabsTrigger value="mensal">
  {mesesCompletos[selectedMonth]}/{selectedYear}
</TabsTrigger>
```

---

## Resultado Visual Esperado

### Aba "Ultimos 12 Meses"
- Duas barras por mes: uma clara (ano anterior) e uma colorida (ano atual)
- Tooltip mostrando ambos os valores para comparacao
- Legenda identificando cada serie

### Aba Mensal
- Seletores compactos de mes e ano acima do grafico
- Grafico de barras por dia do mes selecionado
- Titulo da aba reflete a selecao atual

---

## Resumo Tecnico

| Mudanca | Descricao |
|---------|-----------|
| Estado local | `selectedMonth` e `selectedYear` para navegacao |
| `last12MonthsData` | Inclui `faturamentoAnterior` do ano anterior |
| `dailyData` | Usa mes/ano do estado local |
| UI Mensal | Seletores de mes e ano com Select |
| UI 12 Meses | Duas barras (atual + anterior) sobrepostas |
