import * as api from '../api.js';
import { h, icone, tentar, avisar } from '../ui.js';
import { reais, normalizar, ddmm, diaDe } from '../util.js';
import { folhaCliente } from './fechar.js';

export async function telaFiado({ ir }) {
  const lista = await api.clientes();
  const aReceber = lista.reduce((s, c) => s + Math.max(0, c.saldo), 0);
  lista.sort((a, b) => (b.saldo > 0) - (a.saldo > 0) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const input = h('input', { type: 'search', placeholder: 'Procurar cliente', autocomplete: 'off', 'aria-label': 'Procurar cliente' });
  const busca = h('div', { class: 'busca-caixa' }, h('div', { class: 'busca' }, icone('i-busca'), input));
  const caixa = h('div', { class: 'lista' });

  function desenhar() {
    const t = normalizar(input.value);
    const vis = lista.filter((c) => !t || normalizar(c.nome).includes(t));
    caixa.replaceChildren(...vis.map((c) => h('a', { class: 'linha', href: `#/cliente/${c.id}` },
      h('div', { class: 'ini' }, c.nome.charAt(0).toUpperCase()),
      h('div', { class: 'meio' }, h('div', { class: 'nome' }, c.nome),
        h('div', { class: 'det' }, c.ultimo_movimento ? `último: ${ddmm(diaDe(c.ultimo_movimento))}` : 'sem lançamentos')),
      h('div', { class: `valor ${c.saldo > 0 ? 'deve' : 'em-dia'}` }, c.saldo > 0 ? reais(c.saldo) : c.saldo < 0 ? `crédito ${reais(-c.saldo)}` : 'em dia'))));
    if (!vis.length) caixa.append(h('div', { class: 'vazio' }, lista.length ? 'Ninguém com esse nome.' : h('span', null, h('strong', null, 'Caderninho vazio'), 'Cadastre o primeiro cliente do fiado.')));
  }
  input.addEventListener('input', desenhar);
  desenhar();

  async function novo() {
    const dados = await folhaCliente({ nomeInicial: input.value.trim() });
    if (!dados) return;
    const c = await tentar(() => api.criarCliente(dados));
    if (c) { avisar(`✓ ${c.nome} cadastrado`); ir(`#/cliente/${c.id}`); }
  }

  return {
    topo: { titulo: 'Fiado', sub: `${reais(aReceber)} a receber`, busca },
    nav: 'fiado',
    conteudo: [caixa],
    fab: h('button', { type: 'button', class: 'fab', onclick: novo }, icone('i-mais'), 'Novo cliente'),
  };
}
