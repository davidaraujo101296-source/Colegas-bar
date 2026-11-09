import './estilo.css';
import * as api from './api.js';
import { h, icone, avisar, tentar, fecharFolhas } from './ui.js';
import { NOME_BAR } from './config.js';
import { telaContas } from './telas/contas.js';
import { telaConta } from './telas/conta.js';
import { telaFechar } from './telas/fechar.js';
import { telaProdutos } from './telas/produtos.js';
import { telaFiado } from './telas/fiado.js';
import { telaCliente } from './telas/cliente.js';
import { telaPainel } from './telas/painel.js';
import { telaEntrar, telaCriarSenha } from './telas/entrar.js';

const app = document.getElementById('app');

// ---------------- tamanho da letra ----------------
const TAMANHOS = [15, 16.5, 18, 20.5, 23];
const NOMES = ['Pequena', 'Normal', 'Grande', 'Maior', 'Enorme'];
function tamanhoAtual() {
  try {
    const n = parseInt(localStorage.getItem('tamanhoLetra'), 10);
    if (n >= 0 && n < TAMANHOS.length) return n;
  } catch { /* sem armazenamento */ }
  return 2;
}
function mudarLetra(delta) {
  const n = Math.max(0, Math.min(TAMANHOS.length - 1, tamanhoAtual() + delta));
  document.documentElement.style.fontSize = `${TAMANHOS[n]}px`;
  try { localStorage.setItem('tamanhoLetra', String(n)); } catch { /* ok */ }
  avisar(`Letra: ${NOMES[n]}`, 'ok', 1100);
  document.querySelectorAll('[data-letra="-"]').forEach((b) => { b.disabled = n === 0; });
  document.querySelectorAll('[data-letra="+"]').forEach((b) => { b.disabled = n === TAMANHOS.length - 1; });
}

function botoesLetra() {
  const n = tamanhoAtual();
  return h('div', { class: 'letra', role: 'group', 'aria-label': 'Tamanho da letra' },
    h('button', { type: 'button', 'data-letra': '-', 'aria-label': 'Letra menor', disabled: n === 0, onclick: () => mudarLetra(-1) }, 'A−'),
    h('button', { type: 'button', 'data-letra': '+', 'aria-label': 'Letra maior', disabled: n === TAMANHOS.length - 1, onclick: () => mudarLetra(1) }, 'A+'));
}

// ---------------- moldura das telas ----------------
const ABAS = [
  ['contas', '#/', 'i-conta', 'Contas'],
  ['fiado', '#/fiado', 'i-livro', 'Fiado'],
  ['produtos', '#/produtos', 'i-tag', 'Produtos'],
  ['painel', '#/painel', 'i-graf', 'Painel'],
];

function montarTopo(t) {
  const esquerda = t.voltar
    ? [h('a', { class: 'voltar', href: t.voltar, 'aria-label': 'Voltar' }, icone('i-volta')),
      h('div', { class: 'titulo-topo' }, t.titulo, t.sub ? h('small', null, t.sub) : null)]
    : t.marca
      ? [h('div', { class: 'marca' }, (() => { const s = icone('logo', ''); return s; })(),
        h('div', { class: 'marca-txt' }, 'Colegas', h('span', null, 'BAR')))]
      : [h('div', { class: 'titulo-topo' }, t.titulo, t.sub ? h('small', null, t.sub) : null)];
  return h('header', { class: 'topo' },
    h('div', { class: 'topo-linha' }, esquerda, t.acao || null, botoesLetra()),
    t.busca || null);
}

function montarNav(ativa) {
  return h('nav', { class: 'nav', 'aria-label': 'Menu' }, ABAS.map(([id, href, ic, nome]) =>
    h('a', { href, class: id === ativa ? 'ativo' : '', 'aria-current': id === ativa ? 'page' : null },
      h('span', { class: 'ic-caixa' }, icone(ic)), nome)));
}

// ---------------- rotas ----------------
const ROTAS = [
  [/^#?\/?$/, telaContas],
  [/^#\/conta\/(\d+)$/, telaConta],
  [/^#\/conta\/(\d+)\/fechar$/, telaFechar],
  [/^#\/produtos$/, telaProdutos],
  [/^#\/fiado$/, telaFiado],
  [/^#\/cliente\/(\d+)$/, telaCliente],
  [/^#\/painel$/, telaPainel],
];

let limparAnterior = null;
let versao = 0;

export function ir(destino) {
  if (location.hash === destino || (destino === '#/' && !location.hash)) mostrar();
  else location.hash = destino;
}
export const recarregarTela = () => mostrar({ manterRolagem: true });

async function mostrar({ manterRolagem = false } = {}) {
  const minha = ++versao;
  const rolagem = window.scrollY;
  fecharFolhas();
  if (limparAnterior) { limparAnterior(); limparAnterior = null; }
  const hash = location.hash || '#/';
  const rota = ROTAS.find(([re]) => re.test(hash)) || ROTAS[0];
  const params = hash.match(rota[0])?.slice(1) || [];
  if (!manterRolagem) app.replaceChildren(h('div', { class: 'carregando' }, h('div', { class: 'girando' }), 'Carregando…'));
  let tela;
  try {
    tela = await rota[1](...params.map(Number), { ir, recarregar: recarregarTela, sair: sairDoSistema });
  } catch (e) {
    if (minha !== versao) return;
    if (/sessão expirou/i.test(e.message)) { iniciar(); return; }
    app.replaceChildren(
      montarTopo({ marca: true }),
      h('div', { class: 'conteudo' },
        h('div', { class: 'vazio' }, h('strong', null, 'Não deu para abrir.'), e.message),
        h('div', { class: 'pilha' },
          h('button', { class: 'btn', type: 'button', onclick: () => mostrar() }, 'Tentar de novo'),
          h('a', { class: 'btn claro', href: '#/' }, 'Voltar ao início'))));
    return;
  }
  if (minha !== versao || !tela) return;
  document.title = tela.topo?.titulo ? `${tela.topo.titulo} · ${NOME_BAR}` : NOME_BAR;
  app.replaceChildren(...[
    montarTopo(tela.topo || { marca: true }),
    h('main', { class: `conteudo ${tela.rodape ? 'com-rodape' : ''}` }, tela.conteudo),
    tela.fab,
    tela.rodape ? h('div', { class: 'rodape' }, tela.rodape) : null,
    tela.nav ? montarNav(tela.nav) : null,
  ].filter(Boolean));
  limparAnterior = tela.limpar || null;
  window.scrollTo(0, manterRolagem ? rolagem : 0);
  tela.depois?.();
}

window.addEventListener('hashchange', () => mostrar());

// ---------------- entrada ----------------
async function iniciar() {
  const usuario = await api.usuarioAtual();
  if (!usuario) {
    app.replaceChildren(telaEntrar({ aoEntrar: iniciar }));
    return;
  }
  if (usuario.user_metadata?.trocar_senha) {
    app.replaceChildren(telaCriarSenha({ aoTerminar: iniciar }));
    return;
  }
  mostrar();
}

export async function sairDoSistema() {
  await tentar(() => api.sair());
  location.hash = '#/';
  iniciar();
}

api.sb.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') iniciar();
});

iniciar();
