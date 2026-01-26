
Contexto do problema (diagnóstico)
- Hoje a importação de Leads chama a função `fetch-sheets` apenas com a URL da planilha, sem indicar qual aba (mês) deve ser lida.
- Quando você exporta um Google Sheets como CSV, ele normalmente exporta somente 1 aba (geralmente a “primeira”/aba ativa), não “todas as abas”.
- Além disso, mesmo quando a importação grava no banco, a tela `/leads` carrega os registros só uma vez ao abrir a página; se você importar com a página já aberta, pode não atualizar automaticamente.

Objetivo
1) Permitir importar Leads por aba (mês) corretamente (cada mês é uma aba).
2) Permitir “Importar todas as abas de mês” em um clique.
3) Garantir que a página `/leads` reflita a importação imediatamente (sem precisar dar F5) e que o seletor de ano inclua anos existentes nos dados.

Escopo de alterações (arquivos)
- `supabase/functions/fetch-sheets/index.ts`
  - Melhorar suporte a seleção de aba:
    - Aceitar “nome da aba” (ex.: `LEADS JULHO`) e gerar URL de export por nome.
    - Continuar aceitando `gid` numérico (para compatibilidade), e também tentar extrair `gid` do próprio link quando o usuário colar um link com `#gid=...`.
- `src/components/dashboard/SystemSettingsDialog.tsx`
  - Evoluir UI do importador:
    - Modo “Uma aba” e modo “Todas as abas (meses)”.
    - Campo opcional para “prefixo do nome das abas” (default: `LEADS`) e/ou lista customizada de abas.
    - Progresso por aba + resumo final (quantos registros por aba, quais falharam).
- `src/pages/Leads.tsx`
  - Atualizar automaticamente após importação:
    - Escutar um evento simples disparado pelo importador e rodar `loadRecords()` de novo.
  - Melhorar filtro de ano:
    - Em vez de limitar a “ano atual ±2”, montar opções com base nos anos realmente presentes em `lead_records` (e incluir o ano atual também).

Detalhamento da solução

1) Backend function `fetch-sheets`: ler aba por nome (e/ou gid)
- Problema atual: o parâmetro `sheetName` está sendo usado como `gid`, mas na prática “gid” é um número e vocês trabalham com “nome da aba” (ex.: `LEADS JULHO`).
- Ajuste proposto (compatível):
  - Se receber `sheetName` e ele for numérico (ex.: `"123456789"`), continuar usando `export?format=csv&gid=...`.
  - Se receber `sheetName` e ele for texto (ex.: `"LEADS JULHO"`), usar o endpoint de export por nome de aba, por exemplo no formato CSV (mantendo host `docs.google.com` para continuar seguro).
  - Se o usuário colar um link que contém `#gid=...` e não passar `sheetName`, tentar extrair esse `gid` do link automaticamente.
- Resultado: conseguimos buscar uma aba específica por mês, sem depender de API keys.

2) SystemSettingsDialog: importar “todas as abas (meses)”
- UI/UX
  - Adicionar um seletor de modo:
    - “Importar uma aba (mês)”
    - “Importar todas as abas (meses)”
  - Quando “todas as abas” estiver ativo:
    - Opção de prefixo (default `LEADS`)
    - Opção de “usar meses em maiúsculo” (porque na sua planilha está `LEADS JULHO`, `LEADS AGOSTO`, etc.)
    - Opcional: campo “lista de abas” (caso existam nomes fora do padrão)
- Lógica
  - Construir uma lista de abas-alvo:
    - Padrão: `LEADS JANEIRO` ... `LEADS DEZEMBRO` (ou conforme o padrão escolhido)
  - Para cada aba:
    - Chamar `fetch-sheets` passando `{ sheetUrl, sheetName: "<NOME_DA_ABA>" }`
    - Processar as linhas como hoje (coluna `VENDEDOR` + colunas de datas `DD/MM/AAAA`)
    - Fazer upsert em lotes de 100
  - Mostrar progresso:
    - “Importando: LEADS JULHO (3/12) …”
    - No final, mostrar um resumo: importado por aba + abas que falharam (por exemplo, se um mês não existir no arquivo).
- Importante: manter o comportamento atual “Importar Planilha” para quem quiser importar somente uma aba.

3) Leads.tsx: refletir importação imediatamente
- Adicionar listener de evento (ex.: `lead_records_changed`) para chamar `loadRecords()` novamente.
- Ao finalizar a importação no SystemSettingsDialog, disparar esse evento.
- Ajustar `yearOptions`:
  - Derivar anos diretamente de `records` (anos existentes) + ano atual, ordenados.

Testes (passo a passo)
1) Na planilha, confirmar que cada aba tem:
   - Coluna `VENDEDOR`
   - Colunas de data no formato `DD/MM/AAAA` referentes àquele mês
2) No app:
   - Importar “uma aba” (ex.: `LEADS JULHO`) e confirmar que `/leads` atualiza sem F5.
   - Importar “todas as abas” e confirmar que aparecem contagens em múltiplos meses/anos.
3) Verificar no filtro da página `/leads`:
   - Se o banco tiver 2025/2026, eles devem aparecer nas opções.

Riscos e mitigação
- Abas com nomes diferentes do padrão:
  - Mitigação: permitir “lista customizada de abas” (separadas por vírgula/linha).
- Planilha muito grande:
  - Mitigação: manter lote de 100 no upsert e mostrar progresso.
- CSV com vírgulas/aspas (parsing simples):
  - Mitigação: manter como está (provavelmente suficiente para esse formato), e se aparecer erro real de parsing, evoluir o parser depois.

Resultado esperado
- Um clique importa todos os meses (abas) e cada registro cai no mês correto (pela data do cabeçalho).
- A tela `/leads` atualiza automaticamente após a importação.
- O filtro de ano não “esconde” anos importados.

Próximas melhorias possíveis (opcionais, depois)
- Botão “Apagar e reimportar” (limpar período selecionado antes de importar, para evitar lixo histórico).
- Mostrar “Prévia” antes de gravar (quantos registros por aba e por vendedor).
- Realtime em `/leads` para refletir qualquer edição/importação instantaneamente (sem evento manual).
