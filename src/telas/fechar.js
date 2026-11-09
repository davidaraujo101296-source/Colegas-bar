import * as api from '../api.js';
import { h, icone, tentar, avisar, folha, campoTexto } from '../ui.js';
import { reais, lerDinheiro, sugestoesTroco, paraCampo, normalizar, formatarTelefone } from '../util.js';
import { nomeConta } from './conta.js';

const FORMAS = [['dinheiro', '💵', 'Dinheiro'], ['pix', '📱', 'Pix'], ['cartao', '💳', 'Cartão'], ['fiado', '📒', 'Fiado']];

/** Folha para cadastrar cliente (nome obrigatório, telefone opcional). */
export function folhaCliente({ cliente = null, nomeInicial = '' } = {}) {
  return folha((fechar) => {
    const nome = campoTexto({ rotulo: 'Nome', valor: cliente?.nome ?? nomeInicial, placeholder: 'Ex.: Seu Zé', max: 80 });
    const tel = campoTexto({ rotulo: 'Telefone', valor: cliente?.telefone ?? '', opcional: true, placeholder: '(00) 00000-0000', max: 30, tipo: 'tel', modo: 'tel' });
    return [
      h('h3', null, cliente ? 'Editar cliente' : 'Novo cliente'),
      h('p', { class: 's' }, cliente ? 'Mude o nome ou o telefone.' : 'Depois é só lançar o que ele pegar.'),
      h('form', { onsubmit: (e) => {
        e.preventDefault();
        if (!nome.input.value.trim()) { avisar('Escreva o nome do cliente.', 'erro'); nome.input.focus(); return; }
        fechar({ nome: nome.input.value.trim(), telefone: formatarTelefone(tel.input.value) });
      } },
      nome.el, tel.el,
      h('button', { class: 'btn', type: 'submit' }, icone('i-check'), cliente ? 'Salvar' : 'Salvar cliente')),
    ];
  });
}

/** Folha para escolher (ou cadastrar) o cliente do fiado. Devolve o cliente ou undefined. */
export async function escolherCliente({ titulo = 'Quem vai ficar devendo?' } = {}) {
  const lista = await tentar(() => api.clientes());
  if (!lista) return undefined;
  return folha((fechar) => {
    const caixa = h('div', { class: 'lista' });
    const busca = h('input', { type: 'search', placeholder: 'Procurar cliente', autocomplete: 'off', 'aria-label': 'Procurar cliente' });
    const desenhar = () => {
      const t = normalizar(busca.value);
      const vis = lista.filter((x) => !t || normalizar(x.nome).includes(t));
      caixa.replaceChildren(...vis.map((x) => h('button', { type: 'button', class: 'linha', onclick: () => fechar(x) },
        h('div', { class: 'ini' }, x.nome.charAt(0).toUpperCase()),
        h('div', { class: 'meio' }, h('div', { class: 'nome' }, x.nome), x.saldo > 0 ? h('div', { class: 'det deve' }, `Já deve ${reais(x.saldo)}`) : null))));
      if (!vis.length) caixa.append(h('div', { class: 'vazio' }, lista.length ? 'Ninguém com esse nome.' : 'Nenhum cliente cadastrado ainda.'));
    };
    busca.addEventListener('input', desenhar);
    desenhar();
    return [
      h('h3', null, titulo),
      h('div', { class: 'busca solta', style: 'margin:0.6rem 0' }, icone('i-busca'), busca),
      h('button', { type: 'button', class: 'botao-tracejado', style: 'margin:0 0 0.7rem', onclick: async () => {
        const dados = await folhaCliente({ nomeInicial: busca.value.trim() });
        if (!dados) return;
        const novo = await tentar(() => api.criarCliente(dados));
        if (novo) { avisar(`✓ ${novo.nome} cadastrado`); fechar(novo); }
      } }, icone('i-mais'), 'Cliente novo'),
      caixa,
    ];
  });
}

export async function telaFechar(id, { ir }) {
  const c = await api.conta(id);
  if (c.status !== 'aberta') { ir(`#/conta/${id}`); return null; }
  if (!c.itens.length) { ir(`#/conta/${id}`); return null; }
  const total = c.total_atual;
  const nome = nomeConta(c);

  let forma = null;
  let clienteEscolhido = null;
  const area = h('div');
  const formasEl = h('div', { class: 'formas' });
  const confirmarBtn = h('button', { type: 'button', class: 'btn verde', disabled: true }, icone('i-check'), 'Confirmar pagamento');

  function desenharFormas() {
    formasEl.replaceChildren(...FORMAS.map(([f, emoji, rotulo]) => h('button', {
      type: 'button', class: 'forma-btn', 'aria-pressed': String(forma === f),
      onclick: () => escolher(f),
    }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji), rotulo)));
  }

  function rotuloConfirmar() {
    confirmarBtn.replaceChildren(icone('i-check'),
      forma === 'fiado' ? (clienteEscolhido ? `Anotar no fiado de ${clienteEscolhido.nome}` : 'Escolha o cliente')
        : 'Confirmar pagamento');
    confirmarBtn.disabled = !forma || (forma === 'fiado' && !clienteEscolhido);
  }

  function escolher(f) {
    forma = f;
    clienteEscolhido = null;
    desenharFormas();
    if (f === 'dinheiro') desenharDinheiro();
    else if (f === 'fiado') desenharFiado();
    else area.replaceChildren();
    rotuloConfirmar();
  }

  function desenharDinheiro() {
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Opcional', autocomplete: 'off' });
    const troco = h('div', { class: 'troco', hidden: true });
    const calcular = () => {
      const v = lerDinheiro(input.value);
      troco.hidden = !v;
      if (!v) return;
      troco.className = `troco ${v < total ? 'falta' : ''}`;
      troco.replaceChildren(h('span', null, v < total ? 'Ainda faltam' : 'Troco'), h('strong', null, reais(Math.abs(v - total))));
    };
    input.addEventListener('input', calcular);
    area.replaceChildren(
      h('label', { class: 'campo', style: 'margin-top:1.1rem' }, h('span', null, 'Quanto o cliente deu? (para ver o troco)'),
        h('div', { class: 'inp' }, h('span', { class: 'pre' }, 'R$'), input)),
      h('div', { class: 'chips' }, sugestoesTroco(total).map((v) => h('button', {
        type: 'button', class: 'chip', onclick: () => { input.value = paraCampo(v); calcular(); },
      }, reais(v)))),
      troco);
  }

  async function desenharFiado() {
    area.replaceChildren(h('div', { class: 'carregando' }, h('div', { class: 'girando' })));
    const lista = await tentar(() => api.clientes());
    if (!lista || forma !== 'fiado') return;
    const caixa = h('div', { class: 'lista' });
    const busca = h('input', { type: 'search', placeholder: 'Procurar cliente', autocomplete: 'off', 'aria-label': 'Procurar cliente' });
    const desenhar = () => {
      const t = normalizar(busca.value);
      const vis = lista.filter((x) => !t || normalizar(x.nome).includes(t));
      caixa.replaceChildren(...vis.map((x) => h('button', {
        type: 'button', class: 'linha', style: clienteEscolhido?.id === x.id ? 'border-color:var(--vermelho);background:var(--vermelho-suave)' : '',
        onclick: () => { clienteEscolhido = x; desenhar(); rotuloConfirmar(); confirmarBtn.scrollIntoView({ block: 'nearest' }); },
      },
      h('div', { class: 'ini' }, clienteEscolhido?.id === x.id ? icone('i-check') : x.nome.charAt(0).toUpperCase()),
      h('div', { class: 'meio' }, h('div', { class: 'nome' }, x.nome), x.saldo > 0 ? h('div', { class: 'det deve' }, `Já deve ${reais(x.saldo)}`) : h('div', { class: 'det' }, 'Em dia')))));
      if (!vis.length) caixa.append(h('div', { class: 'vazio' }, lista.length ? 'Ninguém com esse nome.' : 'Nenhum cliente cadastrado ainda.'));
    };
    busca.addEventListener('input', desenhar);
    desenhar();
    area.replaceChildren(
      h('div', { class: 'secao' }, 'Quem vai ficar devendo?'),
      h('div', { class: 'busca solta', style: 'margin-bottom:0.7rem' }, icone('i-busca'), busca),
      h('button', { type: 'button', class: 'botao-tracejado', style: 'margin:0 0 0.7rem', onclick: async () => {
        const dados = await folhaCliente({ nomeInicial: busca.value.trim() });
        if (!dados) return;
        const novo = await tentar(() => api.criarCliente(dados));
        if (!novo) return;
        novo.saldo = 0;
        lista.unshift(novo);
        clienteEscolhido = novo;
        busca.value = '';
        desenhar();
        rotuloConfirmar();
        avisar(`✓ ${novo.nome} cadastrado`);
      } }, icone('i-mais'), 'Cliente novo'),
      caixa);
  }

  confirmarBtn.addEventListener('click', async () => {
    confirmarBtn.disabled = true;
    const r = await tentar(() => api.fecharConta(id, forma, clienteEscolhido?.id ?? null));
    if (r === undefined) { rotuloConfirmar(); return; }
    avisar(forma === 'fiado' ? `✓ Anotado no fiado de ${clienteEscolhido.nome}` : `✓ Conta da ${nome} fechada`);
    ir('#/');
  });

  desenharFormas();
  return {
    topo: { voltar: `#/conta/${id}`, titulo: `Fechar ${nome}`, sub: `${c.itens.reduce((s, i) => s + i.quantidade, 0)} itens` },
    conteudo: [
      h('div', { class: 'destaque' }, h('div', { class: 'r' }, 'Total a pagar'), h('div', { class: 'v' }, reais(total))),
      h('div', { class: 'secao' }, 'Como pagou?'),
      formasEl,
      area,
    ],
    rodape: [confirmarBtn],
  };
}
