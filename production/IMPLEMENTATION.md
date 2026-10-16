# Produção UP — implementação

Direção final (prompt mestre recebido em 16/10/2026): Next.js App Router, React, TypeScript estrito e Tailwind, compartilhados pela loja e pela Produção UP. Preservar URLs, conteúdo, carrossel e funcionalidades aprovadas. Reutilizar os serviços Node existentes com adaptador de Route Handlers; conector Python independente. A loja original usa Node.js ESM, HTML/CSS/JS e Supabase REST/Auth/Storage. O painel antigo restrito ao loopback não substitui autenticação de operadores.

Plano de execução:
1. Conferir infraestrutura e programas, sem expor credenciais. Consultar documentação oficial atual de Supabase, Corel, eCut, MCP e geometria.
2. Criar autenticação de operadores e permissões por equipe, migrações, bucket privado e fila transacional com leases e proteção de repetição.
3. Compartilhar serviços entre API, assistente e ferramentas MCP. Validar parâmetros e manter eventos reais, arquivos e histórico.
4. Conector Windows Python, credencial revogável, execução exclusiva, motor real por contornos com Shapely, análise SVG e exportação vetorial com preservação de escala. Corel COM e eCut via capacidades documentadas e configuração validada; sem inventar assinaturas do eCut.
5. Captura somente da janela Corel selecionada e autorizada localmente, sem captura de desktop. Painel distingue imagem real, prévia vetorial e computador desconectado.
6. Construir painel responsivo e instruções. Testar autenticação, arquivos, fila, geometria, escala, progresso, IA e navegador; registrar separadamente testes com programas reais e simulações de transporte.

Verificação inicial: Windows/Python 3.12 disponíveis. Nenhum ProgID CorelDRAW, processo CorelDRW ou diretório padrão de instalação foi encontrado. E-mail do operador solicitado ao proprietário; a implementação independente continua enquanto isso.

Conexões verificadas: Auth, PostgreSQL e Storage Supabase responderam HTTP 200. Nove tabelas de produção instaladas com RLS e sem acesso direto de anon/authenticated. Bucket production-up privado. AI Gateway: catálogo atual consultado e chamada real com ferramentas aprovada (openai/gpt-4.1-mini), 120 cm → 1200 mm e 90 cm → 900 mm. Não existem usuários Auth no projeto neste momento.
