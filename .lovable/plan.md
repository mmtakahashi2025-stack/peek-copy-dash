
# Plano: Separar Modo de Visualizacao (ANO/MES) dos Seletores de Periodo

## Entendimento do Problema

Atualmente as tabs mostram "ANO 2026" e "MES Janeiro/2026", misturando o modo de visualizacao com o periodo selecionado.

O usuario quer:
1. Tabs simples: **[ANO]** e **[MES]** - apenas para escolher o modo de visualizacao
2. Seletores separados abaixo para escolher o periodo especifico

---

## Estrutura Visual Proposta

```text
+--------------------------------------------------+
| Evolucao de Vendas                               |
+--------------------------------------------------+
|  [ANO] [MES]                                     |
|                                                  |
|  (Se ANO selecionado)                            |
|  Ano [2026 v]  comparado com 2025                |
|                                                  |
|  (Se MES selecionado)                            |
|  Mes [Janeiro v]   Ano [2026 v]                  |
|                                                  |
|  [========= GRAFICO =========]                   |
+--------------------------------------------------+
```

---

## Arquivo a Modificar

`src/components/dashboard/SalesEvolutionChart.tsx`

---

## Mudancas Necessarias

### 1. Simplificar as Tabs (linhas 265-268)

```tsx
// ANTES
<TabsList className="mb-4">
  <TabsTrigger value="anual">ANO {selectedYearForAnnual}</TabsTrigger>
  <TabsTrigger value="mensal">MES {mesesCompletos[selectedMonth]}/{selectedYear}</TabsTrigger>
</TabsList>

// DEPOIS
<TabsList className="mb-4">
  <TabsTrigger value="anual">ANO</TabsTrigger>
  <TabsTrigger value="mensal">MES</TabsTrigger>
</TabsList>
```

### 2. Manter Seletores Dentro do TabsContent

Os seletores de periodo ja estao corretamente posicionados dentro de cada `TabsContent`:

- **Aba ANO**: Seletor de ano + texto "comparado com [ano anterior]"
- **Aba MES**: Seletores de mes e ano

Nenhuma mudanca adicional necessaria nos seletores.

---

## Resultado Esperado

| Elemento | Antes | Depois |
|----------|-------|--------|
| Tab Anual | "ANO 2026" | "ANO" |
| Tab Mensal | "MES Janeiro/2026" | "MES" |
| Seletores | Mantidos | Mantidos |

O usuario primeiro escolhe se quer ver evolucao por ANO ou por MES, e depois seleciona o periodo especifico nos controles abaixo.
