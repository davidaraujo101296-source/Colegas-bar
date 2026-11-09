import * as api from '../api.js';
import { h, icone, tentar, avisar, avisarDesfazer, folha, confirmar, campoDinheiro, campoTexto, escolhaChips } from '../ui.js';
import { criarBusca } from '../busca.js';
import {
  reais, diaDe, horaDe, rotuloDia, limitesMes, limitesSemana, rotuloPeriodo, somarDias, MESES, agruparPorDia,
  mensagemFiado, telefoneWhatsApp, ddmm, formatarTelefone, totaisPorPessoa,
} from '../util.js';
import { folhaCliente } from './fechar.js';
import { NOME_BAR } from '../config.js';

const FORMA_PG = { Dinheiro: 'dinheiro', Pix: 'pix', Cartão: 'cartao' };
const NOME_FORMA = { dinheiro: 'em dinheiro', pix: 'no Pix', cartao: 'no cartão' };
const nomeMes = (m) => `${MESES[m - 1].charAt(0).toUpperCase()}${MESES[m - 1].slice(1)}`;

// Período escolhido na tela do cliente: por mês ou por semana.
let visto = null; // { id, modo: 'mes'|'semana', ano, mes, dia }

export async function telaCliente(id, { ir, recarregar }) {
  const hoje = diaDe();
  if (!visto || visto.id !== id) visto = { id, modo: 'mes', ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)), dia: hoje };

  let inicio; let fim; let titulo; let periodoTexto; let ehAtual; let anteriorAntes;
  if (visto.modo === 'semana') {
    const s = limitesSemana(visto.dia);
    ({ inicio, fim } = s);
    titulo = rotuloPeriodo(s.primeiroDia, s.ultimoDia, '');
    periodoTexto = `semana de ${ddmm(s.primeiroDia)} a ${ddmm(s.ultimoDia)}`;
    ehAtual = hoje >= s.primeiroDia && hoje <= s.ultimoDia;
    anteriorAntes = s.primeiroDia;
  } else {
    ({ inicio, fim } = limitesMes(visto.ano, visto.mes));
    titulo = `${nomeMes(visto.mes)} ${visto.ano}`;
    periodoTexto = `${MESES[visto.mes - 1]} de ${visto.ano}`;
    ehAtual = visto.ano === Number(hoje.slice(0, 4)) && visto.mes === Number(hoje.slice(5, 7));
    anteriorAntes = `${visto.ano}-${String(visto.mes).padStart(2, '0')}-01`;
  }

  const [c, movs, primeiro] = await Promise.all([api.cliente(id), api.movimentos(id, inicio, fim), api.primeiroMovimento(id)]);
  const primeiroDia = primeiro ? diaDe(primeiro.criado_em) : hoje;
  const temAnterior = primeiroDia < anteriorAntes;

  function mudarPeriodo(d) {
    if (visto.modo === 'semana') {
      visto.dia = somarDias(limitesSemana(visto.dia).primeiroDia, 7 * d);
    } else {
      let m = visto.mes + d; let a = visto.ano;
      if (m < 1) { m = 12; a -= 1; }
      if (m > 12) { m = 1; a += 1; }
      visto.mes = m; visto.ano = a;
    }
    recarregar();
  }
  function mudarModo(modo) {
    if (modo === visto.modo) return;
    visto = { id, modo, ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)), dia: hoje };
    recarregar();
  }

  // ---------- lançar fiado (com "Quem pegou?" opcional) ----------
  async function lancar() {
    const nomes = (await tentar(() => api.nomesQuem(id))) || [];
    let quem = '';
    let lancados = 0;
    let soma = 0;
    const resumo = h('p', { class: 's' }, 'Escolha quem pegou (se quiser) e toque no + do produto.');
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Quem pegou' });

    function desenharNomes() {
      chips.replaceChildren(
        ...nomes.map((n) => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(n === quem),
          onclick: () => { quem = quem === n ? '' : n; desenharNomes(); },
        }, n)),
        h('button', { type: 'button', class: 'chip', style: 'border-style:dashed;color:var(--vermelho-escuro)', onclick: novoNome }, icone('i-mais'), 'Novo nome'),
      );
    }
    async function novoNome() {
      const nome = await folha((fechar) => {
        const campo = campoTexto({ rotulo: 'Nome de quem pegou', placeholder: 'Ex.: Samuel', max: 40 });
        return [
          h('h3', null, 'Novo nome'),
          h('p', { class: 's' }, `Para lançar no fiado de ${c.nome}.`),
          h('form', { onsubmit: (e) => { e.preventDefault(); const v = campo.input.value.trim(); if (v) fechar(v.charAt(0).toUpperCase() + v.slice(1)); else campo.input.focus(); } },
            campo.el, h('button', { class: 'btn', type: 'submit' }, icone('i-check'), 'Usar este nome')),
        ];
      });
      // A folha do lançamento foi fechada para abrir a do nome: reabre já com o nome escolhido.
      if (nome) {
        if (!nomes.some((n) => n.toLowerCase() === nome.toLowerCase())) nomes.unshift(nome);
        quem = nomes.find((n) => n.toLowerCase() === nome.toLowerCase());
      }
      abrirFolha();
    }

    const busca = criarBusca({
      flutuante: false,
      subtituloCriar: `Vai ser anotado no fiado de ${c.nome}.`,
      textoBotaoCriar: 'Criar e anotar',
      aoLancar: async (p) => {
        if (await tentar(() => api.lancarFiado(id, p.id, quem)) === undefined) return;
        lancados += 1;
        soma += p.preco;
        resumo.textContent = `Anotado agora: ${lancados} ${lancados === 1 ? 'item' : 'itens'} · ${reais(soma)}`;
        avisar(`+1 ${p.nome}${quem ? ` para ${quem}` : ''}`, 'ok', 1500);
      },
    });

    async function abrirFolha() {
      desenharNomes();
      await folha((fechar) => {
        setTimeout(() => busca.input.focus(), 120);
        return [
          h('h3', null, `Fiado de ${c.nome}`),
          resumo,
          h('div', { class: 'campo' }, h('span', null, 'Quem pegou?', h('span', { class: 'opc' }, '(opcional)')), chips),
          busca.el,
          h('div', { class: 'pilha', style: 'margin-top:1rem' }, h('button', { type: 'button', class: 'btn escuro', onclick: () => fechar('pronto') }, icone('i-check'), 'Pronto')),
        ];
      }).then((v) => { if (v !== undefined || !document.querySelector('.vela')) terminou(); });
    }
    function terminou() { if (lancados) recarregar(); }
    abrirFolha();
  }

  // ---------- receber pagamento ----------
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

  // ---------- tocar num lançamento: ver, corrigir ou apagar ----------
  async function corrigir(m) {
    const nomes = (await tentar(() => api.nomesQuem(id))) || [];
    const daConta = !!m.conta_id;
    let qtd = m.quantidade;
    const r = await folha((fechar) => {
      const out = h('output', null, String(qtd));
      const passo = h('div', { class: 'passo' },
        h('button', { type: 'button', 'aria-label': 'Menos um', onclick: () => { if (qtd > 1) { qtd -= 1; out.textContent = qtd; } } }, '−'),
        out,
        h('button', { type: 'button', class: 'p', 'aria-label': 'Mais um', onclick: () => { qtd += 1; out.textContent = qtd; } }, '+'));
      const campo = campoTexto({ rotulo: 'Quem pegou?', valor: m.quem || '', opcional: true, placeholder: 'Ninguém', max: 40 });
      const chips = h('div', { class: 'chips', style: 'margin:-0.4rem 0 1rem' }, nomes.map((n) => h('button', {
        type: 'button', class: 'chip', onclick: () => { campo.input.value = n; },
      }, n)));
      return [
        h('h3', null, 'Corrigir lançamento'),
        h('p', { class: 's' }, `${m.descricao} · ${reais(m.valor / m.quantidade)} cada`),
        daConta ? h('p', { class: 's' }, 'Veio de uma conta: para mudar a quantidade, reabra a conta.')
          : h('div', { class: 'campo' }, h('span', null, 'Quantidade'), passo),
        campo.el, nomes.length ? chips : null,
        h('button', { type: 'button', class: 'btn', onclick: () => fechar({ qtd, quem: campo.input.value.trim() }) }, icone('i-check'), 'Salvar'),
      ];
    });
    if (!r) return;
    if (await tentar(() => api.corrigirLancamentoFiado(m.id, r.qtd, r.quem)) !== undefined) { avisar('✓ Lançamento corrigido'); recarregar(); }
  }

  async function apagar(m, modo = 'item') {
    if (await tentar(() => api.cancelarLancamentoFiado(m.id, modo)) === undefined) return;
    const texto = modo === 'conta' ? 'Conta inteira cancelada' : m.tipo === 'pagamento' ? 'Pagamento apagado' : 'Lançamento apagado';
    avisarDesfazer(texto, async () => {
      if (await tentar(() => api.restaurarLancamentoFiado(m.id)) !== undefined) { avisar('✓ Desfeito'); recarregar(); }
    });
    recarregar();
  }

  async function tocarMovimento(m) {
    const nomeContaOrigem = m.contas ? (m.contas.mesa ? `Mesa ${m.contas.mesa}` : m.contas.nome) : null;
    const titulo = m.tipo === 'compra' ? `${m.quantidade > 1 ? `${m.quantidade}x ` : ''}${m.descricao}` : 'Pagamento';
    const acao = await folha((fechar) => [
      h('h3', null, titulo),
      h('div', { class: 'cartao info-conta', style: 'margin:0.6rem 0 1rem' },
        h('div', null, h('span', null, 'Quando'), h('b', null, `${rotuloDia(diaDe(m.criado_em), hoje)} às ${horaDe(m.criado_em)}`)),
        h('div', null, h('span', null, 'Valor'), h('b', null, reais(m.valor))),
        m.tipo === 'pagamento' && m.forma ? h('div', null, h('span', null, 'Pagou'), h('b', null, NOME_FORMA[m.forma])) : null,
        m.quem ? h('div', null, h('span', null, 'Quem pegou'), h('b', null, m.quem)) : null,
        nomeContaOrigem ? h('div', null, h('span', null, 'Veio da conta'), h('b', null, nomeContaOrigem)) : null),
      h('div', { class: 'pilha', style: 'margin-top:0' },
        m.tipo === 'compra' ? h('button', { type: 'button', class: 'btn claro', onclick: () => fechar('corrigir') }, icone('i-lapis'), 'Corrigir') : null,
        m.conta_id ? [
          h('button', { type: 'button', class: 'btn perigo', onclick: () => fechar('item') }, 'Tirar só este item'),
          h('button', { type: 'button', class: 'btn perigo', onclick: () => fechar('conta') }, `Cancelar a conta inteira (${nomeContaOrigem})`),
          h('button', { type: 'button', class: 'btn claro', onclick: () => fechar('ver') }, 'Ver a conta'),
        ] : h('button', { type: 'button', class: 'btn perigo', onclick: () => fechar('item') }, m.tipo === 'pagamento' ? 'Apagar pagamento' : 'Apagar lançamento')),
    ]);
    if (acao === 'corrigir') corrigir(m);
    else if (acao === 'item') apagar(m, 'item');
    else if (acao === 'conta') apagar(m, 'conta');
    else if (acao === 'ver') ir(`#/conta/${m.conta_id}`);
  }

  function whatsapp() {
    const texto = mensagemFiado({ cliente: c.nome, periodoTexto, movimentos: movs, saldo: c.saldo, bar: NOME_BAR });
    window.open(`https://wa.me/${telefoneWhatsApp(c.telefone)}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }

  const pegou = movs.filter((m) => m.tipo === 'compra').reduce((s, m) => s + m.valor, 0);
  const pagou = movs.filter((m) => m.tipo === 'pagamento').reduce((s, m) => s + m.valor, 0);
  const pessoas = totaisPorPessoa(movs);
  const ultimoPg = c.ultimo_pagamento ? `Último pagamento: ${ddmm(diaDe(c.ultimo_pagamento))}` : 'Ainda não pagou nada';
  const nomePeriodo = visto.modo === 'semana' ? 'nesta semana' : `em ${MESES[visto.mes - 1]}`;

  const historico = movs.length
    ? agruparPorDia(movs).map(({ dia, lista }) => [
      h('div', { class: 'dia' }, rotuloDia(dia, hoje)),
      lista.map((m) => h('button', { type: 'button', class: `mov ${m.tipo === 'pagamento' ? 'pg' : ''}`, onclick: () => tocarMovimento(m) },
        h('span', { class: 'h' }, horaDe(m.criado_em)),
        h('span', { class: 'nome' },
          m.tipo === 'compra' ? `${m.quantidade > 1 ? `${m.quantidade}x ` : ''}${m.descricao}` : 'Pagamento',
          m.tipo === 'compra' && m.quem ? h('small', { class: 'quem' }, `👤 ${m.quem}`) : null,
          m.tipo === 'pagamento' && m.forma ? h('small', null, NOME_FORMA[m.forma]) : null),
        h('span', { class: 'v' }, m.tipo === 'pagamento' ? `− ${reais(m.valor)}` : reais(m.valor)))),
    ])
    : h('div', { class: 'vazio' }, `Nada anotado ${nomePeriodo}.`);

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
      h('div', { class: 'seg', style: 'grid-template-columns:1fr 1fr;margin-top:1.1rem', role: 'group', 'aria-label': 'Ver por' },
        h('button', { type: 'button', 'aria-pressed': String(visto.modo === 'mes'), onclick: () => mudarModo('mes') }, 'Por mês'),
        h('button', { type: 'button', 'aria-pressed': String(visto.modo === 'semana'), onclick: () => mudarModo('semana') }, 'Por semana')),
      h('div', { class: 'periodo' },
        h('button', { type: 'button', 'aria-label': 'Período anterior', disabled: !temAnterior, onclick: () => mudarPeriodo(-1) }, icone('i-volta')),
        h('b', null, titulo),
        h('button', { type: 'button', 'aria-label': 'Próximo período', disabled: ehAtual, onclick: () => mudarPeriodo(1) }, icone('i-frente'))),
      h('div', { class: 'resumo-mes' }, h('span', null, `Pegou ${reais(pegou)}`), h('span', null, `Pagou ${reais(pagou)}`)),
      pessoas.length ? h('div', { class: 'cartao', style: 'margin-top:0.8rem' },
        h('h4', null, `Por pessoa ${nomePeriodo}`),
        pessoas.map((p) => h('div', { class: 'rank' },
          h('span', { class: 'nome' }, p.quem),
          h('span', { class: 'q' }, `${p.itens} ${p.itens === 1 ? 'item' : 'itens'}`),
          h('span', { class: 'num' }, reais(p.valor))))) : null,
      historico,
      h('button', { type: 'button', class: 'link-discreto', onclick: apagarCliente }, 'Apagar cliente'),
    ],
    rodape: [h('button', { type: 'button', class: 'btn claro', onclick: whatsapp },
      h('span', { style: 'color:var(--verde);display:flex' }, icone('i-zap')),
      visto.modo === 'semana' ? 'Mandar conta da semana no WhatsApp' : `Mandar conta de ${MESES[visto.mes - 1]} no WhatsApp`)],
    limpar: () => { if (!location.hash.startsWith(`#/cliente/${id}`)) visto = null; },
  };
}
