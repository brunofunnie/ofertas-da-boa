# Ofertas da Boa

Aplicação para acompanhar preços e organizar listas de compras. Requer Node.js 22.13 ou mais recente (SQLite nativo).

```sh
npm install
npm run build
npm start
```

Acesse http://localhost:8000 ou, no celular, o IP do computador na mesma rede com a porta 8000. Em desenvolvimento, rode `npm run dev`; o Vite inicia a API no mesmo processo. O arquivo `ofertas.sqlite3` guarda os dados e continua compatível com a versão anterior; faça backup dele para preservar suas listas.

## Login com Google

A busca e as ofertas são públicas. Para criar e gerenciar listas, o usuário precisa entrar com o Google; cada conta acessa somente suas listas. O e-mail verificado `brunodeoliveira@gmail.com` é administrador. As listas anteriores são vinculadas a essa conta no primeiro login.

No Google Cloud Console, configure a tela de consentimento e crie um cliente OAuth de tipo **Aplicativo da Web**. Cadastre a origem `https://ofertas.funnie.dev` e o URI de redirecionamento `https://ofertas.funnie.dev/auth/google/callback`. Em modo de teste, inclua as contas autorizadas como usuários de teste.

As credenciais Google ficam no projeto Homelab do Infisical, na pasta `/ofertas-da-boa`, separadas nos ambientes `prod` e `dev`. A identidade de máquina deve estar em `~/.config/infisical/homelab.ua.env`, com acesso restrito ao proprietário. Para desenvolver com login, execute `npm run dev`. No servidor, atualize o contêiner com `node scripts/infisical-run.js prod docker compose up -d`; esse comando consulta o Infisical e injeta as credenciais no contêiner. Execute-o novamente após alterar os segredos: um `docker compose up` sem ele não carrega o login. O cliente de desenvolvimento deve ter o URI `http://localhost:5173/auth/google/callback` cadastrado no Google.

A atualização consulta a página inicial do Tauste e importa os produtos encontrados nela. O catálogo acessível nessa página é parcial. Produtos com preço anterior anunciado recebem a etiqueta “Oferta”, e os preços com selo do clube recebem a etiqueta “Clube”. Os demais são preços normais, não necessariamente promoções; preços podem variar na loja. O Bom Lugar publica folhetos em imagens. Configure um provedor de IA no cabeçalho para ler os folhetos automaticamente; por padrão, o Gemini usa `GEMINI_API_KEY` no ambiente. A leitura por IA pode errar: confira nome, preço, condições e validade no folheto. O preço principal é o comum e, quando identificado, o preço de clube aparece separadamente. Ofertas com validade vencida deixam de aparecer na busca, mas permanecem nas listas e no banco. Falhas de atualização aparecem na tela e os últimos preços ficam armazenados com a data da consulta. O agrupamento normaliza acentos, ordem das palavras, embalagem e unidades equivalentes. Ele exige quantidade explícita e palavras relevantes idênticas, preservando marca, variedade e tamanho; nomes diferentes podem não ser agrupados e uma descrição incompleta pode gerar correspondência incorreta. O histórico registra preços observados por produto, mercado e condição a partir desta versão, sem reconstruir preços antigos; o gráfico aparece após pelo menos dois preços observados. Preços de clube e sem clube são tratados como condições distintas.

Cada supermercado tem uma pasta em `providers/`, com seu próprio módulo e testes. Para adicionar outro, crie um módulo com `id`, `name`, `url` e `fetchOffers(fetchPage)` e registre-o em `providers/index.js`; a função retorna produtos com nome, preço em centavos e URL. Categorias são identificadas por palavras ou escolhidas no cadastro. Testes: `npm test`.

O banco mantém um cadastro de produtos compartilhado pelas ofertas e pelo histórico de preços. A migração dos registros existentes ocorre na abertura do servidor e preserva os identificadores usados nas listas. Quando a descrição não permite identificar marca e quantidade com segurança, ela permanece separada para evitar associações incorretas.

Em **IA**, no cabeçalho, escolha Gemini ou um serviço compatível com a API de chat da OpenAI, configure a URL e a chave se necessária e escolha ou digite um modelo. **Listar** consulta os modelos oferecidos pelo serviço; a entrada manual continua disponível se a listagem não funcionar. O modelo precisa aceitar imagens. A configuração ativa é usada na leitura dos folhetos e posts; as imagens são enviadas ao provedor escolhido e podem gerar custos. As chaves ficam no servidor em `.local/ai-config.json` e não são devolvidas à interface. O Gemini continua usando `GEMINI_API_KEY` como alternativa à chave configurada na tela. Somente o administrador pode alterar essa configuração.

As APIs de IA devem usar HTTPS e resolver apenas para endereços públicos; serviços em localhost ou na rede privada são bloqueados. Os hosts `api.openai.com` e `api.commandcode.ai` são permitidos por padrão. Para usar outros provedores, inclua os hosts em `AI_ALLOWED_HOSTS`, separados por vírgula, na configuração do servidor; inclua a porta quando diferente de 443. As operações de escrita aceitam somente JSON e recusam requisições de outras origens. O contêiner roda sem privilégios de root, com sistema de arquivos somente de leitura e rede dedicada; o serviço de túnel deve participar dessa rede para encaminhar o domínio.

Novas ofertas lidas por IA aguardam aprovação em **Revisar ofertas**; confira o folheto ou a publicação antes de aprovar. Ofertas rejeitadas não reaparecem enquanto os dados extraídos forem os mesmos, e ofertas vencidas não podem ser aprovadas. Preços extraídos antes desta versão continuam no banco como estavam. A aplicação registra operações e erros em logs estruturados do servidor, sem registrar o corpo das requisições; em Docker, consulte `docker compose logs ofertas`. As ações autenticadas registram o identificador da conta Google na auditoria.

O Santo Supermercados também pode importar o post mais recente de `@santosupermercados`, incluindo as imagens de carrossel. Salve o JSON de cookies exportados do Instagram em `.local/instagram-cookies.json` (arquivo privado, ignorado pelo projeto) e configure um provedor de IA no cabeçalho. Atualize o Santo na tela de supermercados para consultar as duas fontes. A leitura só cadastra ofertas com período de validade legível e vigente. A instalação usa o Google Chrome em `/usr/bin/google-chrome`; defina `CHROME_PATH` se ele estiver em outro local. Se não houver arquivo de cookies, o catálogo do Santo continua funcionando normalmente; se uma fonte falhar, a outra ainda é atualizada e o erro aparece como atualização parcial. Posts sem promoção e produto com preço são ignorados. A sessão pode expirar ou exigir verificação do Instagram.

Para atualizar a sessão pelo celular ou navegador, abra **Supermercados → Santo Supermercados → Cookies do Instagram** e cole o JSON exportado. Campos extras são ignorados e o JSON salvo não é exibido novamente. Somente o administrador pode alterar os cookies.

A aplicação não remove automaticamente ofertas antigas nem confirma validade ou estoque; confira os preços na fonte antes de comprar.

A busca usa um índice de relações entre produtos e palavras no SQLite. Ignora acentos, aceita palavras em qualquer ordem, prefixos e um erro de digitação em palavras de pelo menos quatro letras. Os filtros de setor e mercado continuam disponíveis junto com a busca.

Quando faltam imagens, o servidor consulta o Open Food Facts em segundo plano, uma busca a cada 12 segundos. O nome do produto é enviado ao serviço externo; apenas correspondências conservadoras com marca e quantidade são usadas, e a fonte da foto aparece na interface. Produtos sem quantidade identificável também são pesquisados, mas a imagem só é associada quando a identificação for segura. Resultados ausentes são tentados novamente após sete dias ou quando o produto é atualizado; falhas são tentadas novamente após uma hora. Opcionalmente, configure `OFF_USER_AGENT` com identificação e contato da aplicação. As imagens do supermercado têm prioridade.

O provedor Santo Supermercados consulta os produtos exibidos nos setores da página inicial e percorre o carrossel de ofertas. Preços exclusivos do aplicativo e produtos vendidos por quilo são identificados na tela. O catálogo online pode variar conforme a loja e a forma de entrega; a consulta usa o catálogo público sem loja selecionada.

Na barra de abas, o painel de supermercados mostra o resultado da última tentativa e permite atualizar cada fonte. Os números indicam produtos consultados, novos e com dados alterados na última atualização concluída; quando uma tentativa falha, as contagens anteriores são preservadas. O indicador mostra o resultado da consulta mais recente, sem testar disponibilidade continuamente.
