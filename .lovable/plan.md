
# Plano: Rankings Sincronizados com Filtro Global de Periodo

## Problema Atual

Os rankings buscam dados da tabela `erp_ranking_cache` que armazena rankings **por mes completo**. Quando o usuario seleciona um periodo especifico (ex: 01-27/Jan), os rankings mostram dados do mes inteiro, nao do periodo selecionado.

## Solucao

Calcular os rankings diretamente do `rawData` que ja esta filtrado pelo periodo global. Isso elimina a dependencia do cache mensal e garante consistencia com os KPIs.

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `RankingCard.tsx` | Calcular ranking de colaboradores a partir do rawData |
| `ProductRankingCard.tsx` | Calcular ranking de produtos a partir do rawData |
| `Dashboard.tsx` | Remover props year/month, manter apenas rawData e filialId |

---

## Implementacao

### 1. RankingCard.tsx - Ranking de Colaboradores

**Nova interface:**
```typescript
interface RankingCardProps {
  rawData?: RawSaleRow[];
  filialId?: string;
}
```

**Nova logica de calculo:**
```typescript
const colaboradores = useMemo(() => {
  if (!rawData || rawData.length === 0) return [];
  
  // Filtrar por filial se necessario
  let filteredData = rawData.filter(r => r.Tipo !== 'PC');
  if (filialId && filialId !== 'todas') {
    filteredData = filteredData.filter(r => 
      normalizeFilial(r.Filial) === filialId
    );
  }
  
  // Agrupar por colaborador
  const colaboradorMap = new Map<string, { faturamento: number; vendas: Set<number> }>();
  
  filteredData.forEach(r => {
    const nome = r.Emissor || 'Desconhecido';
    const current = colaboradorMap.get(nome) || { faturamento: 0, vendas: new Set() };
    current.faturamento += r.Liquido || 0;
    if (r['Venda #']) current.vendas.add(r['Venda #']);
    colaboradorMap.set(nome, current);
  });
  
  // Converter para array e ordenar por faturamento
  return Array.from(colaboradorMap.entries())
    .map(([nome, data], index) => ({
      nome,
      iniciais: getInitials(nome),
      vendas: data.vendas.size,
      faturamento: data.faturamento,
      faturamentoFormatado: formatCurrency(data.faturamento),
      conversao: '--',
      cor: colors[index % colors.length],
    }))
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 10);
}, [rawData, filialId]);
```

### 2. ProductRankingCard.tsx - Ranking de Produtos

**Nova interface:**
```typescript
interface ProductRankingCardProps {
  rawData?: RawSaleRow[];
  filialId?: string;
}
```

**Nova logica de calculo:**
```typescript
const produtos = useMemo(() => {
  if (!rawData || rawData.length === 0) return [];
  
  // Filtrar por filial e excluir PC
  let filteredData = rawData.filter(r => r.Tipo !== 'PC');
  if (filialId && filialId !== 'todas') {
    filteredData = filteredData.filter(r => 
      normalizeFilial(r.Filial) === filialId
    );
  }
  
  // Agrupar por produto
  const produtoMap = new Map<string, number>();
  
  filteredData.forEach(r => {
    const nome = r.Item || 'Desconhecido';
    produtoMap.set(nome, (produtoMap.get(nome) || 0) + (r.Quantidade || 1));
  });
  
  // Converter para array e ordenar por quantidade
  return Array.from(produtoMap.entries())
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);
}, [rawData, filialId]);
```

### 3. Dashboard.tsx - Atualizar Props

**Mudanca:**
```typescript
// ANTES
<RankingCard 
  year={filters.dateFrom?.getFullYear() ?? new Date().getFullYear()} 
  month={(filters.dateFrom?.getMonth() ?? new Date().getMonth() - 1) + 1} 
  filialId={filters.filial}
  rawData={rawData}
/>

// DEPOIS
<RankingCard 
  rawData={rawData}
  filialId={filters.filial}
/>
```

---

## Helpers Necessarios

Adicionar nos componentes (ou em utils):

```typescript
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`;
  return `R$ ${value.toFixed(2)}`;
}

function normalizeFilial(filial: string): string {
  return filial?.toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '') || 'todas';
}
```

---

## Vantagens da Solucao

| Aspecto | Antes (Cache) | Depois (rawData) |
|---------|---------------|------------------|
| Precisao do periodo | Mes completo | Periodo exato |
| Chamadas de API | 2 queries extras | Zero (usa dados em memoria) |
| Consistencia | Diferente dos KPIs | Igual aos KPIs |
| Performance | Rapido (cache) | Rapido (useMemo) |

---

## Execucao

| Etapa | Arquivo | Operacao |
|-------|---------|----------|
| 1 | RankingCard.tsx | 1 edit - calcular do rawData |
| 2 | ProductRankingCard.tsx | 1 edit - calcular do rawData |
| 3 | Dashboard.tsx | 1 edit - remover year/month |

**Total: 3 operacoes**

---

## Resultado Esperado

- Rankings mostram dados do **periodo exato** selecionado no filtro global
- Tooltips (Top 3) continuam funcionando usando o mesmo rawData
- Consistencia total entre KPIs, Grafico e Rankings
- Zero chamadas de API adicionais para rankings
