# Fisga

## Executar localmente

Requer Node.js 18 ou superior. Na raiz do projeto:

```bash
npm start
```

Abra `http://127.0.0.1:3000`. O servidor oferece a página e a API local:

- `GET /api/locations` — localidades disponíveis.
- `GET /api/tides?location=recife&date=2026-10-01` — extremos de maré do dia e dos dias vizinhos, quando disponíveis.
- `POST /api/auth/register` e `POST /api/auth/login` — criar conta e entrar na comunidade.
- `/api/community/*` — perfis legados, capturas e ranking; o chat usa Supabase.

As consultas são encaminhadas à [Tábua de Maré API](https://tabuamare.api.br/docs). A API seleciona o porto oficial mais próximo dentro de Pernambuco; a interface identifica o porto utilizado. A cobertura depende das estações e dos anos publicados pelo provedor.

Os horários/alturas de maré vêm da fonte oficial. O traçado entre os extremos, os horários do sol e a atividade dos peixes são estimativas independentes e estão identificados como tais.

O serviço público limita chamadas anônimas por IP. Consulte os limites e termos atuais na documentação do provedor; o servidor não armazena em cache as respostas.

## Comunidade

Crie uma conta em `/login/login.html` para registrar capturas, consultar o ranking por espécie/peso/tamanho, fazer amizade com outros pescadores e conversar em chats individuais ou grupos. Os pedidos de amizade podem ser aceitos, recusados ou cancelados. Capturas e ranking ficam no armazenamento Node compartilhado pelas contas atendidas pelo mesmo servidor; o chat, a busca de pescadores e as amizades usam o Supabase.

As contas legadas do Node usam senhas derivadas com PBKDF2 e sessões em cookies `HttpOnly`. O armazenamento em arquivo fica em `.data/community.json` (ignorado pelo Git); configure `FISGA_DATA_FILE` para escolher outro caminho. Esse armazenamento é destinado a uma única instância do servidor; para escalar horizontalmente, migre os dados para um banco compartilhado. Para disponibilizar o app publicamente, coloque o servidor atrás de HTTPS e mantenha backups.

## Configurar Supabase Auth e o chat em tempo real

1. No SQL Editor do Supabase, execute [`supabase.sql`](./supabase.sql). O script cria perfis, salas, membros, mensagens e amizades, configura RLS, cria o bucket público `fisga-capturas` (upload autenticado limitado ao diretório do próprio usuário) e adiciona `mensagens` à publicação Realtime. Somente usuários autenticados que pertencem à sala podem ler ou enviar mensagens; cada pescador só pode consultar suas próprias amizades, e solicitações e respostas são validadas por funções do banco. Se você já executou uma versão anterior do script, execute novamente a versão atualizada.
2. Em [`supabase-config.js`](./supabase-config.js), configure a Project URL e a chave pública (publishable/anon). Essa chave pode ficar no navegador; nunca use a chave `service_role` ou outra chave secreta no front-end.
3. Em **Authentication → URL Configuration** no Supabase, configure a URL do site e inclua a URL local (por exemplo, `http://127.0.0.1:3000/**`) nos Redirect URLs. Para entrar imediatamente após o cadastro, desative a confirmação de e-mail; se ela permanecer ativa, confirme o endereço antes de entrar.
4. Inicie o servidor com `npm start` e acesse `http://127.0.0.1:3000`. O formulário de [`login/login.html`](./login/login.html) cria e autentica contas no Supabase. Depois de autenticar, a aplicação também cria/valida a conta Node necessária para as capturas e o ranking.
5. O painel Chat em [`index.html`](./index.html) consulta perfis Supabase, envia e responde solicitações de amizade, cria conversas diretas e grupos, carrega o histórico e recebe mensagens via Realtime. No Perfil, o pescador pode anexar fotos JPG, PNG ou WebP de até 5 MB às capturas; os arquivos ficam no bucket público `fisga-capturas` e os caminhos são salvos com os registros no armazenamento Node. Capturas antigas aparecem sem foto até que uma nova imagem seja enviada. O módulo [`supabase-chat.js`](./supabase-chat.js) contém as funções de autenticação, amizade, fotos, sala, histórico, assinatura e envio; [`script.js`](./script.js) liga esses helpers aos formulários e à interface.

Contas criadas antes desta integração continuam no armazenamento legado do Node. Ao entrar com essas credenciais pela primeira vez, a aplicação valida a conta antiga e cria uma conta Supabase com o mesmo e-mail e senha; a confirmação de e-mail pode ser necessária conforme a configuração do projeto. Capturas e ranking permanecem no servidor Node; o chat e os perfis usados para encontrar pescadores ficam no Supabase. A sessão de cada serviço é encerrada ao sair. Não habilite acesso anônimo nem remova as políticas RLS para contornar erros de configuração.
