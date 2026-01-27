
# Solucao Definitiva: Importacao de Leads Multi-Ano

## Problema Identificado

O sistema atual apresenta dois problemas:

1. **Valores iniciais errados**: Como estamos em Janeiro de 2026, os valores default sao:
   - `startYear = "2026"` (deveria ser 2025)
   - `endYear = "2027"` (deveria ser 2026)

2. **O usuario precisa importar JULHO 2025 ate JANEIRO 2026**, mas o sistema inicia com JULHO 2026 ate JANEIRO 2027.

3. **Potencial problema no Select**: Embora 2025 esteja em `YEAR_OPTIONS`, pode haver algum problema de renderizacao ou inicializacao.

## Solucao

### 1. Corrigir valores iniciais para o caso de uso real

Detectar automaticamente o periodo mais provavel baseado na data atual:
- Se estamos em Janeiro/Fevereiro, o periodo provavel comeca no ano anterior
- Setar `startYear = 2025` e `endYear = 2026` como default

### 2. Simplificar a interface de selecao de periodo

Em vez de depender de Selects separados para mes/ano, vou criar:
- Uma interface mais simples com campos numericos para input direto
- Validacao visual clara do periodo
- Preview em tempo real das abas que serao importadas

### 3. Ampliar range de anos

Estender `YEAR_OPTIONS` para incluir mais anos historicos:
- De `currentYear - 2` para `currentYear - 5`
- Isso garante que 2021-2031 estarao disponiveis

## Alteracoes no Arquivo

### `src/components/dashboard/LeadsImportSection.tsx`

```typescript
// Linha 48-49: Ampliar range de anos
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
// Resultado: [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]

// Linha 115-119: Corrigir valores iniciais
const currentMonth = new Date().getMonth() + 1; // 1-12

// Se estamos nos primeiros meses do ano, o periodo provavel comeca no ano anterior
const defaultStartYear = currentMonth <= 6 ? currentYear - 1 : currentYear;
const defaultEndYear = currentMonth <= 6 ? currentYear : currentYear + 1;

const [startMonth, setStartMonth] = useState('7'); // Julho
const [startYear, setStartYear] = useState(defaultStartYear.toString()); // 2025
const [endMonth, setEndMonth] = useState('1'); // Janeiro  
const [endYear, setEndYear] = useState(defaultEndYear.toString()); // 2026
```

### 4. Adicionar input numerico direto para anos

Alem do Select, permitir que o usuario digite diretamente o ano:

```typescript
<Input 
  type="number" 
  value={startYear}
  onChange={(e) => setStartYear(e.target.value)}
  min="2020"
  max="2030"
  className="w-20"
/>
```

### 5. Melhorar feedback visual

- Mostrar claramente quais abas serao importadas
- Destacar se o periodo parece invalido
- Mostrar alerta se nenhuma aba for encontrada

## Resultado Esperado

Ao abrir o importador em Janeiro 2026:
- Periodo Inicial: Julho 2025 (pre-selecionado)
- Periodo Final: Janeiro 2026 (pre-selecionado)
- Preview: "7 abas: JULHO 2025 -> JANEIRO 2026"

O usuario podera ajustar facilmente qualquer ano digitando ou selecionando.
