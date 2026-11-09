import * as api from '../api.js';
import { h, icone, avisar, folha, tentar } from '../ui.js';
import {
  reais, reaisCurto, diaDe, horaDe, periodo, rotuloPeriodo, rotuloDia, semanaCurta, ddmm, MESES, agruparPorDia, normalizar,
} from '../util.js';

// O que ela escolheu fica guardado enquanto o app está aberto.
const estado = { tipo: 'hoje', inicio: null, fim: null, aba: 'resumo', filtro: 'tudo', busca: '' };

const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['datas', 'Datas']];
const FILTROS = [['tudo', 'Tudo'], ['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['cartao', 'Cartão'], ['fiado', 'Fiado'], ['pagamentos', 'Pagamentos'], ['canceladas', 'Canceladas']];
const NOME_FORMA = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', fiado: 'Fiado' };
const NOME_PERIODO = { hoje: 'hoje', ontem: 'ontem', semana: 'na semana', mes: 'no mês', ano: 'no ano', datas: 'no período' };

export async function telaPainel({ recarregar, sair }) {
  const hoje = diaDe();
  const { inicio, fim } = estado.tipo === 'datas' ? estado : periodo(estado.tipo, hoje);

  async function escolherDatas() {
    const r = await folha((fechar) => {
      const estilo = 'width:100%;padding:0 1rem;font-size:1.1rem';
      const de = h('input', { type: 'date', value: estado.inicio || `${hoje.slice(0, 8)}01`, max: hoje, class: 'inp', style: estilo });
      const ate = h('input', { type: 'date', value: estado.fim || hoje, max: hoje, class: 'inp', style: estilo });
      const umDia = h('input', { type: 'date', value: hoje, max: hoje, class: 'inp', style: estilo });
      return [
        h('h3', null, 'Escolher data'),
        h('label', { class: 'campo', style: 'margin-top:0.6rem' }, h('span', null, 'Um dia só'), umDia),
        h('button', { type: 'button', class: 'btn', style: 'margin-bottom:1.4rem', onclick: () => { if (umDia.value) fechar({ inicio: umDia.value, fim: umDia.value }); } }, 'Ver este dia'),
        h('div', { class: 'secao' }, 'Ou um período'),
        h('label', { class: 'campo' }, h('span', null, 'De'), de),
        h('label', { class: 'campo' }, h('span', null, 'Até'), ate),
        h('button', { type: 'button', class: 'btn claro', onclick: () => {
          if (!de.value || !ate.value) { avisar('Escolha os dois dias.', 'erro'); return; }
          if (de.value > ate.value) { avisar('O primeiro dia precisa ser antes do último.', 'erro'); return; }
          const dias = (new Date(ate.value) - new Date(de.value)) / 864e5;
          if (dias > 366) { avisar('Escolha no máximo 1 ano.', 'erro'); return; }
          fechar({ inicio: de.value, fim: ate.value });
        } }, 'Ver período'),
      ];
    });
    if (r) { Object.assign(estado, { tipo: 'datas', ...r }); recarregar(); }
  }

  const chipsPeriodo = h('div', { class: 'chips rolar', role: 'group', 'aria-label': 'Período' }, PERIODOS.map(([t, nome]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(estado.tipo === t),
    onclick: () => { if (t === 'datas') escolherDatas(); else { estado.tipo = t; recarregar(); } },
  }, nome)));

  const abas = h('div', { class: 'seg', style: 'grid-template-columns:1fr 1fr;margin-top:0.6rem', role: 'group', 'aria-label': 'Ver' },
    h('button', { type: 'button', 'aria-pressed': String(estado.aba === 'resumo'), onclick: () => { estado.aba = 'resumo'; recarregar(); } }, 'Resumo'),
    h('button', { type: 'button', 'aria-pressed': String(estado.aba === 'lancamentos'), onclick: () => { estado.aba = 'lancamentos'; recarregar(); } }, 'Lançamentos'));

  const corpo = estado.aba === 'resumo'
    ? await resumo({ inicio, fim, hoje })
    : await listaLancamentos({ inicio, fim, hoje });

  return {
    topo: { titulo: 'Painel', sub: rotuloPeriodo(inicio, fim, hoje) },
    nav: 'painel',
    conteudo: [
      chipsPeriodo, abas, corpo,
      h('button', { type: 'button', class: 'link-discreto', onclick: sair }, 'Sair deste celular'),
    ],
  };
}

// ======================= RESUMO =======================

async function resumo({ inicio, fim, hoje }) {
  const d = await api.painel(inicio, fim);
  const vendido = d.na_hora + d.fiado_vendido;
  const entrou = d.na_hora + d.fiado_recebido;
  const nomeTipo = NOME_PERIODO[estado.tipo];

  let comparacao = null;
  if (d.anterior > 0) {
    const pct = Math.round(((vendido - d.anterior) / d.anterior) * 100);
    comparacao = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% comparado ao período anterior`;
  }

  // ---- vendas por dia (ou por mês, se o período for longo) ----
  let grafico = null;
  const porMes = d.por_dia.length > 62;
  const serie = porMes
    ? d.por_mes.map((x) => ({ chave: x.mes, valor: x.valor, rotulo: MESES[Number(x.mes.slice(5)) - 1].slice(0, 3), titulo: `${MESES[Number(x.mes.slice(5)) - 1]}/${x.mes.slice(0, 4)}` }))
    : d.por_dia.map((x, i) => ({
      chave: x.dia, valor: x.valor, titulo: ddmm(x.dia),
      rotulo: d.por_dia.length <= 8 ? semanaCurta(x.dia) : (i % 5 === 0 ? x.dia.slice(8) : ''),
    }));
  if (serie.length > 1) {
    const max = Math.max(...serie.map((x) => x.valor), 1);
    const melhor = serie.reduce((a, b) => (b.valor > a.valor ? b : a));
    grafico = h('div', { class: 'cartao' }, h('h4', null, porMes ? 'Vendas por mês' : 'Vendas por dia'),
      barras(serie, max),
      h('p', { class: 'nota' }, melhor.valor ? `Melhor ${porMes ? 'mês' : 'dia'}: ${melhor.titulo} (${reais(melhor.valor)})` : 'Sem vendas no período.'));
  }

  // ---- horário de movimento ----
  let horario = null;
  const horas = d.por_hora.filter((x) => x.valor > 0);
  if (horas.length) {
    const primeira = Math.min(...horas.map((x) => x.hora));
    const ultima = Math.max(...horas.map((x) => x.hora));
    const faixa = d.por_hora.filter((x) => x.hora >= primeira && x.hora <= ultima)
      .map((x) => ({ chave: x.hora, valor: x.valor, titulo: `${x.hora}h`, rotulo: `${x.hora}h` }));
    const max = Math.max(...faixa.map((x) => x.valor), 1);
    const pico = faixa.reduce((a, b) => (b.valor > a.valor ? b : a));
    horario = h('div', { class: 'cartao' }, h('h4', null, 'Horário de movimento'),
      barras(faixa, max, faixa.length > 12),
      h('p', { class: 'nota' }, `Hora que mais vende: das ${pico.chave}h às ${pico.chave + 1}h (${reais(pico.valor)})`));
  }

  // ---- formas de pagamento ----
  const formas = [['Pix', d.por_forma.pix, 'var(--vermelho)'], ['Dinheiro', d.por_forma.dinheiro, '#E2675F'], ['Cartão', d.por_forma.cartao, '#EFA49D'], ['Fiado*', d.fiado_vendido, 'var(--ambar)']];
  const maxForma = Math.max(...formas.map((f) => f[1]), 1);

  // ---- produtos ----
  function verTodosProdutos() {
    folha(() => {
      const busca = h('input', { type: 'search', placeholder: 'Procurar produto', autocomplete: 'off', 'aria-label': 'Procurar produto' });
      const lista = h('div');
      const desenhar = () => {
        const t = normalizar(busca.value);
        const vis = d.por_produto.filter((p) => !t || normalizar(p.nome).includes(t));
        lista.replaceChildren(...(vis.length ? vis.map((m) => h('div', { class: 'rank' },
          h('span', { class: 'nome' }, m.nome), h('span', { class: 'q' }, `${m.quantidade}x`), h('span', { class: 'num' }, reais(m.valor))))
          : [h('div', { class: 'vazio' }, 'Nenhum produto com esse nome vendido no período.')]));
      };
      busca.addEventListener('input', desenhar);
      desenhar();
      return [
        h('h3', null, 'Vendas por produto'),
        h('p', { class: 's' }, rotuloPeriodo(inicio, fim, hoje)),
        h('div', { class: 'busca solta', style: 'margin-bottom:0.6rem' }, icone('i-busca'), busca),
        lista,
      ];
    });
  }

  return h('div', null,
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
    horario,
    h('div', { class: 'cartao' }, h('h4', null, 'Como pagaram'),
      formas.map(([nome, v, cor]) => h('div', { class: 'forma-linha' },
        h('span', { class: 'lb', style: nome.startsWith('Fiado') ? 'color:var(--ambar)' : '' }, nome),
        h('span', { class: 'bar' }, h('i', { style: `width:${(v / maxForma) * 100}%;background:${cor}` })),
        h('span', { class: 'vl' }, reaisCurto(v)))),
      h('p', { class: 'nota' }, '* Fiado é venda, mas o dinheiro ainda não entrou no caixa.')),
    h('div', { class: 'cartao' }, h('h4', null, 'Mais vendidos'),
      d.mais_vendidos.length
        ? [d.mais_vendidos.map((m, i) => h('div', { class: 'rank' },
          h('span', { class: 'pos' }, `${i + 1}º`), h('span', { class: 'nome' }, m.nome),
          h('span', { class: 'q' }, `${m.quantidade}x`), h('span', { class: 'num' }, reaisCurto(m.valor)))),
        h('button', { type: 'button', class: 'btn claro pequeno', style: 'margin-top:0.8rem', onclick: verTodosProdutos },
          icone('i-busca'), `Ver todos os produtos (${d.por_produto.length})`)]
        : h('p', { class: 'nota' }, 'Nenhuma venda neste período.')),
    h('div', { class: 'cartao' },
      h('div', { class: 'total', style: 'margin-bottom:0.6rem' }, h('h4', { style: 'margin:0' }, 'Fiado: quem deve mais'),
        h('strong', { style: 'font-size:1.15rem;color:var(--ambar)' }, reais(d.a_receber_total))),
      d.devedores.length
        ? d.devedores.map((c) => h('a', { class: 'rank', href: `#/cliente/${c.id}`, style: 'color:inherit;text-decoration:none' },
          h('span', { class: 'nome' }, c.nome,
            h('small', { style: `display:block;font-weight:600;font-size:0.82rem;color:${c.dias > 30 ? 'var(--vermelho-escuro)' : 'var(--apagado)'}` },
              c.dias === 0 ? 'lançou hoje' : `${c.dias} ${c.dias === 1 ? 'dia' : 'dias'} sem pagar`)),
          h('span', { class: 'num' }, reais(c.saldo))))
        : h('p', { class: 'nota' }, 'Ninguém devendo. 🎉')),
  );
}

function barras(serie, max, rotulosAlternados = false) {
  return h('div', { class: 'barras', role: 'img', 'aria-label': 'Gráfico' }, serie.map((x, i) => {
    const alto = x.valor === max && x.valor > 0;
    return h('div', { class: `b ${alto ? 'alto' : ''}`, title: `${x.titulo}: ${reais(x.valor)}` },
      h('i', { style: `height:${Math.max(2, Math.round((x.valor / max) * 100))}%` }),
      rotulosAlternados && i % 2 ? '' : x.rotulo);
  }));
}

// ======================= LANÇAMENTOS =======================

async function listaLancamentos({ inicio, fim, hoje }) {
  const area = h('div');
  const resumoEl = h('div', { class: 'resumo-lanc' });
  const chips = h('div', { class: 'chips rolar', role: 'group', 'aria-label': 'Tipo', style: 'margin-top:0.9rem' });
  const input = h('input', { type: 'search', placeholder: 'Procurar: mesa, cliente, produto…', autocomplete: 'off', value: estado.busca, 'aria-label': 'Procurar lançamento' });
  let pedido = 0;

  function desenharChips() {
    chips.replaceChildren(...FILTROS.map(([t, nome]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(estado.filtro === t),
      onclick: () => { estado.filtro = t; desenharChips(); carregar(); },
    }, nome)));
  }

  function linha(x) {
    const cancelado = x.cancelado;
    const tag = cancelado ? 'Cancelada'
      : x.tipo === 'pagamento' ? `Pagou ${NOME_FORMA[x.forma] || ''}`
        : x.tipo === 'fiado' ? 'Fiado' : NOME_FORMA[x.forma];
    const classeTag = cancelado ? '' : x.tipo === 'pagamento' ? 'pagamento' : x.tipo === 'fiado' ? 'fiado' : x.forma;
    const titulo = x.tipo === 'conta' ? x.titulo : x.tipo === 'pagamento' ? `${x.cliente} pagou` : `Fiado · ${x.cliente}`;
    const detalhe = x.tipo === 'conta'
      ? [x.forma === 'fiado' && x.cliente ? `Fiado de ${x.cliente} · ` : '', x.detalhe || '']
      : [x.detalhe, x.quem ? ` · 👤 ${x.quem}` : ''];
    const href = x.tipo === 'conta' ? `#/conta/${x.id}` : `#/cliente/${x.cliente_id}`;
    return h('a', { class: `lanc ${cancelado ? 'cancelado' : ''}`, href },
      h('span', { class: 'h' }, horaDe(x.quando)),
      h('div', { class: 'meio' }, h('div', { class: 'nome' }, titulo), h('div', { class: 'det' }, detalhe)),
      h('div', { class: 'lado' },
        h('div', { class: 'v', style: x.tipo === 'pagamento' && !cancelado ? 'color:var(--verde)' : '' }, reais(x.valor)),
        h('span', { class: `tag ${classeTag}` }, tag)));
  }

  async function carregar() {
    const meu = ++pedido;
    area.style.opacity = '0.5';
    const r = await tentar(() => api.lancamentos(inicio, fim, estado.filtro, estado.busca));
    if (meu !== pedido) return;
    area.style.opacity = '';
    if (!r) return;
    resumoEl.replaceChildren(...[
      h('span', null, h('b', null, String(r.quantidade)), ` ${r.quantidade === 1 ? 'lançamento' : 'lançamentos'}`),
      h('span', null, 'Vendas ', h('b', null, reais(r.vendas))),
      r.recebido_fiado ? h('span', null, 'Fiado recebido ', h('b', { style: 'color:var(--verde)' }, reais(r.recebido_fiado))) : null,
    ].filter(Boolean));
    if (!r.itens.length) {
      area.replaceChildren(h('div', { class: 'vazio' }, h('strong', null, 'Nada encontrado'),
        estado.busca ? 'Tente outra palavra ou outro período.' : 'Nenhum lançamento neste período.'));
      return;
    }
    area.replaceChildren(...[
      ...agruparPorDia(r.itens, 'quando').flatMap(({ dia, lista }) => [h('div', { class: 'dia' }, rotuloDia(dia, hoje)), ...lista.map(linha)]),
      r.quantidade > r.itens.length ? h('p', { class: 'nota', style: 'text-align:center' }, `Mostrando os ${r.itens.length} mais recentes. Use a busca ou escolha um período menor para ver os outros.`) : null,
    ].filter(Boolean));
  }

  let espera;
  input.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.busca = input.value.trim(); carregar(); }, 350);
  });

  desenharChips();
  await carregar();
  return h('div', null,
    chips,
    h('div', { class: 'busca solta', style: 'margin-top:0.4rem' }, icone('i-busca'), input),
    resumoEl,
    area);
}
