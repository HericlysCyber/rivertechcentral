RIVER TECH — CARTAZEAMENTO V10

Base: V9.1 (autenticação e integração preservadas).

Objetivo da V10:
- remover a edição manual de posição/tamanho dos elementos depois da geração;
- manter os tamanhos P, M, G, GG e XG;
- manter os modelos Clássico, Super Oferta, Moderno, Premium e Impacto;
- manter o motor Flask/ReportLab;
- fazer a tela Revisar ser somente visualização;
- usar o mesmo PDF gerado pelo servidor para a prévia e para o PDF final;
- corrigir o fluxo de Abrir para impressão para abrir a janela imediatamente e carregar o PDF depois.

IMPORTANTE:
- A V9.1 deve ser mantida como backup.
- O app.py e a autenticação da V9.1 foram preservados nesta versão.
- O editor antigo foi substituído por uma tela de revisão sem arrastar/redimensionar.
- As posições e tamanhos são definidos pelo motor ReportLab existente.
- Não é necessário executar nova migração do Supabase para esta alteração.

Teste local:
1. Entre na pasta Cartazeamento.
2. Configure o .env com SUPABASE_URL e SUPABASE_KEY.
3. Execute: python app.py
4. Central/config.js deve apontar cartazeamentoBackendUrl para http://127.0.0.1:5000.
5. Abra o Cartazeamento somente pela Central.


V10.1 — correção de autenticação
- O Cartazeamento agora aguarda o token enviado pela Central em vez de falhar imediatamente quando o iframe ainda não recebeu o token.
- A Central mantém o envio do token por vários ciclos durante o handshake.
- Isso evita a tela presa em 'Validando acesso' em carregamentos rápidos/primeiro acesso.
- Os avisos de Tracking Prevention do navegador sobre armazenamento do CDN do Supabase não são usados como mecanismo de autenticação do Cartazeamento.
