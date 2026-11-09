import * as api from '../api.js';
import { h, icone, tentar, avisar, avisarDesfazer, confirmar, folha, folhaProduto } from '../ui.js';
import { escolherCliente } from './fechar.js';
import { criarBusca } from '../busca.js';
import { reais, horaDe, diaDe, rotuloDia } from '../util.js';

export const nomeConta = (c) => (c.mesa ? `Mesa ${c.mesa}` : c.nome);

export async function telaConta(id, { ir, recarregar }) {
  const c = await api.conta(id);
  if (c.status !== 'aberta') return telaContaFechada(c, { ir, recarregar });

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
const EMOJI = { dinheiro: '💵', pix: '📱', cartao: '💳', fiado: '📒' };

function dataHoraTexto(ts) {
  return `${rotuloDia(diaDe(ts))} às ${horaDe(ts)}`;
}

/** Conta fechada ou cancelada: ver tudo e corrigir (trocar forma, reabrir, cancelar, restaurar). */
function telaContaFechada(c, { ir, recarregar }) {
  const nome = nomeConta(c);
  const cancelada = c.status === 'cancelada';

  async function trocar() {
    const forma = await folha((fechar) => [
      h('h3', null, 'Trocar forma de pagamento'),
      h('p', { class: 's' }, `Hoje está como ${FORMAS[c.forma]}${c.clientes?.nome ? ` (${c.clientes.nome})` : ''}.`),
      h('div', { class: 'formas' }, Object.keys(FORMAS).map((f) => h('button', {
        type: 'button', class: 'forma-btn', 'aria-pressed': String(f === c.forma), onclick: () => fechar(f),
      }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, EMOJI[f]), FORMAS[f]))),
    ]);
    if (!forma) return;
    let cliente = null;
    if (forma === 'fiado') {
      cliente = await escolherCliente();
      if (!cliente) return;
    } else if (forma === c.forma) return;
    if (await tentar(() => api.trocarForma(c.id, forma, cliente?.id ?? null)) === undefined) return;
    avisar(forma === 'fiado' ? `✓ Agora está no fiado de ${cliente.nome}` : `✓ Agora está como ${FORMAS[forma]}`);
    recarregar();
  }

  async function reabrir() {
    const ok = await confirmar(`Reabrir a conta da ${nome}?`,
      `Ela volta para as contas abertas para você mudar os itens e fechar de novo.${c.forma === 'fiado' && !cancelada ? ` Os itens saem do fiado de ${c.clientes?.nome}.` : ''}`,
      { sim: 'Sim, reabrir' });
    if (!ok) return;
    if (await tentar(() => api.reabrirConta(c.id)) === undefined) return;
    avisar('✓ Conta reaberta');
    ir(`#/conta/${c.id}`);
  }

  async function cancelar() {
    const ok = await confirmar(`Cancelar a conta da ${nome}?`,
      `Ela sai das vendas${c.forma === 'fiado' ? ` e do fiado de ${c.clientes?.nome}` : ''}. Dá para desfazer depois, no filtro "Canceladas".`,
      { sim: 'Sim, cancelar conta', nao: 'Não', perigo: true });
    if (!ok) return;
    if (await tentar(() => api.cancelarConta(c.id)) === undefined) return;
    avisarDesfazer(`Conta da ${nome} cancelada`, async () => {
      if (await tentar(() => api.restaurarConta(c.id)) !== undefined) { avisar('✓ Desfeito'); recarregar(); }
    });
    recarregar();
  }

  async function restaurar() {
    const r = await tentar(() => api.restaurarConta(c.id));
    if (r === undefined) return;
    avisar(r === 'aberta' ? '✓ Conta voltou a ficar aberta' : '✓ Conta restaurada');
    if (r === 'aberta') ir(`#/conta/${c.id}`); else recarregar();
  }

  const qtd = c.itens.reduce((s, i) => s + i.quantidade, 0);
  return {
    topo: { voltar: '#/painel', titulo: nome, sub: cancelada ? 'Conta cancelada' : 'Conta fechada' },
    conteudo: [
      h('div', { class: 'cartao info-conta' },
        h('div', null, h('span', null, 'Situação'), cancelada ? h('b', { class: 'selo cancelada' }, 'Cancelada')
          : h('b', { class: `selo ${c.forma === 'fiado' ? 'fiado' : 'paga'}` }, `${EMOJI[c.forma]} ${FORMAS[c.forma]}`)),
        c.forma === 'fiado' && c.clientes?.nome ? h('div', null, h('span', null, 'Fiado de'),
          h('a', { href: `#/cliente/${c.cliente_id}`, style: 'font-weight:800;color:var(--vermelho-escuro)' }, c.clientes.nome)) : null,
        h('div', null, h('span', null, 'Aberta'), h('b', null, dataHoraTexto(c.aberta_em))),
        c.fechada_em ? h('div', null, h('span', null, cancelada && !c.forma ? 'Cancelada' : 'Fechada'), h('b', null, dataHoraTexto(c.fechada_em))) : null,
        cancelada && c.cancelada_em && c.forma ? h('div', null, h('span', null, 'Cancelada'), h('b', null, dataHoraTexto(c.cancelada_em))) : null),
      h('div', { class: 'secao' }, `${qtd} ${qtd === 1 ? 'item' : 'itens'}`),
      c.itens.length ? h('div', { class: 'lista' }, c.itens.map((i) => h('div', { class: 'item' },
        h('div', { class: 'meio' }, h('div', { class: 'nome' }, `${i.quantidade}x ${i.nome}`),
          i.quantidade > 1 ? h('div', { class: 'det' }, `${reais(i.preco)} cada`) : null),
        h('div', { class: 'valor num' }, reais(i.preco * i.quantidade)))))
        : h('div', { class: 'vazio' }, 'Nenhum item.'),
      h('div', { class: 'secao' }, 'Corrigir'),
      h('div', { class: 'pilha', style: 'margin-top:0' },
        cancelada
          ? h('button', { type: 'button', class: 'btn verde', onclick: restaurar }, 'Desfazer cancelamento')
          : h('button', { type: 'button', class: 'btn claro', onclick: trocar }, 'Trocar forma de pagamento'),
        h('button', { type: 'button', class: 'btn claro', onclick: reabrir }, 'Reabrir conta (mudar itens)'),
        cancelada ? null : h('button', { type: 'button', class: 'btn perigo', onclick: cancelar }, 'Cancelar conta')),
    ],
    rodape: [h('div', { class: 'total' }, h('span', null, cancelada ? 'Total (cancelada)' : 'Total'), h('strong', null, reais(c.total)))],
  };
}
