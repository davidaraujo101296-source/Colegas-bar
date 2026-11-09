import * as api from '../api.js';
import { h, icone, tentar, avisar, folha, confirmar, campoDinheiro, escolhaChips } from '../ui.js';
import { criarBusca } from '../busca.js';
import { reais, diaDe, horaDe, rotuloDia, limitesMes, MESES, agruparPorDia, mensagemFiado, telefoneWhatsApp, ddmm, formatarTelefone } from '../util.js';
import { folhaCliente } from './fechar.js';
import { NOME_BAR } from '../config.js';

const FORMA_PG = { Dinheiro: 'dinheiro', Pix: 'pix', Cartão: 'cartao' };
const NOME_FORMA = { dinheiro: 'em dinheiro', pix: 'no Pix', cartao: 'no cartão' };
let mesVisto = null; // { id, ano, mes }

export async function telaCliente(id, { ir, recarregar }) {
  const hoje = diaDe();
  if (!mesVisto || mesVisto.id !== id) mesVisto = { id, ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) };
  const { ano, mes } = mesVisto;
  const { inicio, fim } = limitesMes(ano, mes);
  const [c, movs, primeiro] = await Promise.all([api.cliente(id), api.movimentos(id, inicio, fim), api.primeiroMovimento(id)]);

  const ehMesAtual = ano === Number(hoje.slice(0, 4)) && mes === Number(hoje.slice(5, 7));
  const primeiroMes = primeiro ? diaDe(primeiro.criado_em).slice(0, 7) : hoje.slice(0, 7);
  const atual = `${ano}-${String(mes).padStart(2, '0')}`;
  const mudarMes = (d) => {
    let m = mes + d; let a = ano;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    mesVisto = { id, ano: a, mes: m };
    recarregar();
  };

  async function lancar() {
    let lancados = 0;
    let soma = 0;
    const resumo = h('p', { class: 's' }, 'Procure o produto e toque no + para anotar.');
    await folha((fechar) => {
      const busca = criarBusca({
        flutuante: false,
        subtituloCriar: `Vai ser anotado no fiado de ${c.nome}.`,
        textoBotaoCriar: 'Criar e anotar',
        aoLancar: async (p) => {
          if (await tentar(() => api.lancarFiado(id, p.id)) === undefined) return;
          lancados += 1;
          soma += p.preco;
          resumo.textContent = `Anotado agora: ${lancados} ${lancados === 1 ? 'item' : 'itens'} · ${reais(soma)}`;
          avisar(`+1 ${p.nome} no fiado`, 'ok', 1300);
        },
      });
      setTimeout(() => busca.input.focus(), 120);
      return [
        h('h3', null, `Fiado de ${c.nome}`),
        resumo,
        busca.el,
        h('div', { class: 'pilha', style: 'margin-top:1rem' }, h('button', { type: 'button', class: 'btn escuro', onclick: () => fechar() }, icone('i-check'), 'Pronto')),
      ];
    });
    if (lancados) recarregar();
  }

  async function receber() {
    const r = await folha((fechar) => {
      const valor = campoDinheiro({ rotulo: 'Quanto pagou?' });
      const forma = escolhaChips(Object.keys(FORMA_PG), 'Dinheiro');
      return [
        h('h3', null, `Recebi de ${c.nome}`),
        h('p', { class: 's' }, c.saldo > 0 ? `Está devendo ${reais(c.saldo)}.` : 'Não está devendo nada agora.'),
        h('form', { onsubmit: (e) => {
          e.preventDefault();
          const v = valor.ler();
          if (!v) { avisar('Digite quanto ele pagou. Exemplo: 50', 'erro'); valor.input.focus(); return; }
          fechar({ valor: v, forma: FORMA_PG[forma.valor()] });
        } },
        valor.el,
        c.saldo > 0 ? h('div', { class: 'chips', style: 'margin:-0.3rem 0 1rem' },
          h('button', { type: 'button', class: 'chip', onclick: () => { valor.input.value = (c.saldo / 100).toFixed(2).replace('.', ','); } }, `Pagou tudo (${reais(c.saldo)})`)) : null,
        h('div', { class: 'campo' }, h('span', null, 'Como pagou?'), forma.el),
        h('button', { class: 'btn verde', type: 'submit' }, icone('i-check'), 'Confirmar pagamento')),
      ];
    });
    if (!r) return;
    if (await tentar(() => api.receberFiado(id, r.valor, r.forma)) !== undefined) {
      avisar(`✓ Pagamento de ${reais(r.valor)} anotado`);
      recarregar();
    }
  }

  async function editarCliente() {
    const dados = await folhaCliente({ cliente: c });
    if (!dados) return;
    if (await tentar(() => api.editarCliente(id, dados)) !== undefined) { avisar('✓ Cliente salvo'); recarregar(); }
  }

  async function apagarCliente() {
    if (c.saldo !== 0) { avisar('Só dá para apagar quando a conta estiver zerada.', 'erro'); return; }
    if (!(await confirmar(`Apagar ${c.nome} do caderninho?`, 'O histórico some da lista de clientes.', { sim: 'Sim, apagar', perigo: true }))) return;
    if (await tentar(() => api.apagarCliente(id)) !== undefined) { avisar('Cliente apagado'); ir('#/fiado'); }
  }

  async function tocarMovimento(m) {
    if (m.conta_id) { avisar('Esse fiado veio de uma conta fechada. Para acertar, lance um pagamento.', 'erro'); return; }
    const o = m.tipo === 'compra' ? `${m.quantidade > 1 ? `${m.quantidade}x ` : ''}${m.descricao}` : 'pagamento';
    if (!(await confirmar('Apagar este lançamento?', `${o} de ${reais(m.valor)} em ${ddmm(diaDe(m.criado_em))} às ${horaDe(m.criado_em)}. Use só se foi lançado errado.`, { sim: 'Sim, apagar', perigo: true }))) return;
    if (await tentar(() => api.apagarMovimento(m.id)) !== undefined) { avisar('Lançamento apagado'); recarregar(); }
  }

  function whatsapp() {
    const texto = mensagemFiado({ cliente: c.nome, ano, mes, movimentos: movs, saldo: c.saldo, bar: NOME_BAR });
    const tel = telefoneWhatsApp(c.telefone);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }

  const pegou = movs.filter((m) => m.tipo === 'compra').reduce((s, m) => s + m.valor, 0);
  const pagou = movs.filter((m) => m.tipo === 'pagamento').reduce((s, m) => s + m.valor, 0);
  const ultimoPg = c.ultimo_pagamento ? `Último pagamento: ${ddmm(diaDe(c.ultimo_pagamento))}` : 'Ainda não pagou nada';

  const historico = movs.length
    ? agruparPorDia(movs).map(({ dia, lista }) => [
      h('div', { class: 'dia' }, rotuloDia(dia, hoje)),
      lista.map((m) => h('button', { type: 'button', class: `mov ${m.tipo === 'pagamento' ? 'pg' : ''}`, onclick: () => tocarMovimento(m) },
        h('span', { class: 'h' }, horaDe(m.criado_em)),
        h('span', { class: 'nome' },
          m.tipo === 'compra' ? `${m.quantidade > 1 ? `${m.quantidade}x ` : ''}${m.descricao}` : 'Pagamento',
          m.tipo === 'pagamento' && m.forma ? h('small', null, NOME_FORMA[m.forma]) : null),
        h('span', { class: 'v' }, m.tipo === 'pagamento' ? `− ${reais(m.valor)}` : reais(m.valor)))),
    ])
    : h('div', { class: 'vazio' }, `Nada anotado em ${MESES[mes - 1]}.`);

  return {
    topo: {
      voltar: '#/fiado', titulo: c.nome, sub: c.telefone ? formatarTelefone(c.telefone) : 'sem telefone',
      acao: h('button', { type: 'button', class: 'botao-topo', 'aria-label': 'Editar cliente', onclick: editarCliente }, icone('i-lapis')),
    },
    conteudo: [
      h('div', { class: 'destaque escuro' },
        h('div', { class: 'r' }, c.saldo > 0 ? 'Está devendo' : c.saldo < 0 ? 'Tem crédito de' : 'Situação'),
        h('div', { class: 'v' }, c.saldo === 0 ? 'Em dia ✓' : reais(Math.abs(c.saldo))),
        h('div', { class: 'd' }, ultimoPg)),
      h('div', { class: 'duas', style: 'margin-top:0.7rem' },
        h('button', { type: 'button', class: 'btn', onclick: lancar }, 'Lançar fiado'),
        h('button', { type: 'button', class: 'btn verde', onclick: receber }, 'Recebi pagamento')),
      h('div', { class: 'periodo' },
        h('button', { type: 'button', 'aria-label': 'Mês anterior', disabled: atual <= primeiroMes, onclick: () => mudarMes(-1) }, icone('i-volta')),
        h('b', null, `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} ${ano}`),
        h('button', { type: 'button', 'aria-label': 'Próximo mês', disabled: ehMesAtual, onclick: () => mudarMes(1) }, icone('i-frente'))),
      h('div', { class: 'resumo-mes' }, h('span', null, `Pegou ${reais(pegou)}`), h('span', null, `Pagou ${reais(pagou)}`)),
      historico,
      h('button', { type: 'button', class: 'link-discreto', onclick: apagarCliente }, 'Apagar cliente'),
    ],
    rodape: [h('button', { type: 'button', class: 'btn claro', onclick: whatsapp },
      h('span', { style: 'color:var(--verde);display:flex' }, icone('i-zap')), `Mandar conta de ${MESES[mes - 1]} no WhatsApp`)],
    limpar: () => { if (!location.hash.startsWith(`#/cliente/${id}`)) mesVisto = null; },
  };
}
