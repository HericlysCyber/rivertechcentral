River Tech Central V10.2 — Handshake corrigido

Base: V10.1.

Correção principal:
- A Central enviava o token no campo accessToken, enquanto o Cartazeamento esperava token.
- Agora a Central envia accessToken e token por compatibilidade.
- O Cartazeamento aceita accessToken (preferencial) ou token.
- A origem do postMessage é validada usando a origem do iframe/página pai quando disponível.
- config.js desta versão de teste aponta para http://127.0.0.1:5000.

Não houve nova migração SQL. O editor continua desativado: a revisão é somente visual e o PDF é gerado pelo mesmo motor do servidor.
