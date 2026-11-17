#!/usr/bin/env node
// Administração das empresas no servidor de WhatsApp (Evolution API).
// Cada empresa é uma instância (um número) com a própria chave e o próprio webhook.
// Usa a chave global, que fica só com o operador: EVOLUTION_URL e EVOLUTION_ADMIN_KEY no .env.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  process.loadEnvFile();
} catch {
  // sem .env: vale o que já estiver no ambiente
}

const URL_BASE = process.env.EVOLUTION_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.EVOLUTION_ADMIN_KEY;

// Mesmos eventos que as plataformas tratam: mensagem recebida, recibo, conexão e QR.
const EVENTOS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];
const NOME_VALIDO = /^[a-z0-9][a-z0-9-]{2,49}$/;

const AJUDA = `Uso: npm run empresa -- <comando>

  criar <instancia> --webhook <url>   cria a instância da empresa e mostra a chave dela (uma vez)
  listar                              instâncias, estado da conexão e número
  qr <instancia>                      gera o QR code para conectar o número (arquivo qr-<instancia>.png)
  webhook <instancia> <url>           troca o endereço que recebe os eventos
  desconectar <instancia>             desliga o número, mantém a instância
  remover <instancia> --confirmar     apaga a instância e a sessão

<instancia>: letras minúsculas, números e hífen (ex.: clinica-integrar, acme-vendas).
Uma empresa com dois números usa duas instâncias (acme-vendas, acme-suporte).`;

function falhar(msg) {
  console.error(msg);
  process.exit(1);
}

async function chamar(metodo, caminho, corpo, chave = ADMIN_KEY) {
  let res;
  try {
    res = await fetch(URL_BASE + caminho, {
      method: metodo,
      headers: { apikey: chave, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    falhar(`O servidor não respondeu em ${URL_BASE}.`);
  }
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const m = json?.response?.message ?? json?.message ?? json?.error ?? `HTTP ${res.status}`;
    falhar(`Evolution API (${res.status}): ${Array.isArray(m) ? m.join('; ') : m}`);
  }
  return json;
}

function nome(valor) {
  if (!valor || !NOME_VALIDO.test(valor))
    falhar('Nome de instância inválido: use de 3 a 50 letras minúsculas, números e hífen.');
  return valor;
}

function urlPublica(valor) {
  let u;
  try {
    u = new URL(valor);
  } catch {
    falhar('Informe o endereço do webhook completo, com https://');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) falhar('O webhook precisa ser https.');
  return u.toString();
}

function webhook(url) {
  return { enabled: true, url, byEvents: false, base64: true, events: EVENTOS };
}

const [comando, ...args] = process.argv.slice(2);
if (!comando || comando === 'ajuda' || comando === '--help') {
  console.log(AJUDA);
  process.exit(0);
}
if (!URL_BASE || !ADMIN_KEY)
  falhar('Defina EVOLUTION_URL e EVOLUTION_ADMIN_KEY no arquivo .env (veja .env.example).');

switch (comando) {
  case 'criar': {
    const instancia = nome(args[0]);
    const i = args.indexOf('--webhook');
    if (i < 0 || !args[i + 1]) falhar('Informe --webhook <url> (o endereço da plataforma).');
    const url = urlPublica(args[i + 1]);
    // A chave da empresa nasce aqui e só abre a instância dela.
    const chave = randomBytes(24).toString('hex');
    await chamar('POST', '/instance/create', {
      instanceName: instancia,
      token: chave,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      webhook: webhook(url),
    });
    console.log(`Instância criada. Passe estes três dados para a plataforma da empresa:

  EVOLUTION_URL      ${URL_BASE}
  EVOLUTION_INSTANCE ${instancia}
  EVOLUTION_API_KEY  ${chave}

A chave não aparece de novo. Para conectar o número: npm run empresa -- qr ${instancia}`);
    break;
  }

  case 'listar': {
    const lista = await chamar('GET', '/instance/fetchInstances');
    if (!Array.isArray(lista) || !lista.length) {
      console.log('Nenhuma instância.');
      break;
    }
    console.table(
      lista.map((x) => ({
        instancia: x.name,
        estado: x.connectionStatus,
        numero: x.ownerJid ? x.ownerJid.split('@')[0] : '',
        mensagens: x._count?.Message ?? '',
      })),
    );
    break;
  }

  case 'qr': {
    const instancia = nome(args[0]);
    const r = await chamar('GET', `/instance/connect/${instancia}`);
    if (!r?.base64) {
      console.log('Sem QR code: o número já está conectado ou a instância está reiniciando.');
      break;
    }
    const arquivo = resolve(`qr-${instancia}.png`);
    writeFileSync(arquivo, Buffer.from(r.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    console.log(`QR code salvo em ${arquivo}
Abra a imagem e leia com o WhatsApp do número (Aparelhos conectados). Ele vence em cerca de 40 s;
se vencer, rode o comando de novo.`);
    break;
  }

  case 'webhook': {
    const instancia = nome(args[0]);
    const url = urlPublica(args[1]);
    await chamar('POST', `/webhook/set/${instancia}`, { webhook: webhook(url) });
    console.log(`Webhook de ${instancia} atualizado.`);
    break;
  }

  case 'desconectar': {
    const instancia = nome(args[0]);
    await chamar('DELETE', `/instance/logout/${instancia}`);
    console.log(`Número de ${instancia} desconectado. A instância continua criada.`);
    break;
  }

  case 'remover': {
    const instancia = nome(args[0]);
    if (!args.includes('--confirmar'))
      falhar(`Isso apaga a instância ${instancia} e a sessão do número. Repita com --confirmar.`);
    await chamar('DELETE', `/instance/delete/${instancia}`);
    console.log(`Instância ${instancia} removida.`);
    break;
  }

  default:
    falhar(`Comando desconhecido: ${comando}\n\n${AJUDA}`);
}
