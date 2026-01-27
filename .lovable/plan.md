
# Plano: Melhorar Organização do Card de Evolução de Vendas

## Problema Atual

1. Os seletores de mês e ano não possuem labels visíveis, dificultando identificação
2. Layout das tabs e seletores pode ser mais organizado
3. Falta hierarquia visual clara entre controles e gráfico

---

## Mudanças Propostas

### 1. Adicionar Labels aos Seletores (Aba Mensal)

Transformar de:
```
[Janeiro ▼] [2026 ▼]
```

Para:
```
Mês [Janeiro ▼]   Ano [2026 ▼]
```

### 2. Adicionar Label ao Seletor (Aba Anual)

Transformar de:
```
[2026 ▼] vs 2025
```

Para:
```
Ano [2026 ▼] comparado com 2025
```

### 3. Reorganizar Layout do Header

- Mover seletores para a mesma linha das tabs (quando houver espaço)
- Usar separador visual entre tabs e seletores
- Melhorar espaçamento e alinhamento

---

## Estrutura Visual Proposta

```text
+--------------------------------------------------+
| Evolução de Vendas                               |
+--------------------------------------------------+
|  [Anual] [Mensal]          Mês [Jan▼]  Ano [26▼] |
|                                                  |
|  ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓  |
|  ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓  |
|  ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓  |
|  Jan   Fev   Mar   Abr   Mai   Jun   Jul   Ago  |
+--------------------------------------------------+
```

---

## Arquivo a Modificar

`src/components/dashboard/SalesEvolutionChart.tsx`

---

## Detalhes Tecnicos

### Aba "Mensal" (linhas 353-381)

```tsx
// ANTES
<div className="flex gap-2 mb-4">
  <Select ...>
    <SelectTrigger className="w-[140px] h-8">
      <SelectValue placeholder="Mês" />
    </SelectTrigger>
    ...
  </Select>
  <Select ...>
    <SelectTrigger className="w-[100px] h-8">
      <SelectValue placeholder="Ano" />
    </SelectTrigger>
    ...
  </Select>
</div>

// DEPOIS
<div className="flex items-center gap-4 mb-4">
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-muted-foreground">Mês</span>
    <Select ...>
      <SelectTrigger className="w-[140px] h-8">
        <SelectValue />
      </SelectTrigger>
      ...
    </Select>
  </div>
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-muted-foreground">Ano</span>
    <Select ...>
      <SelectTrigger className="w-[100px] h-8">
        <SelectValue />
      </SelectTrigger>
      ...
    </Select>
  </div>
</div>
```

### Aba "Anual" (linhas 272-296)

```tsx
// ANTES
<div className="flex flex-col gap-1 mb-4">
  <div className="flex items-center gap-2">
    <Select ...>
      <SelectTrigger className="w-[100px] h-8">
        <SelectValue placeholder="Ano" />
      </SelectTrigger>
      ...
    </Select>
    <span className="text-sm text-muted-foreground">
      {comparisonLabel}
    </span>
  </div>
  ...
</div>

// DEPOIS
<div className="flex flex-col gap-1 mb-4">
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Ano</span>
      <Select ...>
        <SelectTrigger className="w-[100px] h-8">
          <SelectValue />
        </SelectTrigger>
        ...
      </Select>
    </div>
    <span className="text-sm text-muted-foreground">
      comparado com {previousYear}
    </span>
  </div>
  ...
</div>
```

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Seletores sem contexto | Labels "Mês" e "Ano" visíveis |
| Layout disperso | Agrupamento visual claro |
| "vs 2025" pouco explicativo | "comparado com 2025" mais claro |

Os usuários saberão exatamente o que cada seletor controla, melhorando a usabilidade do gráfico.
