-- River Tech Central V11 — módulos internos
update public.modulos set nome='Jornal de Ofertas', descricao='Crie encartes promocionais com cabeçalho, produtos, imagens e preços para impressão ou PDF.', icone='📰', url='jornal.html', modo_acesso='interno', ativo=true, ordem=3 where slug='jornal';
update public.modulos set nome='Dashboard', descricao='Painel de indicadores para integrar dados de vendas, clientes e operação.', icone='📊', url='dashboard.html', modo_acesso='interno', ativo=true, ordem=4 where slug='dashboard';
update public.modulos set nome='Chat Bot', descricao='Configure o primeiro atendimento e automações para WhatsApp e outros canais.', icone='🤖', url='chatbot.html', modo_acesso='interno', ativo=true, ordem=6 where slug='chat-bot';
update public.modulos set nome='River Music', descricao='Pesquisa, biblioteca e verificação de permissão para uso comercial de músicas.', icone='🎵', url='rivermusic.html', modo_acesso='interno', ativo=true, ordem=5 where slug='river-music';
-- Rádio e Cartazeamento não são alterados por esta migração.
