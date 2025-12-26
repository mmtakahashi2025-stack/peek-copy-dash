// Dados de evolução mensal para o gráfico
export const evolucaoMensalData = [
  { mes: 'Jan', vendas: 280, faturamento: 982400, leads: 980 },
  { mes: 'Fev', vendas: 295, faturamento: 1034860, leads: 1020 },
  { mes: 'Mar', vendas: 310, faturamento: 1087480, leads: 1080 },
  { mes: 'Abr', vendas: 285, faturamento: 999780, leads: 990 },
  { mes: 'Mai', vendas: 320, faturamento: 1122560, leads: 1120 },
  { mes: 'Jun', vendas: 335, faturamento: 1175180, leads: 1180 },
  { mes: 'Jul', vendas: 342, faturamento: 1199736, leads: 1247 },
  { mes: 'Ago', vendas: 355, faturamento: 1245340, leads: 1290 },
  { mes: 'Set', vendas: 368, faturamento: 1290944, leads: 1340 },
  { mes: 'Out', vendas: 380, faturamento: 1333040, leads: 1390 },
  { mes: 'Nov', vendas: 395, faturamento: 1385660, leads: 1450 },
  { mes: 'Dez', vendas: 410, faturamento: 1438280, leads: 1520 },
];

interface KpiItem {
  id: string;
  title: string;
  value: string;
  meta?: string;
  previousValue?: string;
  variation: number;
  isPositive: boolean;
}

// KPIs por filial
export const kpisPorFilial: Record<string, KpiItem[]> = {
  todas: [
    { id: 'padrao-exc', title: 'Padrão Exc. %', value: '94.2%', meta: '90%', variation: 4.7, isPositive: true },
    { id: 'leads', title: 'Leads', value: '1.247', previousValue: '1.180', variation: 5.7, isPositive: true },
    { id: 'vendas', title: 'Vendas', value: '342', previousValue: '318', variation: 7.5, isPositive: true },
    { id: 'conversao', title: 'Conversão', value: '27.4%', previousValue: '26.9%', variation: 1.9, isPositive: true },
    { id: 'faturamento', title: 'Faturamento', value: 'R$ 1.2M', previousValue: 'R$ 1.08M', variation: 11.1, isPositive: true },
    { id: 'ticket-medio', title: 'Ticket Médio', value: 'R$ 3.508', previousValue: 'R$ 3.396', variation: 3.3, isPositive: true },
    { id: 'pa', title: 'P.A', value: '2.8', previousValue: '2.6', variation: 7.7, isPositive: true },
    { id: 'lucro', title: 'Lucro %', value: '18.5%', previousValue: '17.2%', variation: 7.6, isPositive: true },
  ],
  centro: [
    { id: 'padrao-exc', title: 'Padrão Exc. %', value: '96.1%', meta: '90%', variation: 6.8, isPositive: true },
    { id: 'leads', title: 'Leads', value: '412', previousValue: '385', variation: 7.0, isPositive: true },
    { id: 'vendas', title: 'Vendas', value: '118', previousValue: '108', variation: 9.3, isPositive: true },
    { id: 'conversao', title: 'Conversão', value: '28.6%', previousValue: '28.1%', variation: 1.8, isPositive: true },
    { id: 'faturamento', title: 'Faturamento', value: 'R$ 420K', previousValue: 'R$ 378K', variation: 11.1, isPositive: true },
    { id: 'ticket-medio', title: 'Ticket Médio', value: 'R$ 3.559', previousValue: 'R$ 3.500', variation: 1.7, isPositive: true },
    { id: 'pa', title: 'P.A', value: '3.1', previousValue: '2.9', variation: 6.9, isPositive: true },
    { id: 'lucro', title: 'Lucro %', value: '19.8%', previousValue: '18.5%', variation: 7.0, isPositive: true },
  ],
  'zona-sul': [
    { id: 'padrao-exc', title: 'Padrão Exc. %', value: '93.5%', meta: '90%', variation: 3.9, isPositive: true },
    { id: 'leads', title: 'Leads', value: '328', previousValue: '312', variation: 5.1, isPositive: true },
    { id: 'vendas', title: 'Vendas', value: '89', previousValue: '85', variation: 4.7, isPositive: true },
    { id: 'conversao', title: 'Conversão', value: '27.1%', previousValue: '27.2%', variation: -0.4, isPositive: false },
    { id: 'faturamento', title: 'Faturamento', value: 'R$ 310K', previousValue: 'R$ 285K', variation: 8.8, isPositive: true },
    { id: 'ticket-medio', title: 'Ticket Médio', value: 'R$ 3.483', previousValue: 'R$ 3.353', variation: 3.9, isPositive: true },
    { id: 'pa', title: 'P.A', value: '2.7', previousValue: '2.5', variation: 8.0, isPositive: true },
    { id: 'lucro', title: 'Lucro %', value: '17.9%', previousValue: '16.8%', variation: 6.5, isPositive: true },
  ],
  'zona-norte': [
    { id: 'padrao-exc', title: 'Padrão Exc. %', value: '92.8%', meta: '90%', variation: 3.1, isPositive: true },
    { id: 'leads', title: 'Leads', value: '285', previousValue: '275', variation: 3.6, isPositive: true },
    { id: 'vendas', title: 'Vendas', value: '76', previousValue: '72', variation: 5.6, isPositive: true },
    { id: 'conversao', title: 'Conversão', value: '26.7%', previousValue: '26.2%', variation: 1.9, isPositive: true },
    { id: 'faturamento', title: 'Faturamento', value: 'R$ 265K', previousValue: 'R$ 242K', variation: 9.5, isPositive: true },
    { id: 'ticket-medio', title: 'Ticket Médio', value: 'R$ 3.487', previousValue: 'R$ 3.361', variation: 3.7, isPositive: true },
    { id: 'pa', title: 'P.A', value: '2.6', previousValue: '2.5', variation: 4.0, isPositive: true },
    { id: 'lucro', title: 'Lucro %', value: '17.2%', previousValue: '16.1%', variation: 6.8, isPositive: true },
  ],
  'zona-oeste': [
    { id: 'padrao-exc', title: 'Padrão Exc. %', value: '94.8%', meta: '90%', variation: 5.3, isPositive: true },
    { id: 'leads', title: 'Leads', value: '222', previousValue: '208', variation: 6.7, isPositive: true },
    { id: 'vendas', title: 'Vendas', value: '59', previousValue: '53', variation: 11.3, isPositive: true },
    { id: 'conversao', title: 'Conversão', value: '26.6%', previousValue: '25.5%', variation: 4.3, isPositive: true },
    { id: 'faturamento', title: 'Faturamento', value: 'R$ 205K', previousValue: 'R$ 175K', variation: 17.1, isPositive: true },
    { id: 'ticket-medio', title: 'Ticket Médio', value: 'R$ 3.475', previousValue: 'R$ 3.302', variation: 5.2, isPositive: true },
    { id: 'pa', title: 'P.A', value: '2.9', previousValue: '2.6', variation: 11.5, isPositive: true },
    { id: 'lucro', title: 'Lucro %', value: '18.9%', previousValue: '17.4%', variation: 8.6, isPositive: true },
  ],
};

// Colaboradores por filial
export const colaboradoresPorFilial: Record<string, typeof colaboradoresData> = {
  todas: [
    { id: 1, nome: 'Ana Silva', iniciais: 'AS', vendas: 48, conversao: '32.4%', faturamento: 'R$ 168.384', cor: 'bg-primary', filial: 'centro' },
    { id: 2, nome: 'Carlos Santos', iniciais: 'CS', vendas: 42, conversao: '29.8%', faturamento: 'R$ 147.336', cor: 'bg-success', filial: 'zona-sul' },
    { id: 3, nome: 'Mariana Costa', iniciais: 'MC', vendas: 38, conversao: '28.1%', faturamento: 'R$ 133.304', cor: 'bg-warning', filial: 'centro' },
    { id: 4, nome: 'Pedro Oliveira', iniciais: 'PO', vendas: 35, conversao: '26.5%', faturamento: 'R$ 122.780', cor: 'bg-chart-4', filial: 'zona-norte' },
    { id: 5, nome: 'Juliana Mendes', iniciais: 'JM', vendas: 33, conversao: '25.2%', faturamento: 'R$ 115.764', cor: 'bg-chart-5', filial: 'zona-oeste' },
    { id: 6, nome: 'Rafael Lima', iniciais: 'RL', vendas: 31, conversao: '24.8%', faturamento: 'R$ 108.748', cor: 'bg-primary/80', filial: 'zona-sul' },
    { id: 7, nome: 'Fernanda Rocha', iniciais: 'FR', vendas: 29, conversao: '23.9%', faturamento: 'R$ 101.732', cor: 'bg-success/80', filial: 'zona-norte' },
    { id: 8, nome: 'Lucas Almeida', iniciais: 'LA', vendas: 28, conversao: '23.1%', faturamento: 'R$ 98.224', cor: 'bg-warning/80', filial: 'zona-oeste' },
  ],
  centro: [
    { id: 1, nome: 'Ana Silva', iniciais: 'AS', vendas: 48, conversao: '32.4%', faturamento: 'R$ 168.384', cor: 'bg-primary', filial: 'centro' },
    { id: 3, nome: 'Mariana Costa', iniciais: 'MC', vendas: 38, conversao: '28.1%', faturamento: 'R$ 133.304', cor: 'bg-warning', filial: 'centro' },
  ],
  'zona-sul': [
    { id: 2, nome: 'Carlos Santos', iniciais: 'CS', vendas: 42, conversao: '29.8%', faturamento: 'R$ 147.336', cor: 'bg-success', filial: 'zona-sul' },
    { id: 6, nome: 'Rafael Lima', iniciais: 'RL', vendas: 31, conversao: '24.8%', faturamento: 'R$ 108.748', cor: 'bg-primary/80', filial: 'zona-sul' },
  ],
  'zona-norte': [
    { id: 4, nome: 'Pedro Oliveira', iniciais: 'PO', vendas: 35, conversao: '26.5%', faturamento: 'R$ 122.780', cor: 'bg-chart-4', filial: 'zona-norte' },
    { id: 7, nome: 'Fernanda Rocha', iniciais: 'FR', vendas: 29, conversao: '23.9%', faturamento: 'R$ 101.732', cor: 'bg-success/80', filial: 'zona-norte' },
  ],
  'zona-oeste': [
    { id: 5, nome: 'Juliana Mendes', iniciais: 'JM', vendas: 33, conversao: '25.2%', faturamento: 'R$ 115.764', cor: 'bg-chart-5', filial: 'zona-oeste' },
    { id: 8, nome: 'Lucas Almeida', iniciais: 'LA', vendas: 28, conversao: '23.1%', faturamento: 'R$ 98.224', cor: 'bg-warning/80', filial: 'zona-oeste' },
  ],
};

// Dados de comparação de períodos
export const comparacaoPeriodos = {
  atual: {
    label: 'Período Atual',
    vendas: 342,
    faturamento: 1199736,
    leads: 1247,
    conversao: 27.4,
  },
  anterior: {
    label: 'Período Anterior',
    vendas: 318,
    faturamento: 1080000,
    leads: 1180,
    conversao: 26.9,
  },
};

// Mantendo exports originais para compatibilidade
export const kpisData = kpisPorFilial.todas;

export const colaboradoresData = [
  { id: 1, nome: 'Ana Silva', iniciais: 'AS', vendas: 48, conversao: '32.4%', faturamento: 'R$ 168.384', cor: 'bg-primary', filial: 'centro' },
  { id: 2, nome: 'Carlos Santos', iniciais: 'CS', vendas: 42, conversao: '29.8%', faturamento: 'R$ 147.336', cor: 'bg-success', filial: 'zona-sul' },
  { id: 3, nome: 'Mariana Costa', iniciais: 'MC', vendas: 38, conversao: '28.1%', faturamento: 'R$ 133.304', cor: 'bg-warning', filial: 'centro' },
  { id: 4, nome: 'Pedro Oliveira', iniciais: 'PO', vendas: 35, conversao: '26.5%', faturamento: 'R$ 122.780', cor: 'bg-chart-4', filial: 'zona-norte' },
  { id: 5, nome: 'Juliana Mendes', iniciais: 'JM', vendas: 33, conversao: '25.2%', faturamento: 'R$ 115.764', cor: 'bg-chart-5', filial: 'zona-oeste' },
  { id: 6, nome: 'Rafael Lima', iniciais: 'RL', vendas: 31, conversao: '24.8%', faturamento: 'R$ 108.748', cor: 'bg-primary/80', filial: 'zona-sul' },
  { id: 7, nome: 'Fernanda Rocha', iniciais: 'FR', vendas: 29, conversao: '23.9%', faturamento: 'R$ 101.732', cor: 'bg-success/80', filial: 'zona-norte' },
  { id: 8, nome: 'Lucas Almeida', iniciais: 'LA', vendas: 28, conversao: '23.1%', faturamento: 'R$ 98.224', cor: 'bg-warning/80', filial: 'zona-oeste' },
];

export const filiaisData = [
  { id: 'todas', nome: 'Todas as Filiais' },
  { id: 'centro', nome: 'Centro' },
  { id: 'zona-sul', nome: 'Zona Sul' },
  { id: 'zona-norte', nome: 'Zona Norte' },
  { id: 'zona-oeste', nome: 'Zona Oeste' },
];

// Função helper para obter KPIs filtrados
export const getFilteredKpis = (filialId: string) => {
  return kpisPorFilial[filialId] || kpisPorFilial.todas;
};

// Função helper para obter colaboradores filtrados
export const getFilteredColaboradores = (filialId: string, colaboradorId?: string) => {
  const colaboradores = colaboradoresPorFilial[filialId] || colaboradoresPorFilial.todas;
  
  if (colaboradorId && colaboradorId !== 'todos') {
    return colaboradores.filter(c => c.id.toString() === colaboradorId);
  }
  
  return colaboradores;
};
