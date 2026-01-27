

# Plano: Limpar Cache e Recarregar Dados ERP (Jan/2023 - Jan/2026)

## Estado Atual do Banco

| Tabela | Registros | Periodo |
|--------|-----------|---------|
| erp_cache | 37 meses | Jan/2023 - Jan/2026 |
| erp_monthly_aggregates | 0 | (vazia) |
| erp_consolidated_cache | 1 | - |

**Total de registros de vendas no cache:** 199.764

---

## Acoes a Executar

### Passo 1: Limpar Todas as Tabelas de Cache

Executar DELETE em:
- `erp_cache` (dados brutos mensais)
- `erp_monthly_aggregates` (agregados - ja vazia)
- `erp_consolidated_cache` (metadados)

### Passo 2: Recarregar Dados do ERP

Chamar a edge function `fetch-erp-data` para cada mes do periodo:
- **Inicio:** Janeiro 2023
- **Fim:** Janeiro 2026
- **Total:** 37 meses

O sistema ira:
1. Buscar dados mes a mes do ERP
2. Salvar no `erp_cache`
3. Calcular e salvar agregados em `erp_monthly_aggregates` (nova funcionalidade)

---

## Tempo Estimado

- Limpeza: Instantaneo
- Recarga: ~5-10 minutos (depende da velocidade do ERP, processamento sequencial)

---

## Resultado Esperado

- Cache limpo e recarregado com dados frescos
- Tabela `erp_monthly_aggregates` populada automaticamente
- Grafico de Evolucao de Vendas funcionando com dados agregados (muito mais rapido)

