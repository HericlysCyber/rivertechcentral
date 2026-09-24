RIVER TECH CENTRAL V18 — REVISÃO DE SEGURANÇA

BASE: V17 Persistência.

O que esta versão faz:
- cria cliente_acesso_valido(), uma checagem sem efeitos colaterais usada pelo RLS;
- padroniza as políticas RLS das tabelas centrais;
- impede cliente expirado ou bloqueado de consultar/alterar dados de seus módulos;
- mantém administradores com gerenciamento completo via is_admin();
- reforça o isolamento por cliente;
- mantém Cartazeamento, Jornal e Chat Bot protegidos;
- atualiza automaticamente updated_at em dados persistidos.

IMPORTANTE:
1. Execute Central/MIGRACAO_V18_SEGURANCA.sql no SQL Editor do Supabase.
2. Não é necessário executar novamente as migrações anteriores se V17 já estiver aplicada.
3. Depois, teste o fluxo Admin -> Cliente -> módulos -> bloqueio -> renovação.
4. Não altere Rádio Indoor.

A V18 não conecta ainda o Dashboard a um sistema comercial real nem um provedor real de WhatsApp. Isso permanece para a etapa de integração externa.
