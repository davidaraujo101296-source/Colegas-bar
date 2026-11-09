// Peças de tela reaproveitadas: criar elementos, ícones, avisos, janelas.

import { CATEGORIAS } from './config.js';
import { lerDinheiro, paraCampo, codigo } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Cria um elemento sem usar innerHTML (texto digitado nunca vira código). */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'disabled' || k === 'hidden' || k === 'checked') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  anexar(el, filhos);
  return el;
}

export function anexar(el, filhos) {
  for (const f of [filhos].flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : String(f));
  }
  return el;
}

export function icone(nome, classe = 'ic') {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', classe);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', `#${nome}`);
  s.append(u);
  return s;
}

// ---------- avisos rápidos ----------
let timerAviso;
export function avisar(texto, tipo = 'ok', ms = 2200) {
  const caixa = document.getElementById('avisos');
  clearTimeout(timerAviso);
  caixa.replaceChildren(h('div', { class: `aviso ${tipo}` }, texto));
  timerAviso = setTimeout(() => caixa.replaceChildren(), tipo === 'erro' ? Math.max(ms, 4500) : ms);
}

/** Aviso com botão "Desfazer" (fica 7 segundos). */
export function avisarDesfazer(texto, desfazer) {
  const caixa = document.getElementById('avisos');
  clearTimeout(timerAviso);
  const botao = h('button', { type: 'button', class: 'desfazer' }, 'Desfazer');
  botao.addEventListener('click', async () => {
    caixa.replaceChildren();
    await desfazer();
  });
  caixa.replaceChildren(h('div', { class: 'aviso com-acao' }, h('span', null, texto), botao));
  timerAviso = setTimeout(() => caixa.replaceChildren(), 7000);
}

/** Roda uma ação; se der erro, mostra a mensagem. Devolve undefined no erro. */
export async function tentar(acao) {
  try {
    return await acao();
  } catch (e) {
    avisar(e.message || 'Algo deu errado.', 'erro');
    return undefined;
  }
}

// ---------- folha: janela que sobe de baixo ----------
let folhaAberta = null;

/**
 * Abre uma folha. `montar(fechar)` devolve o conteúdo e chama fechar(valor) para encerrar.
 * Devolve uma promessa com o valor (ou undefined se ela tocar fora / voltar).
 */
export function folha(montar) {
  if (folhaAberta) folhaAberta(undefined);
  return new Promise((resolver) => {
    const vela = h('div', { class: 'vela' });
    const caixa = h('div', { class: 'folha', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'alca' }));
    const fechar = (valor) => {
      if (!vela.isConnected) return;
      vela.remove();
      folhaAberta = null;
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('hashchange', mudouTela);
      resolver(valor);
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar(undefined); };
    const mudouTela = () => fechar(undefined);
    anexar(caixa, montar(fechar));
    vela.append(caixa);
    vela.addEventListener('click', (e) => { if (e.target === vela) fechar(undefined); });
    document.addEventListener('keydown', tecla);
    window.addEventListener('hashchange', mudouTela);
    document.body.append(vela);
    folhaAberta = fechar;
    const primeiro = caixa.querySelector('input:not([type=hidden])');
    if (primeiro) setTimeout(() => primeiro.focus(), 80);
  });
}

export function fecharFolhas() { if (folhaAberta) folhaAberta(undefined); }

export function confirmar(titulo, texto, { sim = 'Sim', nao = 'Não', perigo = false } = {}) {
  return folha((fechar) => [
    h('h3', null, titulo),
    texto ? h('p', { class: 's' }, texto) : null,
    h('div', { class: 'pilha' },
      h('button', { class: `btn ${perigo ? '' : 'verde'}`, type: 'button', onclick: () => fechar(true) }, sim),
      h('button', { class: 'btn claro', type: 'button', onclick: () => fechar(false) }, nao)),
  ]).then((v) => v === true);
}

// ---------- campos ----------
export function campoTexto({ rotulo, valor = '', opcional = false, placeholder = '', max = 80, tipo = 'text', modo, auto = 'off' }) {
  const input = h('input', { type: tipo, value: valor, placeholder, maxlength: String(max), autocomplete: auto, inputmode: modo, enterkeyhint: 'done' });
  const el = h('label', { class: 'campo' },
    h('span', null, rotulo, opcional ? h('span', { class: 'opc' }, '(opcional)') : null),
    h('div', { class: 'inp' }, input));
  return { el, input };
}

export function campoDinheiro({ rotulo = 'Preço', valor = null, placeholder = '0,00' }) {
  const input = h('input', { type: 'text', inputmode: 'decimal', value: valor == null ? '' : paraCampo(valor), placeholder, autocomplete: 'off', enterkeyhint: 'done' });
  const el = h('label', { class: 'campo' }, h('span', null, rotulo), h('div', { class: 'inp' }, h('span', { class: 'pre' }, 'R$'), input));
  return { el, input, ler: () => lerDinheiro(input.value) };
}

export function escolhaChips(opcoes, atual, aoMudar) {
  let valor = atual;
  const caixa = h('div', { class: 'chips', role: 'group' });
  const desenhar = () => caixa.replaceChildren(...opcoes.map((o) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(o === valor),
    onclick: () => { valor = o; desenhar(); aoMudar?.(o); },
  }, o)));
  desenhar();
  return { el: caixa, valor: () => valor };
}

/**
 * Folha de criar/editar produto. Devolve { nome, preco, categoria } ou
 * { remover: true } ou undefined (desistiu).
 */
export function folhaProduto({ produto = null, nomeInicial = '', subtitulo = '', textoBotao = 'Salvar' } = {}) {
  return folha((fechar) => {
    const nome = campoTexto({ rotulo: 'Nome', valor: produto?.nome ?? nomeInicial, placeholder: 'Ex.: Brahma 600ml' });
    const preco = campoDinheiro({ rotulo: 'Preço', valor: produto?.preco ?? null });
    const cat = escolhaChips(CATEGORIAS, produto?.categoria ?? 'Bebidas');
    const salvar = (e) => {
      e.preventDefault();
      const v = preco.ler();
      if (!nome.input.value.trim()) { avisar('Escreva o nome do produto.', 'erro'); nome.input.focus(); return; }
      if (v === null) { avisar('Digite o preço. Exemplo: 12,50', 'erro'); preco.input.focus(); return; }
      fechar({ nome: nome.input.value.trim(), preco: v, categoria: cat.valor() });
    };
    if (!produto && nomeInicial) setTimeout(() => preco.input.focus(), 120);
    return [
      h('h3', null, produto ? 'Editar produto' : 'Novo produto'),
      h('p', { class: 's' }, produto ? `Código ${codigo(produto.codigo)}` : subtitulo),
      h('form', { onsubmit: salvar },
        nome.el, preco.el,
        h('div', { class: 'campo' }, h('span', null, 'Tipo'), cat.el),
        h('div', { class: 'pilha' },
          h('button', { class: 'btn', type: 'submit' }, icone('i-check'), textoBotao),
          produto ? h('button', { class: 'btn perigo pequeno', type: 'button', onclick: () => fechar({ remover: true }) }, 'Tirar do cardápio') : null)),
    ];
  });
}
