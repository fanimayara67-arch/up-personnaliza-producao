# MCP Produção UP

Transporte stdio usando `@modelcontextprotocol/sdk` fixado no lockfile. Sete ferramentas compartilham definições e serviços com o assistente e a API privada. Cada ferramenta recebe `jobId`; `configurar_chapa` também recebe os parâmetros estruturados. As demais operações usam o estado já salvo do trabalho.

Instale com `npm ci --prefix integrations/production-mcp`. Configure `PRODUCTION_URL`, `PRODUCTION_MCP_TOKEN` e o caminho absoluto de `index.mjs` no cliente MCP. Credenciais são emitidas pelo provisionamento administrativo e ficam somente no ambiente local. HTTPS é obrigatório fora do loopback. Veja [o guia completo](../../production/README.md).
