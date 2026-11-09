// Funções puras (sem tela nem banco). Testadas em tests/util.test.js.

export const FUSO = 'America/Sao_Paulo';

/** 1234 → "R$ 12,34" */
export function reais(centavos) {
  return (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valor curto para gráficos: 201000 → "R$ 2.010" */
export function reaisCurto(centavos) {
  const v = Number(centavos || 0) / 100;
  return 'R$ ' + (v >= 100 || Number.isInteger(v)
    ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** "12,50", "12.5", "R$ 1.234,56", "8" → centavos. Devolve null se não der para entender. */
export function lerDinheiro(texto) {
  let s = String(texto ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** centavos → texto para campo de digitação: 1250 → "12,50" */
export const paraCampo = (centavos) => (Number(centavos || 0) / 100).toFixed(2).replace('.', ',');

/** 7 → "007" */
export const codigo = (n) => String(n).padStart(3, '0');

/** Minúsculas e sem acento, para comparar. */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Procura produtos pelo código ou pelo nome (sem ligar para acento e maiúscula).
 * Ordem: código exato, código que começa igual, nome que começa igual, palavra que começa igual, resto.
 */
export function buscarProdutos(produtos, termo, limite = 30) {
  const t = normalizar(termo);
  if (!t) return [];
  const palavras = t.split(/\s+/);
  const soNumero = /^\d+$/.test(t);
  const achados = [];
  for (const p of produtos) {
    const nome = normalizar(p.nome);
    const cod = String(p.codigo);
    let nota = null;
    if (soNumero && Number(t) === p.codigo) nota = 0;
    else if (soNumero && (cod.startsWith(t) || codigo(p.codigo).startsWith(t))) nota = 1;
    else if (palavras.every((w) => nome.includes(w))) {
      if (nome.startsWith(t)) nota = 2;
      else if (nome.split(/\s+/).some((w) => w.startsWith(palavras[0]))) nota = 3;
      else nota = 4;
    }
    if (nota !== null) achados.push({ p, nota });
  }
  achados.sort((a, b) => a.nota - b.nota || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  return achados.slice(0, limite).map((a) => a.p);
}

/** Separa o texto em pedaços marcados onde aparece o termo (para destacar na busca). */
export function destacar(texto, termo) {
  const t = normalizar(termo);
  if (!t || /^\d+$/.test(t)) return [{ texto, marca: false }];
  const base = String(texto).normalize('NFC');
  const sem = base.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Só destaca quando remover acento não muda o tamanho (o caso comum).
  if (sem.length !== base.length) return [{ texto: base, marca: false }];
  const baixo = sem.toLowerCase();
  const partes = [];
  let i = 0;
  const palavras = t.split(/\s+/).filter(Boolean);
  while (i < base.length) {
    let melhor = -1;
    let tam = 0;
    for (const w of palavras) {
      const j = baixo.indexOf(w, i);
      if (j !== -1 && (melhor === -1 || j < melhor)) { melhor = j; tam = w.length; }
    }
    if (melhor === -1) { partes.push({ texto: base.slice(i), marca: false }); break; }
    if (melhor > i) partes.push({ texto: base.slice(i, melhor), marca: false });
    partes.push({ texto: base.slice(melhor, melhor + tam), marca: true });
    i = melhor + tam;
  }
  return partes;
}

// ---------------- datas (sempre no horário de Brasília) ----------------

function partesData(data) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data)) p[x.type] = x.value;
  return p;
}

/** "AAAA-MM-DD" de hoje (ou de uma data) em Brasília. */
export function diaDe(data = new Date()) {
  const p = partesData(new Date(data));
  return `${p.year}-${p.month}-${p.day}`;
}

/** "19:42" em Brasília. */
export function horaDe(data) {
  const p = partesData(new Date(data));
  return `${p.hour}:${p.minute}`;
}

/** Soma dias a "AAAA-MM-DD". */
export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const diaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
export const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const ddmmaaaa = (dia) => `${ddmm(dia)}/${dia.slice(0, 4)}`;

/** "Sexta, 08/11" (ou "Hoje" / "Ontem"). */
export function rotuloDia(dia, hoje = diaDe()) {
  if (dia === hoje) return `Hoje, ${ddmm(dia)}`;
  if (dia === somarDias(hoje, -1)) return `Ontem, ${ddmm(dia)}`;
  return `${SEMANA[diaSemana(dia)]}, ${ddmm(dia)}`;
}
export const semanaCurta = (dia) => SEMANA_CURTA[diaSemana(dia)];

/** Período do painel. tipo: hoje | semana (segunda até hoje) | mes (dia 1 até hoje). */
export function periodo(tipo, hoje = diaDe()) {
  if (tipo === 'semana') {
    const dow = diaSemana(hoje);
    return { inicio: somarDias(hoje, -((dow + 6) % 7)), fim: hoje };
  }
  if (tipo === 'mes') return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
  if (tipo === 'ano') return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
  if (tipo === 'ontem') { const d = somarDias(hoje, -1); return { inicio: d, fim: d }; }
  return { inicio: hoje, fim: hoje };
}

/** Texto do período: "Hoje", "4 a 10 de novembro", "28/10 a 03/11". */
export function rotuloPeriodo(inicio, fim, hoje = diaDe()) {
  if (inicio === fim) return inicio === hoje ? `Hoje, ${ddmm(hoje)}` : rotuloDia(inicio, hoje);
  if (inicio.slice(0, 7) === fim.slice(0, 7)) {
    return `${Number(inicio.slice(8))} a ${Number(fim.slice(8))} de ${MESES[Number(inicio.slice(5, 7)) - 1]}`;
  }
  return `${ddmm(inicio)} a ${ddmm(fim)}${inicio.slice(0, 4) !== fim.slice(0, 4) ? `/${fim.slice(0, 4)}` : ''}`;
}

/** Começo e fim (exclusivo) de um mês em Brasília, como horário ISO. mes: 1-12. */
export function limitesMes(ano, mes) {
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01T00:00:00-03:00`;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01T00:00:00-03:00`;
  return { inicio: ini, fim };
}

/** Semana (segunda a domingo) que contém o dia, como horários ISO em Brasília. */
export function limitesSemana(dia) {
  const { inicio } = periodo('semana', dia);
  const fim = somarDias(inicio, 7);
  return { inicio: `${inicio}T00:00:00-03:00`, fim: `${fim}T00:00:00-03:00`, primeiroDia: inicio, ultimoDia: somarDias(inicio, 6) };
}

/** Soma o que cada pessoa pegou (só lançamentos com "quem pegou"). */
export function totaisPorPessoa(movimentos) {
  const mapa = new Map();
  for (const m of movimentos) {
    if (m.tipo !== 'compra' || !m.quem) continue;
    const chave = m.quem.toLowerCase();
    const t = mapa.get(chave) || { quem: m.quem, itens: 0, valor: 0 };
    t.itens += m.quantidade || 1;
    t.valor += m.valor;
    mapa.set(chave, t);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || a.quem.localeCompare(b.quem, 'pt-BR'));
}

/** Telefone para WhatsApp (wa.me): só números, com 55 do Brasil. Vazio se não tiver. */
export function telefoneWhatsApp(tel) {
  const n = String(tel ?? '').replace(/\D/g, '');
  if (n.length < 10) return '';
  return n.length <= 11 ? `55${n}` : n;
}

/** "11988776655" → "(11) 98877-6655". Se não reconhecer, devolve como veio. */
export function formatarTelefone(tel) {
  let n = String(tel ?? '').replace(/\D/g, '');
  if (n.length > 11 && n.startsWith('55')) n = n.slice(2);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(tel ?? '').trim();
}

/** Mensagem com a conta do fiado do mês, para mandar no WhatsApp. */
export function mensagemFiado({ cliente, ano, mes, periodoTexto, movimentos, saldo, bar = 'Colegas Bar' }) {
  const quando = periodoTexto || `${MESES[mes - 1]} de ${ano}`;
  const linhas = [`*${bar}* — conta do fiado`, `${cliente}, ${quando}:`, ''];
  const ordem = [...movimentos].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  for (const m of ordem) {
    const dia = ddmm(diaDe(m.criado_em));
    if (m.tipo === 'compra') {
      linhas.push(`${dia} — ${m.quantidade > 1 ? `${m.quantidade}x ` : ''}${m.descricao}${m.quem ? ` (${m.quem})` : ''}: ${reais(m.valor)}`);
    } else {
      linhas.push(`${dia} — Pagamento: −${reais(m.valor)}`);
    }
  }
  if (!ordem.length) linhas.push('Nada anotado neste período.');
  const pessoas = totaisPorPessoa(ordem);
  if (pessoas.length) {
    linhas.push('', '*Por pessoa:*');
    for (const p of pessoas) linhas.push(`${p.quem}: ${p.itens} ${p.itens === 1 ? 'item' : 'itens'} — ${reais(p.valor)}`);
  }
  linhas.push('', `*Total devendo hoje: ${reais(saldo)}*`);
  return linhas.join('\n');
}

/** Agrupa movimentos por dia (mais recente primeiro). */
export function agruparPorDia(itens, campo = 'criado_em') {
  const grupos = new Map();
  for (const it of [...itens].sort((a, b) => new Date(b[campo]) - new Date(a[campo]))) {
    const d = diaDe(it[campo]);
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(it);
  }
  return [...grupos.entries()].map(([dia, lista]) => ({ dia, lista }));
}

/** Sugestões de valor recebido em dinheiro, para calcular o troco. */
export function sugestoesTroco(total) {
  const opcoes = [total];
  for (const nota of [1000, 5000, 10000, 20000]) {
    const v = Math.ceil(total / nota) * nota;
    if (v > total && !opcoes.includes(v)) opcoes.push(v);
    if (opcoes.length >= 4) break;
  }
  return opcoes;
}
