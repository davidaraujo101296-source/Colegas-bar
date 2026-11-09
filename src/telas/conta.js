import * as api from '../api.js';
import { h, icone, tentar, avisar, confirmar, folhaProduto } from '../ui.js';
import { criarBusca } from '../busca.js';
import { reais, horaDe } from '../util.js';

export const nomeConta = (c) => (c.mesa ? `Mesa ${c.mesa}` : c.nome);

export async function telaConta(id, { ir, recarregar }) {
  const c = await api.conta(id);
  if (c.status !== 'aberta') return telaContaFechada(c);

  const nome = nomeConta(c);
  const busca = criarBusca({
    subtituloCriar: `Vai entrar na conta: ${nome}.`,
    aoLancar: async (p) => {
      if (await tentar(() => api.lancarItem(id, p.id)) === undefined) return;
      avisar(`+1 ${p.nome}`, 'ok', 1300);
      busca.limparBusca();
      recarregar();
    },
  });
  busca.el.addEventListener('produto-mudou', () => recarregar());

  async function quantidade(item, nova) {
    if (nova === 0) {
      const ok = await confirmar(`Tirar "${item.nome}" da conta?`, null, { sim: 'Sim, tirar', perigo: true });
      if (!ok) return;
    }
    if (await tentar(() => api.mudarQuantidade(item.id, nova)) !== undefined) recarregar();
  }

  async function editar(item) {
    const produtos = await tentar(() => api.produtos());
    const p = produtos?.find((x) => x.id === item.produto_id);
    if (!p) { avisar('Esse produto foi tirado do cardápio.', 'erro'); return; }
    const r = await folhaProduto({ produto: p });
    if (!r) return;
    if (r.remover) {
      if (await tentar(() => api.removerProduto(p.id)) !== undefined) avisar('Produto tirado do cardápio (o que já foi lançado continua na conta)');
    } else if (await tentar(() => api.editarProduto(p.id, r))) {
      avisar('✓ Produto salvo');
    }
    recarregar();
  }

  async function cancelar() {
    const ok = await confirmar(`Cancelar a conta da ${nome}?`, 'A conta some e não entra nas vendas.', { sim: 'Sim, cancelar conta', nao: 'Não, voltar', perigo: true });
    if (!ok) return;
    if (await tentar(() => api.cancelarConta(id)) !== undefined) { avisar('Conta cancelada'); ir('#/'); }
  }

  const itens = c.itens.length
    ? h('div', { class: 'lista' }, c.itens.map((i) => h('div', { class: 'item' },
      h('button', { type: 'button', class: 'edit', 'aria-label': `Editar ${i.nome}`, onclick: () => editar(i) }, icone('i-lapis')),
      h('div', { class: 'meio' },
        h('div', { class: 'nome' }, i.nome),
        h('div', { class: 'det' }, i.quantidade > 1 ? `${reais(i.preco)} cada · ${reais(i.preco * i.quantidade)}` : reais(i.preco))),
      h('div', { class: 'passo' },
        h('button', { type: 'button', 'aria-label': `Tirar um ${i.nome}`, onclick: () => quantidade(i, i.quantidade - 1) }, '−'),
        h('output', null, String(i.quantidade)),
        h('button', { type: 'button', class: 'p', 'aria-label': `Mais um ${i.nome}`, onclick: () => quantidade(i, i.quantidade + 1) }, '+')))))
    : h('div', { class: 'vazio' }, h('strong', null, 'Conta vazia'), 'Procure o produto na barra lá em cima e toque no +.');

  return {
    topo: { voltar: '#/', titulo: nome, sub: `aberta às ${horaDe(c.aberta_em)}`, busca: busca.el },
    conteudo: [
      h('div', { class: 'secao' }, 'Na conta'),
      itens,
      h('button', { type: 'button', class: 'link-discreto', onclick: cancelar }, 'Cancelar esta conta'),
    ],
    rodape: [
      h('div', { class: 'total' }, h('span', null, c.mesa ? 'Total da mesa' : 'Total'), h('strong', null, reais(c.total_atual))),
      h('button', { type: 'button', class: 'btn', disabled: !c.itens.length, onclick: () => ir(`#/conta/${id}/fechar`) }, 'Fechar conta'),
    ],
    depois: () => { if (!c.itens.length) busca.input.focus(); },
  };
}

const FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', fiado: 'Fiado' };

function telaContaFechada(c) {
  const nome = nomeConta(c);
  const situacao = c.status === 'cancelada' ? 'Cancelada' : `Paga no ${FORMAS[c.forma]}${c.clientes?.nome ? ` — ${c.clientes.nome}` : ''}`;
  return {
    topo: { voltar: '#/painel', titulo: nome, sub: situacao },
    conteudo: [
      h('div', { class: 'lista' }, c.itens.map((i) => h('div', { class: 'item' },
        h('div', { class: 'meio' }, h('div', { class: 'nome' }, `${i.quantidade}x ${i.nome}`)),
        h('div', { class: 'valor num' }, reais(i.preco * i.quantidade))))),
    ],
    rodape: [h('div', { class: 'total' }, h('span', null, 'Total'), h('strong', null, reais(c.total)))],
  };
}
