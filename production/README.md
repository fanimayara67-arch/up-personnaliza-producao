# Produção UP

Área privada `/producao/encaixe` na aplicação Next.js compartilhada com a loja. Componentes: `src/features/production`; backend: `production/`; SQL: `database/production.sql`; conector: `integrations/corel-worker`; MCP: `integrations/production-mcp`. As URLs públicas `.html` continuam funcionando. `/` continua sendo a loja.

## Iniciar e autorizar operador

Requer Node 24.x (verificado em 24.19), Python 3.12 e o Supabase existente:

```powershell
npm ci
npm run production:inspect
npm run production:setup
node scripts/production-operator.mjs
npm run dev
```

O provisionamento solicita e-mail no terminal, reutiliza a conta existente ou cria conta com senha digitada de forma oculta. Não envie senha pelo chat. Autoriza um administrador na equipe UP Personnaliza. Não existe senha padrão. As contas dos testes são temporárias e removidas.

Preencha `.env.example` em um `.env` privado. `PRODUCTION_ORIGIN` deve coincidir exatamente com a origem do navegador; em produção use HTTPS. O setup reutiliza Supabase, instala o SQL aditivo, cria `production-up` privado e gera segredo de sessão próprio no `.env` ignorado. Não altera pedidos, catálogo ou bucket `artworks`. Sessões expiram junto ao token Auth; entre novamente quando solicitado.

## Conectar computador

```powershell
python -m venv .venv-production
.venv-production/Scripts/python.exe -m pip install -r integrations/corel-worker/requirements.lock.txt
.venv-production/Scripts/python.exe integrations/corel-worker/worker.py --diagnose
```

No painel, **Configurações → Autorizar novo computador** gera uma credencial exibida uma única vez. Salve-a em `integrations/corel-worker/config.local.json`, conforme `config.example.json`. A credencial tem hash no servidor e pode ser revogada no painel. O conector não recebe credencial administrativa do banco.

Para SVG, mantenha `corel.progid` vazio e `nestingEngine: "up"`:

```powershell
.venv-production/Scripts/python.exe integrations/corel-worker/worker.py
```

Somente em desenvolvimento com `http://localhost:3101`, acrescente `--allow-loopback`. Servidores remotos exigem HTTPS. `--once` processa no máximo uma tarefa real.

## Operação e geometria

1. Crie trabalho e envie original, até 25 MB.
2. A análise entra na fila. Sem computador compatível: **Aguardando computador de produção**.
3. Confira contornos e avisos; defina chapa, unidade, margens, espaçamento, quantidades e rotações.
4. Salve os parâmetros, ou peça ao Assistente UP. Medidas interpretadas são mostradas em mm.
5. Execute o encaixe; confira prévia, validação e downloads privados.

O motor UP usa contornos reais com Shapely/GEOS, busca heurística por contato entre vértices, rotações, concavidades e vazados opcionais. Não garante ótimo global. Limites: 200 peças, 24 rotações, 300 segundos de busca. Peças não posicionadas causam validação reprovada; não são omitidas de uma aprovação.

SVG precisa de largura/altura com unidade física e `viewBox` coerente. Aceita caminhos fechados, polígonos, retângulos simples, círculos, elipses e transformações explícitas. Textos, contornos abertos, efeitos, recursos externos, imagens, máscaras e CSS geométrico são recusados com orientação. Objetos gráficos são peças individuais; um grupo preserva transformações, mas não vira montagem indivisível. Contornos idênticos são identificados e mantidos como peças distintas.

Tolerância geométrica: 0,05 mm. A busca mantém folga conservadora adicional. O SVG de saída preserva comandos de curvas originais e aplica apenas transformações rígidas às cópias. A pintura é uniformizada para visualizar o corte. DXF usa polilinhas em mm; a linearização é explícita. Escala e quantidade são conferidas após exportar SVG; DXF é relido e sua unidade é verificada.

Espaçamento não é largura de corte. A compensação fica no CAM; o nesting não aplica outra compensação. Material, modelo da máquina, controlador e CAM são registrados por trabalho. Preencher nomes não qualifica o equipamento: a preparação específica de corte permanece pendente até validação física do perfil. Nenhuma ferramenta aciona a máquina.

## IA, API e MCP

Reutiliza `AI_GATEWAY_API_KEY`. `node scripts/production-ai-check.mjs --configure --live` consulta catálogo atual e testa ferramentas. Foi verificado `openai/gpt-4.1-mini`; o modelo fica em `PRODUCTION_AI_MODEL`, sem nome fixo no frontend. Falhas do gateway aparecem ao operador; controles manuais continuam disponíveis.

Ferramentas compartilhadas: `analisar_arquivo`, `configurar_chapa`, `executar_encaixe`, `consultar_progresso`, `validar_resultado`, `gerar_previa`, `exportar_arquivo`. Operações demoradas retornam identificador de tarefa. API: `POST /api/production/jobs/{jobId}/tools/{ferramenta}`, JSON e `Idempotency-Key` UUID nas operações enfileiradas. Parâmetros são validados pelo programa, independentemente da IA.

```powershell
npm ci --prefix integrations/production-mcp
node scripts/production-operator.mjs --mcp
```

O token MCP é salvo em `.production/mcp.env`, ignorado. Configure o cliente stdio com comando `node`, argumento absoluto para `integrations/production-mcp/index.mjs`, variáveis `PRODUCTION_URL` e `PRODUCTION_MCP_TOKEN`. Para loopback: `PRODUCTION_MCP_ALLOW_LOOPBACK=true`. Não há endpoint MCP público nem acesso a SQL/shell. O token expira em 30 dias; revogue em `up_production_tokens.revoked` ou desabilite o operador. Cada chamada revalida a associação à equipe.

## Segurança e recuperação

Sessão cifrada em cookie HttpOnly, SameSite e Secure em HTTPS; verificação de origem em mutações do navegador. Auth verifica o usuário no Supabase e a associação ativa no servidor. Tabelas têm RLS e acesso direto revogado para anon/authenticated. Service role permanece no backend. Uploads usam autorização assinada vinculada ao trabalho/equipe e conferência de tamanho/hash. Downloads exigem sessão e retornam URL assinada de 60 segundos, sem endereço público permanente. O conector negocia esse transporte e usa as URLs Storage sem encaminhar sua credencial.

Original, documento de trabalho, prévia, resultado, validação e captura ficam separados. A fila usa `FOR UPDATE SKIP LOCKED`, uma tarefa ativa por trabalho/computador, token de concessão e lease de 90 segundos renovado. Configuração e enfileiramento bloqueiam a mesma linha do trabalho. Existe uma tentativa automática por tarefa; nova tentativa exige comando explícito.

Concessão expirada, limite excedido ou interrupção ambígua retém a tarefa para conferência (`needs_review`). Resultados antigos não são aplicados. O journal local é gravado antes de executar e antes de confirmar; uma confirmação perdida pode ser reenviada sem executar novamente.

Ao reiniciar com journal `running`: confira o documento no computador, registre a conferência no painel e preserve o journal renomeando-o localmente, por exemplo `journal.reviewed-2026-10-16.json`. Só depois reinicie no mesmo diretório de estado. Não apague estado para forçar repetição. Restrinja o diretório Windows ao operador e defina a retenção dos arquivos de clientes.

## Acompanhar ao vivo

Com Corel instalado e ProgID configurado:

```powershell
.venv-production/Scripts/python.exe integrations/corel-worker/worker.py --live
```

Apenas a janela da instância Corel de produção é oferecida. O operador precisa selecionar e digitar `AUTORIZAR 1` localmente. A autorização dura aquela execução. `PrintWindow` captura somente o HWND escolhido; PID e executável são conferidos a cada imagem. Não há captura de desktop, tela inteira ou fallback para outra janela. Janela minimizada/inválida e captura indisponível não geram imagem falsa.

JPEGs privados são atualizados durante tarefas; somente a captura mais recente permanece no caminho ativo. O painel separa **Corel ao vivo**, **Prévia do arquivo**, captura pendente e **Computador desconectado**, com horário da última imagem. Imagens vencidas não são mostradas como transmissão atual. Sem resultados intermediários, a operação permanece identificada como processamento até chegar evento real.

## Corel/eCut: requisitos externos

Este Windows não apresentou ProgID CorelDRAW, processo ou instalação padrão. COM, CDR/PDF, eCut e captura de janela real não foram validados aqui.

O adaptador usa `OpenDocument`, inspeção de objetos, `ExportEx`/`Finish`, `SaveAs`, `PublishToPDF` e `GMSManager.RunMacro` documentados pela Corel. Constantes são lidas da biblioteca de tipos instalada, incluindo unidade SVG em mm; não há valores numéricos presumidos. Trabalha em cópias. Documentos pessoais já abertos impedem o uso da instância. Textos/fontes precisam de conferência e conversão explícita em curvas no Corel. Teste exportação e escala na versão instalada antes de produção.

eCut exige instalação/licença e ponte local documentada para aquela versão. Não foi encontrada documentação oficial acessível para fixar uma macro universal. `ecut.verified` permanece falso; não preencha nomes por tentativa. Confirme módulo/macro com o fornecedor e registre versão e documentação no perfil. A ponte recebe caminho de JSON `up-production-bridge/1` com `sourceSvg`, `parameters` em mm e `outputPlacements`. Deve devolver `{"placements":[{"pieceId":"p1","matrix":[1,0,0,1,10,10],"rotation":0}]}`. Matrizes atuam nos contornos físicos originais, sem escala/espelhamento. A saída passa pelo GEOS. Se a versão não oferecer controle documentado, use o motor UP; não há emulação de cliques nem API eCut inventada.

Referências oficiais: [Corel OpenDocument](https://community.coreldraw.com/sdk/api/draw/27/m/application.opendocument), [ExportEx](https://community.coreldraw.com/sdk/api/draw/25/m/document.exportex), [RunMacro](https://community.coreldraw.com/sdk/api/draw/25/m/gmsmanager.runmacro), [eCut](https://eng.e-cut.ru/), [Shapely](https://shapely.readthedocs.io/en/stable/manual.html), [Supabase](https://supabase.com/docs/guides/storage/security/access-control), [AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis), [MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Testar e implantar

```powershell
npm run lint
npm run typecheck
npm test
.venv-production/Scripts/python.exe -m unittest discover -s integrations/corel-worker/tests -v
node scripts/production-integration-test.mjs
npm run build
npm start
```

O teste integrado usa Supabase, fila e geometria reais, com conta/equipe/arquivos temporários removidos ao final. `scripts/production-browser-fixture.mjs` prepara conta de navegador; o teste `scripts/production-browser-check.cjs` usa o executor Playwright instalado. Execute a fixture com `--cleanup` depois. `scripts/production-mcp-check.mjs` usa essa fixture. Esses testes não validam Corel/eCut ou captura real.

Destino preparado: servidor Node 24, HTTPS por proxy reverso, origem exata e limite de upload de 25 MB no proxy. Instalação/build: `npm ci` e `npm run build`; serviço: `npm start`. Mantenha o conector Windows separado. Não há `basePath` de produção e não foi feita publicação externa.

Vercel: siga [DEPLOY-VERCEL.md](../DEPLOY-VERCEL.md). `vercel.json`, transporte direto de arquivos privados e origem derivada das variáveis de sistema estão preparados. `PRODUCTION_ONLY=true` abre o painel na raiz dessa implantação. Não foi realizado deploy externo; os testes locais não equivalem à validação do domínio publicado. Atualize o conector para esta versão antes de apontá-lo à Vercel; o protocolo anterior por proxy é mantido apenas por compatibilidade local.

O administrador comercial antigo continua disponível em desenvolvimento por `npm run legacy:start`, com `PORT=3102` (PowerShell: `$env:PORT='3102'`). Exige loopback, sem proxies, e não é disponibilizado em produção. Foi preservado porque ainda administra catálogo e solicitações; sua restrição local não substitui a autenticação da Produção UP.
