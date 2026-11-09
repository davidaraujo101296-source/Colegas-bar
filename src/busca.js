// Barra de busca de produtos: por código ou nome, com botão de lançar (+),
// lápis para editar e "Criar" quando não acha.

import * as api from './api.js';
import { h, icone, tentar, avisar, folhaProduto } from './ui.js';
import { buscarProdutos, destacar, reais, codigo } from './util.js';

/**
 * @param {object} op
 * @param {(produto) => Promise<any>} op.aoLancar   chamado no "+"
 * @param {string} [op.placeholder]
 * @param {boolean} [op.flutuante=true]  lista aparece por cima (no topo) ou dentro da página
 * @param {string} [op.textoCriar]       texto do botão de criar (padrão: Criar "nome")
 * @param {string} [op.subtituloCriar]   frase da folha de criar
 */
export function criarBusca({ aoLancar, placeholder = 'Código ou nome do produto', flutuante = true, subtituloCriar = '', textoBotaoCriar = 'Criar e lançar' }) {
  const input = h('input', {
    type: 'search', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'search', 'aria-label': 'Procurar produto por código ou nome',
  });
  const limpar = h('button', { type: 'button', class: 'limpar', 'aria-label': 'Limpar busca', hidden: true }, icone('i-x'));
  const lista = h('div', { class: `resultados ${flutuante ? '' : 'dentro'}`, hidden: true });
  const el = h('div', { class: 'busca-caixa' },
    h('div', { class: `busca ${flutuante ? '' : 'solta'}` }, icone('i-busca'), input, limpar),
    lista);

  let produtos = [];
  let ocupado = false;

  async function carregar(forcar = false) {
    const r = await tentar(() => api.produtos(forcar));
    if (r) produtos = r;
  }

  function linhaProduto(p, termo) {
    const nome = h('span', { class: 'nome' }, destacar(p.nome, termo).map((x) => (x.marca ? h('mark', null, x.texto) : x.texto)));
    const botaoMais = h('button', { type: 'button', class: 'mais', 'aria-label': `Lançar ${p.nome}` }, icone('i-mais'));
    botaoMais.addEventListener('click', async () => {
      if (ocupado) return;
      ocupado = true;
      botaoMais.disabled = true;
      await aoLancar(p);
      botaoMais.disabled = false;
      ocupado = false;
    });
    return h('div', { class: 'res' },
      h('span', { class: 'cod' }, codigo(p.codigo)),
      h('div', { class: 'meio' }, nome, h('span', { class: 'preco' }, reais(p.preco))),
      h('button', { type: 'button', class: 'edit', 'aria-label': `Editar ${p.nome}`, onclick: () => editar(p) }, icone('i-lapis')),
      botaoMais);
  }

  async function editar(p) {
    const r = await folhaProduto({ produto: p });
    if (!r) return;
    if (r.remover) {
      if (await tentar(() => api.removerProduto(p.id)) !== undefined) avisar('Produto tirado do cardápio');
    } else if (await tentar(() => api.editarProduto(p.id, r))) {
      avisar('✓ Produto salvo');
    }
    await carregar(true);
    desenhar();
    el.dispatchEvent(new CustomEvent('produto-mudou'));
  }

  async function criar(nomeDigitado) {
    const r = await folhaProduto({ nomeInicial: nomeDigitado, subtitulo: subtituloCriar, textoBotao: textoBotaoCriar });
    if (!r || r.remover) return;
    const p = await tentar(() => api.criarProduto(r));
    if (!p) return;
    avisar(`✓ ${p.nome} criado com o código ${codigo(p.codigo)}`);
    await carregar(true);
    await aoLancar(p);
    input.value = '';
    desenhar();
  }

  function nomeBonito(t) {
    const s = t.trim().replace(/\s+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function desenhar() {
    const termo = input.value;
    limpar.hidden = !termo;
    if (!termo.trim()) { lista.hidden = true; lista.replaceChildren(); return; }
    const achados = buscarProdutos(produtos, termo);
    const nomeNovo = nomeBonito(termo);
    const podeCriar = !/^\d+$/.test(termo.trim());
    lista.replaceChildren(...[
      ...(achados.length ? achados.map((p) => linhaProduto(p, termo)) : [h('div', { class: 'res-vazio' }, 'Não achei nenhum produto com esse nome ou código.')]),
      podeCriar ? h('button', { type: 'button', class: 'criar', onclick: () => criar(nomeNovo) },
        h('span', { class: 'mais' }, icone('i-mais')), `Criar "${nomeNovo}"`) : null,
    ].filter(Boolean));
    lista.hidden = false;
  }

  input.addEventListener('input', desenhar);
  input.addEventListener('focus', () => carregar().then(desenhar));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; desenhar(); input.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const primeiro = buscarProdutos(produtos, input.value)[0];
      // Enter lança direto só se o código digitado for exato.
      if (primeiro && /^\d+$/.test(input.value.trim()) && Number(input.value) === primeiro.codigo) aoLancar(primeiro);
    }
  });
  limpar.addEventListener('click', () => { input.value = ''; desenhar(); input.focus(); });
  carregar();

  return { el, input, limparBusca: () => { input.value = ''; desenhar(); }, recarregar: () => carregar(true) };
}
