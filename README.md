# Servidor de WhatsApp não oficial, multiempresa (Evolution API no Railway)

Um servidor só atende várias empresas. Cada empresa é uma **instância** (um número de WhatsApp) com
a **própria chave** e o **próprio webhook**. A chave de uma empresa não abre a instância de outra.

> API não oficial: o WhatsApp pode bloquear o número. Use chips de teste e mantenha uma réplica só.

## Como o multiempresa funciona

| Chave                                    | Quem tem        | O que faz                                              |
| ---------------------------------------- | --------------- | ------------------------------------------------------ |
| Global (`AUTHENTICATION_API_KEY`)        | só o operador   | cria, lista e apaga instâncias de todas as empresas    |
| Da instância (gerada no comando `criar`) | a plataforma da empresa | envia mensagem, pede QR, lê estado e troca o webhook **só da instância dela** |

Testado na versão 2.3.7: com a chave da instância A, ler o estado, enviar, trocar o webhook ou apagar
a instância B responde 401; criar instância responde 401; a listagem devolve só a instância A.

Limites para conhecer:

- A chave da instância permite desconectar e apagar a própria instância.
- Não existe troca de chave: para trocar, remova a instância e crie de novo (pede QR outra vez).
- Todas as empresas dividem o mesmo processo e o mesmo banco. Se o servidor cai, cai para todas.
- O painel `/manager` entra com a chave global. Não passe esse endereço nem essa chave a clientes.

## 1. Subir no Railway

1. Suba esta pasta para um repositório no GitHub.
2. No Railway: **New Project → Deploy from GitHub repo →** este repositório.
3. No mesmo projeto: **New → Database → PostgreSQL** e **New → Database → Redis**.
4. No serviço da Evolution, em **Variables**, crie as quatro variáveis:

| Variável                  | Valor                                                    |
| ------------------------- | -------------------------------------------------------- |
| `AUTHENTICATION_API_KEY`  | a chave global, gerada com o comando abaixo              |
| `SERVER_URL`              | `https://${{RAILWAY_PUBLIC_DOMAIN}}`                     |
| `DATABASE_CONNECTION_URI` | `${{Postgres.DATABASE_URL}}?schema=evolution_api`        |
| `CACHE_REDIS_URI`         | `${{Redis.REDIS_URL}}/6`                                 |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

   Troque `Postgres` e `Redis` pelo nome que os serviços tiverem no projeto. O resto da configuração
   já está no `Dockerfile`.

5. **Settings → Networking → Generate Domain**, porta **8080**.
6. Confira em **Settings**: uma réplica e **Serverless desligado** (o `railway.json` já pede isso).
   Duas cópias com a mesma sessão derrubam o número.

Conferir:

```bash
curl https://SEU-DOMINIO.up.railway.app/
```

Resposta esperada: um JSON com `"status":200` e a versão `2.3.7`. Se o serviço não subir por causa do
Redis, veja nos logs se o endereço `redis.railway.internal` foi alcançado; os dois serviços precisam
estar no mesmo projeto e ambiente.

## 2. Cadastrar uma empresa

Na sua máquina, crie o arquivo `.env` nesta pasta (ele não vai para o git):

```
EVOLUTION_URL=https://SEU-DOMINIO.up.railway.app
EVOLUTION_ADMIN_KEY=<a chave global>
```

Crie a instância, apontando o webhook para a plataforma da empresa:

```bash
npm run empresa -- criar clinica-integrar --webhook https://plataforma-da-empresa.com/api/whatsapp/webhook/SEGREDO
```

O comando mostra, uma única vez, os três dados que vão para a plataforma: `EVOLUTION_URL`,
`EVOLUTION_INSTANCE` e `EVOLUTION_API_KEY` (a chave da instância, não a global).

Conecte o número:

```bash
npm run empresa -- qr clinica-integrar
```

Abra o `qr-clinica-integrar.png` e leia com o WhatsApp do número. A plataforma também pode pedir o QR
sozinha, com a chave dela, em `GET /instance/connect/<instancia>`.

Outros comandos:

```bash
npm run empresa -- listar
```

```bash
npm run empresa -- webhook clinica-integrar https://novo-endereco.com/api/whatsapp/webhook/SEGREDO
```

```bash
npm run empresa -- desconectar clinica-integrar
```

```bash
npm run empresa -- remover clinica-integrar --confirmar
```

Uma empresa com dois números usa duas instâncias (`acme-vendas`, `acme-suporte`), cada uma com a
sua chave.

## 3. Ligar a plataforma da empresa

- **Plataforma → servidor:** todas as chamadas levam o cabeçalho `apikey: <chave da instância>` e o
  nome da instância no caminho (ex.: `POST /message/sendText/clinica-integrar`).
- **Servidor → plataforma:** os eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE` e
  `QRCODE_UPDATED` chegam por POST no webhook da instância. O endereço precisa ser público, em HTTPS,
  e levar um segredo no caminho que a plataforma confere: a Evolution não assina os eventos.
- **Plataforma ↔ brain:** não muda. O brain não fala com este servidor; quem envia a mensagem ao
  cliente é a plataforma.

## 4. Operação

- **Atualizar a Evolution:** troque a tag no `Dockerfile` e faça o push. As sessões ficam no Postgres;
  o número volta sozinho depois do deploy.
- **Backup:** ative os backups do Postgres no Railway. Perder o banco obriga todas as empresas a ler
  o QR de novo.
- **Chave global vazou:** troque `AUTHENTICATION_API_KEY` no Railway. As chaves das instâncias não
  mudam.
