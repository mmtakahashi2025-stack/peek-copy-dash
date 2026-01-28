

# Plano: Corrigir Dados de Lucro na Visualizacao Mensal

## Problema Identificado

A coluna `total_lucro` foi adicionada na tabela `erp_daily_aggregates`, porem os valores estao zerados porque os agregados nao foram recalculados apos a migracao.

### Evidencia

| Fonte | Faturamento | Lucro |
|-------|-------------|-------|
| `erp_cache` (dados brutos) | R$ 1.427.196 | R$ 412.646 |
| `erp_daily_aggregates` | R$ 1.380.611 | **R$ 0** |

Os dados de lucro existem no cache original, mas nao foram propagados para a tabela de agregados diarios.

---

## Solucao

### Opcao 1: Executar Recalculo via Interface (Recomendado)

Voce pode recalcular os agregados pelo dashboard:

1. Acesse **Configuracoes do Sistema** (icone de engrenagem)
2. Localize a secao de **Manutencao**
3. Clique em **Recalcular Agregados**
4. Aguarde a conclusao (pode levar alguns minutos dependendo do volume de dados)

### Opcao 2: Recalculo via API

Executar manualmente:
```
POST /functions/v1/recalculate-aggregates
Body: { "forceAll": true }
```

Isso ira:
- Recalcular todos os agregados mensais (`erp_monthly_aggregates`)
- Recalcular todos os agregados diarios (`erp_daily_aggregates`) incluindo a nova coluna `total_lucro`

---

## Resultado Esperado

Apos o recalculo, a tabela `erp_daily_aggregates` tera valores corretos:

| date | faturamento | total_lucro |
|------|-------------|-------------|
| 2026-01-01 | 23.375,93 | ~6.500* |
| 2026-01-02 | 68.040,85 | ~19.000* |
| ... | ... | ... |

*Valores proporcionais ao faturamento do dia

O grafico mensal com toggle LUCRO passara a mostrar os dados corretamente.

---

## Acao Necessaria

**Nenhuma alteracao de codigo e necessaria.** Basta executar o recalculo dos agregados para popular a coluna `total_lucro` com os valores corretos.

Deseja que eu execute o recalculo agora?

