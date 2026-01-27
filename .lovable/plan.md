

# Alteracao do Grafico de Evolucao de Vendas: Seletor de Ano com Comparativo

## Resumo da Mudanca

Substituir a aba "Ultimos 12 Meses" por uma aba "Anual" com seletor de ano, onde o usuario pode escolher qualquer ano disponivel e visualizar o faturamento mensal daquele ano comparado com o ano anterior.

---

## Alteracoes Detalhadas

### Arquivo: `src/components/dashboard/SalesEvolutionChart.tsx`

#### 1. Adicionar Estado para Ano Selecionado na Aba Anual

```typescript
// Linha ~101: Adicionar novo estado para o ano da aba anual
const [selectedYearForAnnual, setSelectedYearForAnnual] = useState(new Date().getFullYear());
```

#### 2. Substituir `last12MonthsData` por `yearlyComparisonData`

A logica muda de "ultimos 12 meses rolantes" para "todos os 12 meses do ano selecionado":

```typescript
// Faturamento do ano selecionado com comparativo do ano anterior
const yearlyComparisonData = useMemo(() => {
  const filialFiltered = filialId === 'todas' 
    ? rawData 
    : rawData.filter(r => normalizeFilialId(r.Filial) === filialId);

  // Gerar os 12 meses do ano selecionado
  const months = meses.map((mes, index) => ({
    month: index,
    label: mes,
  }));

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
    const currentKey = `${selectedYearForAnnual}-${m.month}`;
    const previousKey = `${selectedYearForAnnual - 1}-${m.month}`;
    
    return {
      mes: m.label,
      faturamento: Math.round(monthlyFaturamento[currentKey] || 0),
      faturamentoAnterior: Math.round(monthlyFaturamento[previousKey] || 0),
    };
  });
}, [rawData, filialId, selectedYearForAnnual]);
```

#### 3. Atualizar a UI da Aba Anual

Substituir o conteudo da aba "12meses" para incluir o seletor de ano:

```typescript
{/* Aba Anual - nome da aba mostra o ano selecionado */}
<TabsTrigger value="anual">{selectedYearForAnnual}</TabsTrigger>

<TabsContent value="anual" className="h-[300px]">
  {/* Seletor de Ano */}
  <div className="flex items-center gap-2 mb-4">
    <Select 
      value={String(selectedYearForAnnual)} 
      onValueChange={(v) => setSelectedYearForAnnual(parseInt(v))}
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
    <span className="text-sm text-muted-foreground">
      vs {selectedYearForAnnual - 1}
    </span>
  </div>
  
  {/* Grafico com altura ajustada */}
  <div className="h-[240px]">
    {/* BarChart com duas barras comparativas */}
  </div>
</TabsContent>
```

#### 4. Atualizar Verificacao de Dados

```typescript
// Atualizar de hasLast12MonthsData para hasYearlyData
const hasYearlyData = yearlyComparisonData.some(d => d.faturamento > 0 || d.faturamentoAnterior > 0);
```

---

## Estrutura Final das Abas

| Aba | Conteudo |
|-----|----------|
| **{Ano Selecionado}** | Seletor de ano + grafico de barras mensais comparando ano atual vs ano anterior |
| **{Mes/Ano}** | Seletores de mes/ano + grafico de barras diarias do mes selecionado |

---

## Resultado Visual Esperado

### Aba Anual (ex: "2025")
- Seletor compacto de ano no topo esquerdo
- Indicador textual "vs 2024" ao lado do seletor
- Eixo X: Jan, Fev, Mar, ... Dez
- Duas barras por mes: cinza (ano anterior) e colorida (ano selecionado)
- Tooltip mostrando ambos os valores

### Aba Mensal (ex: "Janeiro/2025")
- Seletores de mes e ano (sem alteracoes)
- Grafico de barras por dia do mes

---

## Resumo Tecnico

| Mudanca | Descricao |
|---------|-----------|
| Novo estado | `selectedYearForAnnual` para selecao do ano |
| Nova funcao | `yearlyComparisonData` substitui `last12MonthsData` |
| UI Aba Anual | Seletor de ano + label "vs {ano-1}" |
| Nome da aba | Muda de "Ultimos 12 Meses" para exibir o ano selecionado |

