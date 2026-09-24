RIVER TECH CENTRAL V13 — INTEGRAÇÃO REAL DO RIVER MUSIC

Esta versão substitui o River Music provisório pelo River Music real enviado pelo usuário.

- Pesquisa real em Openverse, Wikimedia, Jamendo e ccMixter.
- Mantém reprodução, fonte, licença, classificação e download do projeto original.
- DOWNLOAD NÃO É BLOQUEADO por classificação. Para 🔴 ou ⚪ o sistema informa a situação e pede confirmação antes do download.
- Proteção: a API exige sessão Supabase válida + acesso do cliente + módulo River Music liberado.
- Botão “Voltar para a Central” no topo e no rodapé.
- Cartazeamento não foi alterado.

SERVIÇO
O arquivo RiverMusicServer/server.js serve a pasta Central e expõe:
  /api/status
  /api/rivermusic/status
  /api/rivermusic/pesquisar

Para teste local:
  cd RiverMusicServer
  npm install
  npm start

A Central está configurada para:
  riverMusicBackendUrl: http://127.0.0.1:3000

Em produção, altere essa URL para o endereço público do mesmo serviço.
