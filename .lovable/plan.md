

# Plano: Adicionar Botão de Recálculo de Agregados na Interface Admin

## Situação Atual

A edge function `recalculate-aggregates` está pronta e funcional, mas requer autenticação de admin. Para executá-la, precisamos de um botão na interface que faça a chamada autenticada.

## Solução

Adicionar um botão no painel de configurações do sistema (SystemSettingsDialog) que permite ao administrador disparar o recálculo de todos os agregados históricos.

---

## Arquivos a Modificar

### `src/components/dashboard/SystemSettingsDialog.tsx`

Adicionar uma nova seção "Manutenção de Dados" com:

1. **Botão "Recalcular Agregados"** - Dispara a edge function com `forceAll: true`
2. **Indicador de progresso** - Mostra que o processo está em andamento
3. **Feedback de resultado** - Exibe quantos meses foram processados

---

## Interface Proposta

```
╔══════════════════════════════════════════════════════╗
║  Configurações do Sistema                            ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  [Seções existentes de credenciais ERP...]           ║
║                                                      ║
╟──────────────────────────────────────────────────────╢
║  🔧 Manutenção de Dados                              ║
║                                                      ║
║  Recalcular todos os agregados de performance.       ║
║  Útil após importação de dados ou correção de bugs.  ║
║                                                      ║
║  [  🔄 Recalcular Agregados Históricos  ]            ║
║                                                      ║
║  Status: ⏳ Processando 37 meses...                  ║
║          ✅ Concluído: 1.200 diários, 370 rankings   ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

---

## Código da Chamada

```typescript
const handleRecalculateAggregates = async () => {
  setIsRecalculating(true);
  setRecalculateStatus('Iniciando recálculo...');
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada');
    }

    const response = await supabase.functions.invoke('recalculate-aggregates', {
      body: { forceAll: true },
    });

    if (response.error) {
      throw response.error;
    }

    const result = response.data;
    setRecalculateStatus(
      `✅ Concluído: ${result.processed} meses, ${result.dailyAggregates} agregados diários, ${result.rankingEntries} rankings`
    );
    toast.success('Agregados recalculados com sucesso!');
  } catch (error) {
    setRecalculateStatus(`❌ Erro: ${error.message}`);
    toast.error('Erro ao recalcular agregados');
  } finally {
    setIsRecalculating(false);
  }
};
```

---

## Fluxo de Uso

1. Admin abre Configurações do Sistema (ícone de engrenagem)
2. Rola até seção "Manutenção de Dados"
3. Clica em "Recalcular Agregados Históricos"
4. Aguarda processamento (~30-60 segundos para 37 meses)
5. Vê confirmação de sucesso com estatísticas

---

## Considerações Técnicas

- A edge function processa os 37 meses sequencialmente
- Tempo estimado: ~1-2 segundos por mês = 30-60 segundos total
- O usuário deve permanecer na página durante o processo
- Erros parciais são reportados no resultado final

