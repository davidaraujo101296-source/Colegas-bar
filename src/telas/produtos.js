import * as api from '../api.js';
import { h, icone, tentar, avisar, folhaProduto } from '../ui.js';
import { reais, codigo, buscarProdutos } from '../util.js';
import { CATEGORIAS } from '../config.js';

export async function telaProdutos({ recarregar }) {
  const produtos = await api.produtos(true);
  let categoria = 'Todos';

  const input = h('input', { type: 'search', placeholder: 'Procurar produto', autocomplete: 'off', 'aria-label': 'Procurar produto' });
  const busca = h('div', { class: 'busca-caixa' }, h('div', { class: 'busca' }, icone('i-busca'), input));
  const chips = h('div', { class: 'chips rolar', role: 'group', 'aria-label': 'Tipo' });
  const lista = h('div');

  async function editar(p) {
    const r = await folhaProduto({ produto: p });
    if (!r) return;
    if (r.remover) {
      if (await tentar(() => api.removerProduto(p.id)) !== undefined) avisar(`${p.nome} saiu do cardápio`);
    } else if (await tentar(() => api.editarProduto(p.id, r))) {
      avisar('✓ Produto salvo');
    }
    recarregar();
  }

  async function novo() {
    const r = await folhaProduto({ nomeInicial: '', subtitulo: 'O código é criado sozinho.', textoBotao: 'Salvar produto' });
    if (!r || r.remover) return;
    const p = await tentar(() => api.criarProduto(r));
    if (p) { avisar(`✓ ${p.nome} — código ${codigo(p.codigo)}`); recarregar(); }
  }

  const linha = (p) => h('button', { type: 'button', class: 'prod', onclick: () => editar(p), 'aria-label': `Editar ${p.nome}` },
    h('span', { class: 'cod' }, codigo(p.codigo)),
    h('span', { class: 'nome' }, p.nome),
    h('span', { class: 'preco' }, reais(p.preco)),
    h('span', { class: 'edit' }, icone('i-lapis')));

  function desenhar() {
    chips.replaceChildren(...['Todos', ...CATEGORIAS].map((c) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(c === categoria), onclick: () => { categoria = c; desenhar(); },
    }, c)));
    const termo = input.value.trim();
    let vis = termo ? buscarProdutos(produtos, termo, 500) : produtos;
    if (categoria !== 'Todos') vis = vis.filter((p) => p.categoria === categoria);
    if (!vis.length) {
      lista.replaceChildren(h('div', { class: 'vazio' },
        h('strong', null, produtos.length ? 'Nenhum produto encontrado' : 'Nenhum produto ainda'),
        produtos.length ? 'Tente outro nome ou código.' : 'Toque em "Novo produto" para cadastrar.'));
      return;
    }
    if (termo) { lista.replaceChildren(...vis.map(linha)); return; }
    const grupos = CATEGORIAS.map((c) => [c, vis.filter((p) => p.categoria === c).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))]).filter(([, l]) => l.length);
    lista.replaceChildren(...grupos.flatMap(([c, l]) => [h('div', { class: 'secao' }, c), ...l.map(linha)]));
  }
  input.addEventListener('input', desenhar);
  desenhar();

  return {
    topo: { titulo: 'Produtos', sub: `${produtos.length} ${produtos.length === 1 ? 'cadastrado' : 'cadastrados'}`, busca },
    nav: 'produtos',
    conteudo: [chips, lista],
    fab: h('button', { type: 'button', class: 'fab', onclick: novo }, icone('i-mais'), 'Novo produto'),
  };
}
