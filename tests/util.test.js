import { describe, it, expect } from 'vitest';
import {
  reais, lerDinheiro, paraCampo, codigo, buscarProdutos, destacar, diaDe, horaDe, somarDias, periodo,
  rotuloPeriodo, limitesMes, telefoneWhatsApp, mensagemFiado, agruparPorDia, sugestoesTroco, rotuloDia,
} from '../src/util.js';

const nbsp = (s) => s.replace(/ /g, ' ');

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(nbsp(reais(1250))).toBe('R$ 12,50');
    expect(nbsp(reais(123456))).toBe('R$ 1.234,56');
  });
  it('entende o que ela digita', () => {
    expect(lerDinheiro('12,50')).toBe(1250);
    expect(lerDinheiro('12.5')).toBe(1250);
    expect(lerDinheiro('8')).toBe(800);
    expect(lerDinheiro('R$ 1.234,56')).toBe(123456);
    expect(lerDinheiro('1.000')).toBe(100000);
    expect(lerDinheiro('')).toBe(null);
    expect(lerDinheiro('abc')).toBe(null);
    expect(lerDinheiro('12,345')).toBe(null);
  });
  it('volta para o campo', () => expect(paraCampo(800)).toBe('8,00'));
  it('sugere notas para o troco', () => expect(sugestoesTroco(4250)).toEqual([4250, 5000, 10000, 20000]));
});

describe('busca de produtos', () => {
  const produtos = [
    { codigo: 12, nome: 'Brahma 600ml' },
    { codigo: 13, nome: 'Brahma lata' },
    { codigo: 120, nome: 'Água sem gás' },
    { codigo: 40, nome: 'Porção de calabresa' },
    { codigo: 41, nome: 'Pastel de queijo' },
  ];
  it('acha pelo código exato primeiro', () => {
    expect(buscarProdutos(produtos, '12').map((p) => p.codigo)).toEqual([12, 120]);
    expect(buscarProdutos(produtos, '012')[0].codigo).toBe(12);
  });
  it('acha pelo nome sem ligar para acento e maiúscula', () => {
    expect(buscarProdutos(produtos, 'agua')[0].nome).toBe('Água sem gás');
    expect(buscarProdutos(produtos, 'PORCAO')[0].nome).toBe('Porção de calabresa');
    expect(buscarProdutos(produtos, 'brah').map((p) => p.codigo)).toEqual([12, 13]);
  });
  it('aceita palavras fora de ordem', () => {
    expect(buscarProdutos(produtos, 'queijo pastel')[0].nome).toBe('Pastel de queijo');
  });
  it('não acha o que não existe', () => expect(buscarProdutos(produtos, 'feijoada')).toEqual([]));
  it('destaca o pedaço encontrado', () => {
    expect(destacar('Brahma lata', 'brah')).toEqual([{ texto: 'Brah', marca: true }, { texto: 'ma lata', marca: false }]);
  });
  it('código com 3 dígitos', () => expect(codigo(7)).toBe('007'));
});

describe('datas no horário de Brasília', () => {
  it('converte UTC para o dia e hora certos', () => {
    expect(diaDe('2026-11-09T02:30:00Z')).toBe('2026-11-08');
    expect(horaDe('2026-11-09T02:30:00Z')).toBe('23:30');
  });
  it('períodos do painel', () => {
    expect(periodo('hoje', '2026-11-12')).toEqual({ inicio: '2026-11-12', fim: '2026-11-12' });
    expect(periodo('semana', '2026-11-12')).toEqual({ inicio: '2026-11-09', fim: '2026-11-12' }); // quinta → segunda
    expect(periodo('semana', '2026-11-15')).toEqual({ inicio: '2026-11-09', fim: '2026-11-15' }); // domingo
    expect(periodo('mes', '2026-11-12')).toEqual({ inicio: '2026-11-01', fim: '2026-11-12' });
  });
  it('textos de período e dia', () => {
    expect(rotuloPeriodo('2026-11-04', '2026-11-10', '2026-11-10')).toBe('4 a 10 de novembro');
    expect(rotuloPeriodo('2026-10-28', '2026-11-03', '2026-11-10')).toBe('28/10 a 03/11');
    expect(rotuloDia('2026-11-08', '2026-11-10')).toBe('Domingo, 08/11');
    expect(rotuloDia('2026-11-09', '2026-11-10')).toBe('Ontem, 09/11');
  });
  it('soma dias atravessando mês', () => expect(somarDias('2026-10-31', 1)).toBe('2026-11-01'));
  it('limites do mês em Brasília', () => {
    expect(limitesMes(2026, 12)).toEqual({ inicio: '2026-12-01T00:00:00-03:00', fim: '2027-01-01T00:00:00-03:00' });
  });
});

describe('fiado', () => {
  it('telefone para WhatsApp', () => {
    expect(telefoneWhatsApp('(11) 98877-6655')).toBe('5511988776655');
    expect(telefoneWhatsApp('')).toBe('');
    expect(telefoneWhatsApp('5511988776655')).toBe('5511988776655');
  });
  it('mensagem da conta do mês', () => {
    const msg = nbsp(mensagemFiado({
      cliente: 'Seu Zé', ano: 2026, mes: 11, saldo: 3750,
      movimentos: [
        { tipo: 'pagamento', valor: 1000, criado_em: '2026-11-08T21:00:00Z' },
        { tipo: 'compra', descricao: 'Brahma 600ml', quantidade: 2, valor: 2400, criado_em: '2026-11-06T22:00:00Z' },
        { tipo: 'compra', descricao: 'Porção de calabresa', quantidade: 1, valor: 2350, criado_em: '2026-11-07T22:00:00Z' },
      ],
    }));
    expect(msg).toContain('Seu Zé, novembro de 2026');
    expect(msg.indexOf('06/11 — 2x Brahma 600ml: R$ 24,00')).toBeLessThan(msg.indexOf('07/11 — Porção de calabresa'));
    expect(msg).toContain('08/11 — Pagamento: −R$ 10,00');
    expect(msg).toContain('*Total devendo hoje: R$ 37,50*');
  });
  it('agrupa por dia, mais recente primeiro', () => {
    const g = agruparPorDia([
      { id: 1, criado_em: '2026-11-06T22:00:00Z' },
      { id: 2, criado_em: '2026-11-08T21:00:00Z' },
      { id: 3, criado_em: '2026-11-08T23:00:00Z' },
    ]);
    expect(g.map((x) => x.dia)).toEqual(['2026-11-08', '2026-11-06']);
    expect(g[0].lista.map((x) => x.id)).toEqual([3, 2]);
  });
});

import { formatarTelefone } from '../src/util.js';
describe('telefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('11988776655')).toBe('(11) 98877-6655');
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444');
    expect(formatarTelefone('+55 11 98877-6655')).toBe('(11) 98877-6655');
    expect(formatarTelefone('')).toBe('');
  });
});

import { reaisCurto } from '../src/util.js';
it('valor curto do painel', () => {
  expect(reaisCurto(3750)).toBe('R$ 37,50');
  expect(reaisCurto(600)).toBe('R$ 6');
  expect(reaisCurto(201050)).toBe('R$ 2.011');
});
