import * as api from '../api.js';
import { h, icone, tentar, avisar, folha, campoTexto } from '../ui.js';
import { criarBusca } from '../busca.js';
import { reais, horaDe } from '../util.js';
import { QTD_MESAS } from '../config.js';

export async function telaContas({ ir }) {
  const abertas = await api.contasAbertas();
  const porMesa = new Map(abertas.filter((c) => c.mesa).map((c) => [c.mesa, c]));
  const comNome = abertas.filter((c) => !c.mesa);

  async function abrirMesa(n) {
    const existente = porMesa.get(n);
    if (existente) return ir(`#/conta/${existente.id}`);
    const id = await tentar(() => api.abrirConta({ mesa: n }));
    if (id) ir(`#/conta/${id}`);
    return undefined;
  }

  async function novaContaNome() {
    const nome = await folha((fechar) => {
      const campo = campoTexto({ rotulo: 'Nome', placeholder: 'Ex.: João da oficina', max: 40 });
      return [
        h('h3', null, 'Nova conta'),
        h('p', { class: 's' }, 'Para quem não está numa mesa.'),
        h('form', { onsubmit: (e) => { e.preventDefault(); if (campo.input.value.trim()) fechar(campo.input.value.trim()); else campo.input.focus(); } },
          campo.el,
          h('button', { class: 'btn', type: 'submit' }, icone('i-check'), 'Abrir conta')),
      ];
    });
    if (!nome) return;
    const mesmo = comNome.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
    if (mesmo) { avisar(`${mesmo.nome} já tem conta aberta`); ir(`#/conta/${mesmo.id}`); return; }
    const id = await tentar(() => api.abrirConta({ nome }));
    if (id) ir(`#/conta/${id}`);
  }

  // A busca do início lança no Balcão (venda rápida).
  const busca = criarBusca({
    subtituloCriar: 'Vai entrar na conta do Balcão.',
    aoLancar: async (p) => {
      let balcao = comNome.find((c) => c.nome === 'Balcão');
      const id = balcao?.id ?? await tentar(() => api.abrirConta({ nome: 'Balcão' }));
      if (!id) return;
      if (await tentar(() => api.lancarItem(id, p.id)) === undefined) return;
      avisar(`+1 ${p.nome} no Balcão`);
      ir(`#/conta/${id}`);
    },
  });

  const mesas = Array.from({ length: QTD_MESAS }, (_, i) => i + 1).map((n) => {
    const aberta = porMesa.get(n);
    const c = aberta && aberta.qtd_itens > 0 ? aberta : null;
    return h('button', { type: 'button', class: `mesa ${c ? 'ocupada' : ''}`, onclick: () => abrirMesa(n), 'aria-label': c ? `Mesa ${n}, ${reais(c.total)}` : `Mesa ${n}, livre` },
      h('div', { class: 'n' }, h('small', null, 'MESA'), String(n)),
      h('div', { class: 'st' }, c ? reais(c.total) : 'livre'));
  });

  return {
    topo: { marca: true, titulo: 'Contas', busca: busca.el },
    nav: 'contas',
    conteudo: [
      h('div', { class: 'secao' }, 'Mesas'),
      h('div', { class: 'mesas' }, mesas),
      h('div', { class: 'secao' }, 'Contas por nome'),
      comNome.length
        ? h('div', { class: 'lista' }, comNome.map((c) => h('a', { class: 'linha', href: `#/conta/${c.id}` },
          h('div', { class: 'ini' }, c.nome.charAt(0).toUpperCase()),
          h('div', { class: 'meio' }, h('div', { class: 'nome' }, c.nome),
            h('div', { class: 'det' }, `${c.qtd_itens} ${c.qtd_itens === 1 ? 'item' : 'itens'} · desde ${horaDe(c.aberta_em)}`)),
          h('div', { class: 'valor' }, reais(c.total)))))
        : null,
      h('button', { type: 'button', class: 'botao-tracejado', onclick: novaContaNome }, icone('i-mais'), 'Nova conta com nome'),
    ],
  };
}
