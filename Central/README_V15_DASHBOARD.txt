RIVER TECH CENTRAL — V15 DASHBOARD

Base: V14 Jornal de Ofertas.

Melhorias do Dashboard:
- painel gerencial responsivo;
- KPIs de faturamento, vendas, ticket médio e clientes;
- meta de faturamento e crescimento;
- gráfico de vendas por período;
- ranking de produtos;
- participação por categoria;
- filtro de período;
- modo demonstração;
- modo API JSON para futura integração;
- botão voltar para a Central e saída;
- proteção pelo módulo/dashboard já existente.

Contrato simples para a API JSON:
{
  "faturamento": 48250,
  "vendas": 1284,
  "ticket": 37.58,
  "clientes": 326,
  "crescimento": 8.4,
  "meta": 60000,
  "serie": [3200,4100,3600,4550],
  "produtos": [["Produto A",218],["Produto B",187]],
  "categorias": [["Mercearia",42],["Bebidas",24]]
}

O modo API é preparatório. O endpoint real e o mapeamento dos dados serão definidos quando o sistema comercial do cliente for escolhido/conectado.
Não altera Cartazeamento, Rádio Indoor, River Music ou Jornal de Ofertas.
