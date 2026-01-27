
# Plano: Importar Abas de Período Multi-Ano

## Problema Atual
A função `generateTabNames` gera apenas os 12 meses de um único ano selecionado (ex: JANEIRO 2025 até DEZEMBRO 2025). Sua planilha tem abas que cruzam anos:
- JULHO 2025, AGOSTO 2025, ..., DEZEMBRO 2025
- JANEIRO 2026

## Solução Proposta
Trocar a lógica de "selecionar um ano" para "selecionar mês/ano inicial e final", gerando automaticamente a lista de abas do intervalo.

## Alterações

### Arquivo: `src/components/dashboard/LeadsImportSection.tsx`

1. **Novos estados para período**
   - `startMonth` / `startYear`: Mês e ano inicial (ex: Julho 2025)
   - `endMonth` / `endYear`: Mês e ano final (ex: Janeiro 2026)

2. **Nova função `generateTabNamesForRange`**
   - Recebe: mês/ano inicial, mês/ano final, padrão de nomenclatura
   - Itera de mês/ano inicial até mês/ano final
   - Retorna: `["JULHO 2025", "AGOSTO 2025", ..., "DEZEMBRO 2025", "JANEIRO 2026"]`
   
   ```text
   Exemplo de lógica:
   startMonth=7, startYear=2025
   endMonth=1, endYear=2026
   
   Resultado:
   JULHO 2025 → AGOSTO 2025 → ... → DEZEMBRO 2025 → JANEIRO 2026
   ```

3. **Atualização da UI**
   - Quando padrão "MÊS ANO" estiver selecionado:
     - Seção "Período inicial": Seletor de mês + seletor de ano
     - Seção "Período final": Seletor de mês + seletor de ano
   - Prévia das abas que serão importadas (ex: "7 abas: JULHO 2025 até JANEIRO 2026")

4. **Validação**
   - Garantir que data final não seja anterior à data inicial
   - Mostrar erro amigável se o período for inválido

5. **Atualização do `handleImportAllTabs`**
   - Usar `generateTabNamesForRange` em vez de `generateTabNames`

## Fluxo Visual

```text
┌─────────────────────────────────────────────────┐
│  Formato: MÊS ANO (ex: JULHO 2025)              │
├─────────────────────────────────────────────────┤
│  Período Inicial         Período Final          │
│  ┌─────────┬──────┐     ┌─────────┬──────┐     │
│  │ Julho ▼ │ 2025 │     │ Janeiro │ 2026 │     │
│  └─────────┴──────┘     └─────────┴──────┘     │
├─────────────────────────────────────────────────┤
│  📋 7 abas serão importadas:                    │
│  JULHO 2025 → JANEIRO 2026                      │
└─────────────────────────────────────────────────┘
```

## Detalhes Técnicos

A nova função de geração:

```typescript
const generateTabNamesForRange = (
  startMonth: number, // 1-12
  startYear: number,
  endMonth: number,   // 1-12
  endYear: number,
  pattern: TabPattern,
  prefix: string
): string[] => {
  const tabs: string[] = [];
  let currentMonth = startMonth;
  let currentYear = startYear;
  
  while (
    currentYear < endYear || 
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const monthName = MONTHS_PT[currentMonth - 1];
    
    if (pattern === 'month-year') {
      tabs.push(`${monthName} ${currentYear}`);
    } else {
      tabs.push(`${prefix} ${monthName}`);
    }
    
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }
  
  return tabs;
};
```

## Resultado Esperado
- Usuário seleciona: Julho 2025 até Janeiro 2026
- Sistema gera: `["JULHO 2025", "AGOSTO 2025", "SETEMBRO 2025", "OUTUBRO 2025", "NOVEMBRO 2025", "DEZEMBRO 2025", "JANEIRO 2026"]`
- Importa todas as 7 abas corretamente
