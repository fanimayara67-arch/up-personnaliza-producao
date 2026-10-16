# UP Personnaliza

Loja de comunicação visual e personalizados, com cinco serviços e trinta modelos personalizados. A aplicação atual usa Next.js App Router, React e TypeScript estrito, preservando URLs, identidade verde, banner aprovado, preços e bloqueios comerciais. A área privada **Produção UP** está em `/producao/encaixe`. Configuração, conector, MCP, segurança e limites estão em [production/README.md](production/README.md).

Para publicar o painel pelo GitHub na Vercel, siga [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). O acesso usa operadores autorizados no Supabase, sem senha padrão no código.

## Organização e tema da loja

A navegação foi reorganizada com referências observadas na [Atiara](https://www.atiara.imprimastore.com.br/) e na [Printi](https://www.printi.com.br/) usando Playwright, com conteúdo e identidade próprios. A comparação e as decisões estão em `exa-results/organizacao-atiara-2026-10-16/`.

- `/catalogo.html`: todos os produtos; `/comunicacao-visual.html` e `/personalizados.html`: departamentos.
- `/categorias/{slug}.html`: categorias de comunicação visual e personalizados, com filtro e ordenação. Preço desconhecido aparece ao final das ordenações por valor.
- `/produtos/{id}.html`: imagem, descrição, características, configuração, quantidade e produtos relacionados. Cada cartão abre a página própria.
- `/carrinho.html`: serviços e personalizados reunidos para orçamento, com edição na página correspondente. O envio segue para `/orcamento.html?origem=projeto`, preservando os detalhes.

`lib/storefront-pages.js` gera as páginas; `lib/storefront-layout.js` mantém cabeçalho, rodapé e cartões; `lib/store-benefits.js` reúne a redação da faixa de vantagens. `public/storefront.css` usa variáveis compartilhadas da marca. `public/project.js` organiza os itens; textos de personalizados ficam na sessão do navegador.

`npm run catalog:build` atualiza produtos, categorias, departamentos, início e carrinho, e sincroniza cabeçalho e rodapé da ajuda, solicitação e checkout. O banner está preservado em `templates/home-hero.html`; o layout compacto é aplicado pelo novo CSS. Edite os geradores para mudanças permanentes na estrutura, pois modificações diretas em páginas geradas serão substituídas no próximo build. URLs antigas da coleção e do configurador são encaminhadas à página equivalente pelo frontend.

A faixa abaixo do banner apresenta mensagens próprias sobre impressão, entrega, confiança, pagamento e valor do projeto; no celular usa quatro blocos em 2 × 2. Cobertura e pagamento dependem das condições do orçamento. O CNPJ é preservado nas páginas públicas. O rolante reúne 12 marcas, incluindo Grupo Sifra e AR Brandão Odontologia, com os PNGs fornecidos pelo proprietário.

## Rodar

Requer Node.js 24.x. Instale as dependências com `npm ci`. Para produção, execute `npm run build` e depois `npm start`.

```powershell
npm run dev
```

Abra `http://localhost:3101`. As configurações de contato continuam em `.env`, conforme `.env.example`. Categorias, produtos e galeria usam as imagens originais locais de `public/assets/real/`; o banner usa as composições descritas abaixo. A galeria não consulta `/api/photos`; `/api/config` e os endpoints comerciais continuam disponíveis. As credenciais da Pexels, quando configuradas para o endpoint existente, ficam somente no servidor.

## Fotos originais e revisão funcional

O topo apresenta três grupos de serviços: fachadas e letreiros, adesivos para ambientes e impressos com sinalização. Cada imagem recebe título e descrição em Montserrat, com contraste e posição adaptados à tela. As mensagens seguem o posicionamento para negócios registrado em `exa-results/posicionamento-up-personaliza-2026-10-14/plano.md`. O carrossel usa transição horizontal de 700 ms e intervalo de 5,5 s, com pausa por botão, foco, hover, aba oculta e saída da tela. Os clones de continuidade ficam ocultos das tecnologias assistivas. Teclado, toque e movimento reduzido mantêm a navegação manual.

O banner foi atualizado a pedido do proprietário com composições recriadas via Imagegen a partir das referências fornecidas. `public/hero-media.js` define 16 variantes responsivas: Bel Cosméticos do Parque Shopping Maceió em `public/assets/hero-v3/`, adesivos em `public/assets/hero-v4/`, e Feira Baiana em `public/assets/hero-v2/`. O quadro ocupa a largura disponível, em 12:5 no desktop e 1:1 no celular, com arquivos próprios para cada proporção e sem fundos duplicados/desfocados. A Feira tem uma composição móvel dedicada que preserva as placas laterais no quadro. Os títulos são texto HTML sobre a imagem, mantendo nitidez e acesso por tecnologias assistivas. Essas artes adaptadas não devem ser tratadas como novas fotografias documentais de obras.

`public/real-media.js` contém o mapa fornecido. `public/real-photos.js` controla o carrossel; `public/real-photos.css` aplica os enquadramentos às páginas da loja. As imagens dos serviços atuais preservam suas variantes responsivas; o letreiro Áurea usa `contain`. A identidade, o loop de marcas, os cinco IDs atuais e os campos comerciais permanecem. Os originais e as referências de trabalho ficam fora de `public/` e são ignorados pelo Git.

A revisão corrige foco e teclado em menu, busca, modais e carrinho; preserva as configurações do carrinho na sessão e bloqueia salvamento repetido. Alterações de quantidade preservam o foco no carrinho e no checkout. Consultas de preço têm limite de tempo e agrupam alterações rápidas de campos. A Montserrat mantém os pesos originais em WOFF2.

As três páginas foram verificadas no Chromium em 360, 390, 768, 1024, 1280 e 1440 px. O registro local da revisão está em `audit/real-integration/`; a aplicação não possui tarefas de lint, TypeScript ou build. A sintaxe é verificada com `node --check`. Preço, upload real e pagamento continuam sujeitos às integrações descritas abaixo.

## Personalização e carrinho

Cada produto tem campos próprios em `public/catalog.js`. As unidades são indicadas nos campos. Não foram criadas opções de materiais, garantias ou prazos novos.

O carrinho identifica cada configuração por `lineId`: duas configurações do mesmo produto são itens independentes. Quantidades e características físicas ficam em `localStorage`; conteúdo da arte, textos, contatos e dados do endereço ficam em `sessionStorage`. As configurações permanecem ao navegar e recarregar a mesma sessão. Ao encerrar a sessão, pode ser necessário preencher novamente os textos e dados pessoais; não há promessa de envio ou de preservação dos arquivos apenas selecionados no navegador. Carrinhos anteriores são migrados e itens incompletos pedem personalização.

## Preços comerciais

**Não há ofertas habilitadas para pagamento.** O arquivo `commerce.json` permanece com `products` vazio. Três personalizados exibem os preços de referência fornecidos no ZIP de atualização; esses valores não habilitam o checkout nem são aplicados a outros modelos.

`POST /api/price` consulta apenas ofertas comerciais explícitas do arquivo. Não existem fórmulas presumidas de área, margens ou multiplicadores de quantidade.

Para cadastrar uma tabela aprovada, cada chave de `products` deve ser um ID existente do catálogo e conter:

- `fields`: campos da configuração que determinam o preço, definidos a partir das regras comerciais reais.
- `offers`: configurações e quantidades para as quais existe uma oferta aprovada.
- Cada oferta contém `configuration`, com exatamente todos os campos declarados; `quantity`, a quantidade de itens configurados; e `totalCents`, o valor total dessa oferta em centavos, fornecido pela tabela real.

O preço só fica disponível quando uma única oferta corresponde exatamente às opções e à quantidade selecionadas. Não há interpolação entre medidas ou tiragens. Ofertas ausentes, ambíguas ou sem valor válido ficam indisponíveis. A moeda é BRL. `priceVersion` identifica a versão consultada. Não altere preços para testar o site público: use somente dados comerciais aprovados.

## Compra e pagamento

O backend Node.js implementa pedidos sem cadastro, Checkout Pro via API oficial do Mercado Pago, consulta do pedido e notificações assinadas. Os pedidos ficam no Supabase antes da criação da preferência. **As vendas continuam desativadas** até haver preços e condições de entrega aprovados, `APP_URL` HTTPS válida e credenciais compatíveis com o ambiente.

`public/payment-integration.js` implementa `window.CVT_CHECKOUT.submit(payload)`. O backend valida produtos, configurações, consentimento, versão de preços, arquivos e o total revisado; cria o pedido e devolve `orderId` e `redirectUrl`. Os preços são recalculados a partir de `commerce.json`. Cada linha é enviada ao provedor como um lote com quantidade 1 e o total aprovado dessa linha, preservando valores que não dividem exatamente pela quantidade de peças. Pix, cartão e boleto são preferências; o Mercado Pago confirma os meios disponíveis.

Uma chave de idempotência é preservada na sessão do navegador e tem restrição única por sessão no banco. Cliques simultâneos reutilizam o pedido. Após uma resposta incerta do provedor, o backend procura a preferência existente e evita recriá-la automaticamente. A preferência expira em 30 minutos. O carrinho permanece ao abrir o pagamento e em caso de falha. No retorno, a página consulta o pedido vinculado ao cookie da sessão; os parâmetros enviados na URL pelo provedor não aprovam pagamentos. Apenas linhas idênticas às compradas são retiradas após confirmação do backend, preservando itens adicionados depois.

### Entrega e instalação

`commerce.json` aceita `fulfillmentOffers`, uma lista de condições comerciais aprovadas para pedidos exatos. Cada oferta contém `postalCode` com os oito dígitos do CEP, `label`, `totalCents` inteiro maior ou igual a zero e `items`. Cada item declara `productId`, `quantity`, `configuration` com exatamente os campos comerciais do produto e `installation`: `a-definir`, `necessaria` ou `nao-necessaria`. Para produtos sem instalação, use `nao-necessaria`. Itens repetidos precisam estar repetidos na oferta; a ordem das linhas é indiferente.

É necessária uma única correspondência exata entre CEP, itens, configurações, quantidades e instalação. Não há estimativa presumida nem frete gratuito automático. Zero só é aceito quando cadastrado explicitamente em uma oferta aprovada. A revisão exibe entrega e total antes de habilitar o pagamento. Alterações nos dados exigem nova conferência. Nenhuma oferta comercial foi adicionada nesta implementação.

Os contatos por WhatsApp/e-mail e integrações antigas de solicitação continuam como opção secundária de **consultar disponibilidade**, sem apresentar essa consulta como uma compra. A preferência por Pix, cartão ou boleto não emite cobrança.

## Arte e endereço

`window.CVT_ARTWORK.upload({ file, side, configuration })` envia os arquivos para o bucket privado e devolve `fileId`. O backend aceita PDF, PNG e JPEG de até 15 MB, verifica a assinatura inicial do formato e vincula cada arquivo à sessão e ao lado escolhido. Na compra com arte pronta, valida a existência e a propriedade dos arquivos exigidos. O endereço do objeto privado não é exposto ao navegador. Essa checagem não substitui análise técnica de conteúdo, corte, fontes, cores e sangria. O gabarito SVG permanece uma referência.

O endereço mantém a consulta ViaCEP e permite preenchimento manual em caso de falha. Dados pessoais não são gravados no `localStorage`. Nenhum número de cartão é coletado pela loja.

## Arquivos principais

### Nova coleção de personalizados

`/personalizados.html` apresenta doze famílias e trinta modelos, com seleção de modelos, imagens responsivas e consulta para unidades ou lotes. O porta-bombom em formato de árvore foi retirado; a medalha do ZIP de atualização foi excluída da importação, conforme solicitado. Os chaveiros permanecem. A composição de kits é informada separadamente. As imagens são conceitos; estoque, materiais e prazo precisam de confirmação. A consulta pode ser enviada pelo formulário do site e não cria cobranças nem pedidos pagos.

Os modelos `UP-MP-001`, `UP-MX-001` e `UP-MT-001` preservam os preços fornecidos na atualização. “Acima de 10 unidades” começa em **11 unidades do mesmo modelo**, sem misturar variantes. Custos parciais informados pelo proprietário ficam no arquivo privado ignorado `catalog/private-reported-costs.json`, separado do catálogo público; não são tratados como custo completo nem divulgados no PDF.

A pesquisa Exa, comparações, hipóteses de varejo/atacado e método de custo estão em `exa-results/catalogo-personalizados-2026-10-15/avaliacao-e-precos.md`. `catalog/personalizados.json` é o cadastro privado local. Estoque desconhecido é `null`, não zero; custos e preços sugeridos não são expostos ao público.

```powershell
npm run catalog:admin
npm run catalog:build
npm run catalog:admin -- price-floor --sku UP-PERS-01 --quantity 50
```

Para registrar uma contagem física real, use `npm run catalog:admin -- stock --sku UP-PERS-01 --quantity NUMERO_CONTADO --note "origem e responsável pela contagem"`, substituindo o marcador pela quantidade verificada. O comando grava data/origem e histórico em `catalog/inventory-history.jsonl`. Registrar estoque não habilita a venda nem confirma capacidade de fabricação. Preencha os custos em centavos e taxas em pontos-base no cadastro privado para calcular o piso por pedido. As propostas de preço da pesquisa exigem conferência de custo e aprovação antes de virar ofertas comerciais. Não existe importação automática do estoque físico ou painel ERP nesta etapa.

- `public/catalog.js`: catálogo e campos específicos de cada produto.
- `public/store.js`: persistência, migração e consulta de preços.
- `public/app.js`: catálogo, configuração de produtos e carrinho lateral.
- `public/checkout.js`: revisão dos itens, endereço e disponibilidade de compra.
- `commerce.json`: tabela comercial, atualmente sem ofertas.
- `server.js`: arquivos estáticos, configuração, fotos e consulta de preços.

Os arquivos CSS, as imagens, as fontes e o logotipo foram preservados.

## Configuração e verificação das integrações

### SDK Python oficial do Mercado Pago

O SDK do repositório [mercadopago/sdk-python](https://github.com/mercadopago/sdk-python) está instalado localmente em `.venv-mercadopago/`, separado do servidor Node.js. `requirements-mercadopago.txt` fixa o commit usado na instalação. Para recriar o ambiente com Python 3.10 ou superior:

```powershell
python -m venv .venv-mercadopago
.\.venv-mercadopago\Scripts\python.exe -m pip install -r requirements-mercadopago.txt
```

Execute código Python com `.\.venv-mercadopago\Scripts\python.exe`. Esse SDK é uma biblioteca Python; sua instalação não conecta o checkout Node.js nem ativa cobranças. As credenciais continuam privadas no backend.

O servidor usa `fetch` do Node.js para a API oficial do Mercado Pago e para os serviços do Supabase. O SDK Python instalado pode ser usado separadamente; o servidor não inicia um processo Python por compra. Nenhuma chave privada vai para o navegador.

As tabelas `cvt_orders`, `cvt_payments` e `cvt_artworks` têm RLS e acesso de aplicação restrito a `service_role`. `database/checkout.sql` contém o esquema aditivo e a função atômica de atualização dos pagamentos. O bucket `artworks` é privado. O webhook autentica HMAC-SHA256, verifica o horário da assinatura e consulta o recurso na API oficial; confere conta recebedora, moeda, ambiente, valores e referência interna. Pagamentos repetidos ou antigos não duplicam nem rebaixam estados mais recentes. Aprovação, pendência, recusa, reembolso parcial/total e contestação ficam registrados. Uma falha temporária retorna erro para que o Mercado Pago tente novamente.

```powershell
npm test
npm run checkout:check
```

`checkout:check` informa os bloqueios sem mostrar credenciais ou criar cobranças. Para configurar um novo projeto Supabase, revise o SQL e execute `npm run checkout:setup` com o token administrativo local configurado. O comando cria somente os recursos de checkout e verifica RLS. `node scripts/verify-checkout-db.mjs` testa a função de pagamentos em uma transação revertida, sem deixar pedidos de teste.

Endpoints: `GET /api/checkout/status`, `POST /api/checkout/quote`, `POST /api/checkout` (alias `POST /api/orders`), `GET /api/orders/:id`, `POST /api/artworks?side=front|back` e `POST /api/webhooks/mercado-pago`. Escritas do navegador exigem a origem da loja; pedidos exigem a sessão iniciada por `/api/checkout/status`, cookie assinado, consentimento, chave de idempotência e a conferência atual do total. A consulta retorna apenas identificador, status, total e moeda do pedido pertencente à sessão.

O `.env` local recebeu os nomes de configuração da aplicação, sem substituir seus valores anteriores. As credenciais existentes do Supabase foram reaproveitadas nos nomes padronizados. O modelo `.env.example` contém somente nomes, comentários e valores de configuração, sem credenciais.

| Variável | Como preencher |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase; reaproveitada da configuração local existente. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada do backend; reaproveitada da configuração local existente. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública preferida do Supabase; reaproveitada quando disponível. |
| `SUPABASE_ANON_KEY` | Chave pública legada, opcional para compatibilidade; reaproveitada quando disponível. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token da aplicação em Suas integrações. Usar o token de teste durante desenvolvimento. |
| `MERCADO_PAGO_PUBLIC_KEY` | Public Key da mesma aplicação e ambiente. Opcional no redirecionamento direto do Checkout Pro. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Chave de assinatura de Webhooks > Configurar notificação na aplicação do Mercado Pago. |
| `MERCADO_PAGO_WEBHOOK_URL` | Variável legada. O backend deriva a notificação de `APP_URL` com o caminho `/api/webhooks/mercado-pago?source_news=webhooks`, evitando reutilizar um endereço de outra aplicação. |
| `MERCADO_PAGO_ENVIRONMENT` | `test` durante desenvolvimento; `production` após a validação, com credenciais de produção. A variável não transforma um token produtivo em token de teste. |
| `APP_URL` | URL HTTPS pública da loja na Vercel, incluindo o endereço temporário antes do domínio definitivo. A integração derivará dela as URLs de retorno ao checkout. |
| `GUEST_SESSION_SECRET` | Segredo técnico da sessão de compra sem cadastro; já foi gerado no `.env` local. Usar um valor próprio em cada ambiente. |
| `ARTWORK_STORAGE_BUCKET` | Bucket privado de artes, `artworks`, criado pela configuração de checkout. |
| `CHECKOUT_ENABLED` | Manter `false` até preços, entrega, domínio e uma compra de teste completa serem validados. O backend também bloqueia configurações incompletas ou credenciais de ambiente incompatível. |

Na Vercel, as variáveis deverão ser cadastradas nos ambientes correspondentes, com as chaves privadas como segredos. Elas não são publicadas pelo GitHub com o `.env`, que está ignorado. O frontend atual usa JavaScript comum: o prefixo `NEXT_PUBLIC_` sozinho não disponibiliza uma variável no navegador; a integração terá de expor apenas a configuração pública necessária.

Para esta loja própria não são necessários Client ID/Client Secret de OAuth ou credenciais de outras contas vendedoras. No painel do Mercado Pago, configure notificações de pagamentos e pedidos comerciais para o endpoint derivado de `APP_URL`, usando o segredo de assinatura correspondente. A aplicação não altera automaticamente a configuração do painel, as variáveis da Vercel ou o domínio. A mudança de `test` para `production` exige validação e autorização operacional; nunca use a conta real para simular um pagamento de teste.

Documentação: [criação de preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post), [notificações assinadas](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications), [credenciais e contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/test-accounts).
## Administração local do catálogo

Execute `npm start` e abra [Administrar catálogo](http://localhost:3101/admin/catalogo). O `.env` deste computador habilita `CATALOG_ADMIN_ENABLED=true`. Em uma nova instalação a opção vem desabilitada; o painel também recusa endereços externos, cabeçalhos de proxy, Vercel e `NODE_ENV=production`. Ele não substitui um administrador com autenticação para uso remoto.

O painel reúne os 15 modelos ativos. Permite revisar nome e descrição, registrar a validação da produção, contar estoque com origem da contagem, informar material, medidas em milímetros, prazo em dias úteis, composição de kits, custos e taxas. Campos vazios permanecem desconhecidos; zero é um valor informado. Alterações de texto aparecem na coleção e nas páginas individuais locais após salvar.

As referências da pesquisa podem ser copiadas para um **rascunho privado** de varejo e atacado. O simulador distribui preparo e taxa fixa pelo lote e calcula preço mínimo e contribuição estimada a partir dos custos cadastrados. Frete ao cliente e instalação exigem orçamento separado. Inclua todos os custos variáveis relevantes; a contribuição não representa lucro líquido e não cobre automaticamente despesas fixas não alocadas. Nenhuma taxa de pagamento ou imposto foi presumida.

Salvar o rascunho de preços não cria ofertas aprovadas e não habilita o checkout. Os três preços de referência fornecidos na atualização são publicados separadamente, mantendo sua condição de quantidade. A composição real, disponibilidade, custos completos, entrega e aprovação comercial continuam necessários. Não foram cadastradas contagens de estoque ou custos fictícios.

Os dados são gravados em `catalog/personalizados.json`; `catalog/changes.jsonl` mantém o registro privado de alterações e está ignorado pelo Git. O arquivo público gerado contém somente os campos da coleção. O salvamento exige a revisão atual do arquivo e usa trava entre processos; conflitos retornam erro, preservando as alterações na tela para conferência antes de recarregar. Caso o processo seja encerrado durante uma gravação e deixe `catalog/.personalizados.lock`, confirme que não existe outro salvamento em andamento antes de remover essa trava.

O botão **Exportar CSV** baixa o cadastro privado com valores em reais, custos, estoque e faixas de preço. Este CSV é para conferência, não para importação automática. Faça cópia do diretório `catalog` para manter seus registros locais.

## Busca, orçamento e atendimento

`/buscar.html` pesquisa os cinco serviços e os trinta personalizados, com normalização de acentos, plurais comuns, sinônimos de serviços e alternativas quando não há resultados. Cada modelo tem uma página HTML em `/produtos/`, com nome, descrição e imagem legíveis mesmo sem JavaScript. `npm run catalog:build` atualiza essas páginas; URLs canônicas e breadcrumbs estruturados dependem de `APP_URL` pública válida. Não são publicados avaliações, estoque ou ofertas de pagamento fictícios.

`/orcamento.html` reúne os produtos do projeto, permite quantidades e detalhes aproximados e solicita nome e um contato. `/orcamento.html?tipo=atendimento` recebe dúvidas, cancelamentos e pedidos sobre dados pessoais. `/ajuda.html` explica medidas, arte, produção, transporte, instalação, atendimento e privacidade. O recibo aparece somente após a gravação confirmada; uma falha mantém o rascunho e a chave de reenvio. O carrinho não é apagado ao pedir orçamento.

`database/inquiries.sql` cria `cvt_inquiries`, com RLS e sem acesso para `anon` ou `authenticated`. Somente o backend usa a credencial privada. As escritas exigem origem da loja, JSON limitado, autorização de contato e chave de idempotência; os produtos são validados no servidor. Há honeypot e limite de tentativas por processo. Antes de hospedar em múltiplas instâncias, configure um limitador compartilhado na infraestrutura.

```powershell
npm run inquiries:check
npm run inquiries:setup
npm run inquiries:verify
```

`inquiries:setup` aplica apenas o SQL aditivo de solicitações. A verificação de gravação, privacidade e mudança de status usa transação revertida e não deixa solicitações de teste. Esses comandos usam o acesso administrativo local já configurado, sem imprimir chaves.

Abra [Solicitações](http://localhost:3101/admin/solicitacoes) para acompanhar os 100 registros mais recentes e marcar análise, orçamento enviado ou encerramento. O painel é local e não envia automaticamente e-mail ou WhatsApp. A operação precisa acompanhar essa fila. Para administração remota, ainda é necessário implementar autenticação e permissões de administrador antes de disponibilizar o painel fora deste computador.

Em [Configurações](http://localhost:3101/admin/configuracoes), cadastre apenas razão social, CNPJ, endereço e contatos confirmados, horários, região atendida e política de produção. As informações publicáveis ficam em `catalog/store-profile.json`; as credenciais continuam no ambiente privado. O painel usa controle de revisão para impedir que uma janela sobrescreva alterações de outra.

O PDF atualizado é gerado por `python -X utf8 scripts/gerar-catalogo-pdf.py` em `output/pdf/`, com dependências isoladas em `tmp/pdfs/deps`. A cópia entregue ao proprietário fica em `C:/Users/orlan/Downloads/UP Personaliza - Produtos e Precos.pdf`. O documento contém 15 modelos, preços de referência e descrições; custos internos não são incluídos. O kit de eventos continua sem preço até confirmar sua composição.

A pesquisa e os limites da revisão estão em `exa-results/auditoria-ecommerce-2026-10-15/relatorio.md`. As verificações no navegador ficam em `audit/ecommerce/`; os resultados automatizados não equivalem a certificação integral WCAG ou comprovação de aumento de vendas. Nenhuma ferramenta de publicidade foi adicionada. A versão está implementada localmente; publicação e configuração do domínio continuam sendo uma etapa de implantação.
