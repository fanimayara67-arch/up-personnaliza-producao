# Publicar Produção UP na Vercel

Repositório privado: [fanimayara67-arch/up-personnaliza-producao](https://github.com/fanimayara67-arch/up-personnaliza-producao).

## Importar

1. Na Vercel, escolha **Add New → Project → Import Git Repository** e autorize a conta GitHub desse repositório privado.
2. Selecione `up-personnaliza-producao`. Diretório raiz: `./`; framework **Next.js**; Node **24.x**. O `vercel.json` configura `npm ci` e `npm run build`. Deixe o diretório de saída padrão do Next.
3. Em **Environment Variables**, importe o arquivo privado `.production/vercel.env` preparado no computador do proprietário. Use o ambiente **Production**. Ele não está no GitHub. Para gerar novamente a partir do `.env` local: `node scripts/production-vercel-env.mjs`.
4. Clique **Deploy**. Abra o endereço HTTPS fornecido pela Vercel. `PRODUCTION_ONLY=true` leva a raiz ao painel; o endereço direto é `/producao/encaixe`.

Não importe `.env` inteiro. O arquivo preparado contém apenas as conexões necessárias, segredo próprio para a implantação e bloqueios comerciais. Não contém senha de operador, credencial de computador, token administrativo de migração ou senha de banco. Não use prefixo `NEXT_PUBLIC_` nas variáveis privadas. Não compartilhe esse arquivo.

`PRODUCTION_ORIGIN` vazia utiliza o domínio de produção informado pela Vercel, ou o endereço do deployment em Preview. Ao vincular um domínio próprio, configure essa variável com a origem exata, por exemplo `https://producao.suaempresa.com.br`, sem barra final, e faça novo deploy. Use o mesmo endereço no navegador e no conector. A verificação de origem protege as operações autenticadas.

## Acesso e dados

O ambiente preparado reutiliza o Supabase já configurado. A conta de produção autorizada e a senha já entregues ao proprietário continuam válidas. Não há cadastro público nem senha padrão no repositório. As sessões locais e publicadas usam segredos diferentes.

O schema `database/production.sql` e o bucket privado `production-up` já foram aplicados ao banco conectado. Para outro Supabase, configure o `.env` em um computador confiável, execute `npm run production:setup` e `node scripts/production-operator.mjs`; prepare então outro arquivo de ambiente. O token administrativo utilizado na migração permanece nesse computador.

Arquivos de até 25 MB seguem diretamente para o Storage por URL temporária após autorização de equipe e trabalho. A confirmação confere tamanho e SHA-256 no backend. Downloads exigem sessão e usam URLs assinadas de 60 segundos. A fila persistente permanece no PostgreSQL. As funções Vercel recebem os comandos e relatórios; o nesting executa no computador conectado. Capturas JPEG ficam limitadas a 1 MB por atualização.

## Conectar o computador após publicar

1. Abra o painel publicado, entre e acesse **Configurações → Autorizar novo computador**. Se preferir reutilizar o cadastro local existente, preserve a credencial já salva e pare o conector local antes de mudar de endereço. Não execute duas instâncias com a mesma credencial.
2. No Windows, configure `integrations/corel-worker/config.local.json` conforme `config.example.json`, com `url` igual à origem HTTPS da implantação e a credencial própria. Esse arquivo é ignorado pelo Git.
3. Instale Python 3.12 e siga [as instruções do conector](integrations/corel-worker/README.md). Inicie `worker.py` sem `--allow-loopback` no ambiente remoto.
4. Envie `examples/production/pecas.svg`, analise, confira medidas, execute o encaixe e baixe o SVG. Sem Corel instalado, o motor UP processa SVG e exporta SVG/DXF.

CorelDRAW, eCut e seus licenciamentos ficam no computador Windows, não na Vercel. CDR/PDF e captura ao vivo dependem da instalação e validação dessa integração. A janela precisa ser selecionada e autorizada localmente com `--live`; nenhuma tela é capturada automaticamente. O perfil físico da máquina/controlador/CAM ainda deve ser qualificado antes de preparar corte específico.

## Conferir depois do deploy

Confirme login, criação de trabalho, envio direto, análise, encaixe, download e reconexão do computador. Sem sessão, `/producao/encaixe` deve ir ao login e `/api/production/jobs` deve responder 401. O teste local integrado verifica transporte real acima de 4,5 MB e geometria; a hospedagem só pode ser conferida depois que este projeto for publicado.

O projeto mantém a loja e as URLs existentes no mesmo código. Para abrir a loja na raiz, use `PRODUCTION_ONLY=false`. Checkout e administrador comercial permanecem desativados na implantação preparada.

Referências: [limites das funções Vercel](https://vercel.com/docs/functions/limitations), [variáveis de sistema](https://vercel.com/docs/environment-variables/system-environment-variables), [uploads assinados Supabase](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl). Detalhes de operação, segurança e limitações: [Produção UP](production/README.md).
