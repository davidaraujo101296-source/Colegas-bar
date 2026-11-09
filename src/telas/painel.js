import * as api from '../api.js';
import { h, icone, avisar, folha } from '../ui.js';
import { reais, reaisCurto, diaDe, periodo, rotuloPeriodo, semanaCurta, ddmm } from '../util.js';

let escolha = { tipo: 'hoje', inicio: null, fim: null };

export async function telaPainel({ recarregar, sair }) {
  const hoje = diaDe();
  const { inicio, fim } = escolha.tipo === 'datas' ? escolha : periodo(escolha.tipo, hoje);
  const d = await api.painel(inicio, fim);

  const vendido = d.na_hora + d.fiado_vendido;
  const entrou = d.na_hora + d.fiado_recebido;
  const nomeTipo = { hoje: 'hoje', semana: 'na semana', mes: 'no mês', datas: 'no período' }[escolha.tipo];

  async function escolherDatas() {
    const r = await folha((fechar) => {
      const de = h('input', { type: 'date', value: escolha.inicio || somarMes(hoje), max: hoje, class: 'inp', style: 'width:100%;padding:0 1rem;font-size:1.1rem' });
      const ate = h('input', { type: 'date', value: escolha.fim || hoje, max: hoje, class: 'inp', style: 'width:100%;padding:0 1rem;font-size:1.1rem' });
      return [
        h('h3', null, 'Escolher datas'),
        h('p', { class: 's' }, 'Veja as vendas entre dois dias.'),
        h('label', { class: 'campo' }, h('span', null, 'De'), de),
        h('label', { class: 'campo' }, h('span', null, 'Até'), ate),
        h('button', { type: 'button', class: 'btn', onclick: () => {
          if (!de.value || !ate.value) { avisar('Escolha os dois dias.', 'erro'); return; }
          if (de.value > ate.value) { avisar('O primeiro dia precisa ser antes do último.', 'erro'); return; }
          fechar({ inicio: de.value, fim: ate.value });
        } }, icone('i-check'), 'Ver vendas'),
      ];
    });
    if (r) { escolha = { tipo: 'datas', ...r }; recarregar(); }
  }

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' },
    [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['datas', 'Datas']].map(([t, nome]) => h('button', {
      type: 'button', 'aria-pressed': String(escolha.tipo === t),
      onclick: () => { if (t === 'datas') escolherDatas(); else { escolha = { tipo: t }; recarregar(); } },
    }, nome)));

  let comparacao = null;
  if (d.anterior > 0) {
    const pct = Math.round(((vendido - d.anterior) / d.anterior) * 100);
    comparacao = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% comparado ao período anterior`;
  }

  // gráfico por dia (até 62 dias)
  let grafico = null;
  if (d.por_dia.length > 1 && d.por_dia.length <= 62) {
    const max = Math.max(...d.por_dia.map((x) => x.valor), 1);
    const poucos = d.por_dia.length <= 8;
    grafico = h('div', { class: 'cartao' }, h('h4', null, 'Vendas por dia'),
      h('div', { class: 'barras', role: 'img', 'aria-label': 'Gráfico de vendas por dia' }, d.por_dia.map((x) => {
        const alto = x.valor === max && x.valor > 0;
        return h('div', { class: `b ${alto ? 'alto' : ''}`, title: `${ddmm(x.dia)}: ${reais(x.valor)}` },
          h('i', { style: `height:${Math.max(2, Math.round((x.valor / max) * 100))}%` }),
          poucos ? semanaCurta(x.dia) : (Number(x.dia.slice(8)) % 5 === 1 ? x.dia.slice(8) : ''));
      })),
      h('p', { class: 'nota' }, `Melhor dia: ${(() => { const m = d.por_dia.reduce((a, b) => (b.valor > a.valor ? b : a)); return m.valor ? `${ddmm(m.dia)} (${reais(m.valor)})` : '—'; })()}`));
  }

  const formas = [['Pix', d.por_forma.pix, 'var(--vermelho)'], ['Dinheiro', d.por_forma.dinheiro, '#E2675F'], ['Cartão', d.por_forma.cartao, '#EFA49D'], ['Fiado*', d.fiado_vendido, 'var(--ambar)']];
  const maxForma = Math.max(...formas.map((f) => f[1]), 1);

  return {
    topo: { titulo: 'Painel', sub: rotuloPeriodo(inicio, fim, hoje) },
    nav: 'painel',
    conteudo: [
      seg,
      h('div', { class: 'destaque', style: 'margin-top:0.9rem' },
        h('div', { class: 'r' }, `Vendido ${nomeTipo}`), h('div', { class: 'v' }, reais(vendido)),
        comparacao ? h('div', { class: 'd' }, comparacao) : null),
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('div', { class: 'r' }, 'Pago na hora'), h('div', { class: 'v', style: 'color:var(--verde)' }, reaisCurto(d.na_hora))),
        h('div', { class: 'kpi' }, h('div', { class: 'r' }, 'Fiado (a receber)'), h('div', { class: 'v', style: 'color:var(--ambar)' }, reaisCurto(d.fiado_vendido))),
        h('div', { class: 'kpi' }, h('div', { class: 'r' }, 'Contas fechadas'), h('div', { class: 'v' }, String(d.contas_fechadas))),
        h('div', { class: 'kpi' }, h('div', { class: 'r' }, 'Gasto médio por conta'), h('div', { class: 'v' }, reaisCurto(d.gasto_medio)))),
      h('div', { class: 'cartao', style: 'margin-top:0.7rem' },
        h('h4', null, 'Dinheiro que entrou'),
        h('div', { class: 'total' }, h('span', null, 'Total no caixa'), h('strong', { style: 'font-size:1.6rem' }, reais(entrou))),
        h('p', { class: 'nota' }, d.fiado_recebido ? `Inclui ${reais(d.fiado_recebido)} de fiado que foi pago ${nomeTipo}.` : 'Nenhum fiado foi pago neste período.')),
      grafico,
      h('div', { class: 'cartao' }, h('h4', null, 'Como pagaram'),
        formas.map(([nome, v, cor]) => h('div', { class: 'forma-linha' },
          h('span', { class: 'lb', style: nome.startsWith('Fiado') ? 'color:var(--ambar)' : '' }, nome),
          h('span', { class: 'bar' }, h('i', { style: `width:${(v / maxForma) * 100}%;background:${cor}` })),
          h('span', { class: 'vl' }, reaisCurto(v)))),
        h('p', { class: 'nota' }, '* Fiado é venda, mas o dinheiro ainda não entrou no caixa.')),
      h('div', { class: 'cartao' }, h('h4', null, 'Mais vendidos'),
        d.mais_vendidos.length
          ? d.mais_vendidos.map((m, i) => h('div', { class: 'rank' },
            h('span', { class: 'pos' }, `${i + 1}º`), h('span', { class: 'nome' }, m.nome),
            h('span', { class: 'q' }, `${m.quantidade}x`), h('span', { class: 'num' }, reaisCurto(m.valor))))
          : h('p', { class: 'nota' }, 'Nenhuma venda neste período.')),
      h('div', { class: 'cartao' }, h('div', { class: 'total' }, h('span', null, 'Fiado a receber (todos os clientes)'),
        h('strong', { style: 'font-size:1.3rem;color:var(--ambar)' }, reais(d.a_receber_total)))),
      h('button', { type: 'button', class: 'link-discreto', onclick: sair }, 'Sair deste celular'),
    ],
  };
}

function somarMes(dia) {
  return `${dia.slice(0, 8)}01`;
}
