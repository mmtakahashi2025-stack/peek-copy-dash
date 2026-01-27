
# Solucao Definitiva: Correcao do Backend para Importar Abas Corretamente

## Problema Confirmado

Atraves da pesquisa e analise dos logs, confirmei que:

1. **A planilha existe e tem abas de JULHO 2025 ate JANEIRO 2026** - estrutura correta
2. **O backend usa o endpoint errado**: `/export?format=csv&sheet=NOME_DA_ABA`
3. **Este endpoint do Google ignora o parametro `sheet=`** e sempre retorna a primeira aba
4. **Logs comprovam**: Requisicoes para "JULHO 2025" e "JANEIRO 2026" retornam dados identicos (01/07/2025)

## Solucao: Trocar o Endpoint do Google Sheets

O endpoint correto para buscar abas por nome e:
```
https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&sheet={NOME_DA_ABA}
```

Este endpoint e documentado pelo Google e respeita o parametro `sheet=`.

## Alteracoes

### Arquivo 1: `supabase/functions/fetch-sheets/index.ts`

**Mudanca principal (linha 253):**

ANTES:
```typescript
fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${sheetParam}`;
```

DEPOIS:
```typescript
// Quando sheetName é um nome de aba (não numerico), usar gviz/tq que funciona corretamente
if (sheetName && !isNumericGid(sheetName)) {
  fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
} else {
  // Para gid numerico ou sem aba especifica, manter export
  fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${sheetParam}`;
}
```

**Adicionar log de debug para verificar qual aba esta sendo retornada:**

```typescript
// Apos parsear os dados, logar primeira coluna para debug
const columns = data.length > 0 ? Object.keys(data[0]) : [];
console.log('Returned columns sample:', columns.slice(0, 5));
```

### Arquivo 2: `src/components/dashboard/LeadsImportSection.tsx`

**Melhorar validacao de regex para datas (linha 27):**

```typescript
// Aceitar DD/MM/YYYY ou D/M/YYYY (com ou sem zeros)
const isDateColumn = (col: string) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(col);
```

**Melhorar conversao de datas (linha 30):**

```typescript
const toISODate = (dateStr: string) => {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};
```

**Adicionar validacao de "aba errada" no handleImportAllTabs:**

```typescript
// Apos buscar dados, verificar se os dados correspondem ao mes/ano esperado
const validateTabData = (rows: Record<string, unknown>[], expectedMonth: number, expectedYear: number): boolean => {
  const columns = Object.keys(rows[0] || {});
  const dateColumn = columns.find(col => isDateColumn(col));
  if (!dateColumn) return true; // Nao conseguiu validar
  
  const [day, month, year] = dateColumn.split('/');
  return parseInt(month) === expectedMonth && parseInt(year) === expectedYear;
};
```

### Arquivo 3: `src/pages/Leads.tsx`

**Corrigir yearOptions para sempre incluir 2025 (linha 333):**

```typescript
const yearOptions = useMemo(() => {
  const currentYear = new Date().getFullYear();
  // Sempre incluir de 5 anos atras ate proximo ano
  const fixedRange = Array.from({ length: 7 }, (_, i) => currentYear - 5 + i);
  
  const yearsFromRecords = records.map(r => {
    const date = parseISO(r.record_date);
    return date.getFullYear();
  });
  
  // Combinar range fixo com anos dos registros
  const uniqueYears = [...new Set([...fixedRange, ...yearsFromRecords])];
  
  return uniqueYears.sort((a, b) => b - a);
}, [records]);
```

## Fluxo Apos Correcao

```text
Usuario seleciona: JULHO 2025 -> JANEIRO 2026
                        |
                        v
Frontend gera: ["JULHO 2025", "AGOSTO 2025", ..., "JANEIRO 2026"]
                        |
                        v
Para cada aba, Backend usa:
  /gviz/tq?tqx=out:csv&sheet=JULHO%202025
  /gviz/tq?tqx=out:csv&sheet=AGOSTO%202025
  ...
                        |
                        v
Google retorna dados CORRETOS de cada aba
                        |
                        v
Frontend processa e salva no banco
                        |
                        v
7 abas importadas com sucesso!
```

## Validacao

1. Apos implementar, testar chamando o backend com:
   - `sheetName="JULHO 2025"` -> deve retornar colunas `01/07/2025...`
   - `sheetName="AGOSTO 2025"` -> deve retornar colunas `01/08/2025...`
   - `sheetName="JANEIRO 2026"` -> deve retornar colunas `01/01/2026...`

2. Importar o periodo completo e verificar que o relatorio mostra 7 abas com dados diferentes

3. Verificar que 2025 aparece no seletor de anos da pagina /leads

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `fetch-sheets/index.ts` | Trocar `/export` por `/gviz/tq` quando sheetName e texto |
| `LeadsImportSection.tsx` | Regex flexivel para datas + validacao de aba |
| `Leads.tsx` | Range fixo de anos para sempre mostrar 2025 |
