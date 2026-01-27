
# Cache Global de ERP: Admin Busca, Todos Visualizam

## Status: ✅ IMPLEMENTADO

## Resumo

Arquitetura de cache do ERP alterada para que:
1. ✅ **Apenas admins** possam buscar dados da API do ERP
2. ✅ **Todos os usuarios autenticados** possam visualizar o mesmo cache global
3. ✅ Dados duplicados eliminados (consolidado de 3 usuarios para cache único)

---

## Alteracoes Implementadas

### 1. Migracao de Banco de Dados ✅

- Removida constraint `user_id, year, month`
- Adicionada constraint `year, month` (cache único por mês)
- `user_id` agora é opcional (registra quem atualizou)
- RLS policies atualizadas:
  - SELECT: todos autenticados
  - INSERT/UPDATE/DELETE: apenas admin
- Dados duplicados limpos

### 2. useErpCache.ts ✅

- Queries de leitura sem filtro `user_id`
- Escrita verificada com `isAdmin`
- `clearAllCache` apenas para admin

### 3. SheetDataContext.tsx ✅

- Exposto `isAdmin` no contexto
- Auto-load de dados apenas para admin

### 4. Dashboard.tsx ✅

- Mensagem específica para não-admin sem dados
- Reload automático apenas para admin

---

## Fluxo de Dados

```text
+------------------+          +------------------+          +------------------+
|     Admin        |  busca   |    API ERP       |  salva   |   erp_cache      |
|   (isAdmin)      | -------> |                  | -------> | (tabela global)  |
+------------------+          +------------------+          +------------------+
                                                                    |
                                                                    | leitura
                                                                    v
                                                            +------------------+
                                                            |  Todos usuarios  |
                                                            |  (autenticados)  |
                                                            +------------------+
```

---

## Beneficios Alcancados

1. ✅ **Menos requisicoes a API do ERP** - dados buscados uma vez, usados por todos
2. ✅ **Consistencia** - todos veem os mesmos dados
3. ✅ **Menor uso de armazenamento** - eliminada duplicacao entre usuarios
4. ✅ **Seguranca** - apenas admin pode modificar dados de vendas
