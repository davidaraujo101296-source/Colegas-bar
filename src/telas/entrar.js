import * as api from '../api.js';
import { h, icone, tentar, avisar } from '../ui.js';

function saudacao() {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()));
  if (hora < 12 && hora >= 5) return 'Bom dia!';
  if (hora < 18 && hora >= 12) return 'Boa tarde!';
  return 'Boa noite!';
}

function moldura(caixa) {
  return h('div', { class: 'entrar' },
    h('div', { class: 'circ', style: 'width:380px;height:380px;top:-120px;right:-170px' }),
    h('div', { class: 'circ', style: 'width:220px;height:220px;top:300px;left:-120px' }),
    h('div', { class: 'entrar-marca' }, icone('logo', ''), h('div', { class: 'nome' }, 'Colegas'), h('div', { class: 'bar' }, 'BAR')),
    caixa);
}

function campoSenha(rotulo, auto) {
  const input = h('input', { type: 'password', autocomplete: auto, inputmode: 'numeric', enterkeyhint: 'go', 'aria-label': rotulo });
  const mostrar = h('button', { type: 'button', class: 'chip', style: 'min-height:2.4rem', onclick: () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    mostrar.textContent = input.type === 'password' ? 'Mostrar' : 'Esconder';
  } }, 'Mostrar');
  return { input, el: h('label', { class: 'campo' }, h('span', null, rotulo), h('div', { class: 'inp' }, input, mostrar)) };
}

export function telaEntrar({ aoEntrar }) {
  const senha = campoSenha('Senha', 'current-password');
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'entrar-caixa', onsubmit: async (e) => {
    e.preventDefault();
    if (!senha.input.value) { senha.input.focus(); return; }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    const r = await tentar(() => api.entrar(senha.input.value));
    botao.disabled = false;
    botao.textContent = 'Entrar';
    if (r) aoEntrar();
    else { senha.input.select(); }
  } },
  h('h2', null, `${saudacao()} 👋`),
  h('p', null, 'Digite sua senha para entrar.'),
  senha.el, botao);
  setTimeout(() => senha.input.focus(), 100);
  return moldura(form);
}

export function telaCriarSenha({ aoTerminar }) {
  const nova = campoSenha('Senha nova', 'new-password');
  const repetir = campoSenha('Repita a senha nova', 'new-password');
  const botao = h('button', { class: 'btn', type: 'submit' }, icone('i-check'), 'Salvar minha senha');
  const form = h('form', { class: 'entrar-caixa', onsubmit: async (e) => {
    e.preventDefault();
    if (nova.input.value.length < 6) { avisar('A senha precisa ter pelo menos 6 números ou letras.', 'erro'); return; }
    if (nova.input.value !== repetir.input.value) { avisar('As duas senhas não estão iguais.', 'erro'); return; }
    botao.disabled = true;
    const r = await tentar(() => api.trocarSenha(nova.input.value));
    botao.disabled = false;
    if (r) { avisar('✓ Senha criada! Guarde bem.'); aoTerminar(); }
  } },
  h('h2', null, 'Crie sua senha'),
  h('p', null, 'É a primeira vez. Escolha uma senha de pelo menos 6 números que só você saiba.'),
  nova.el, repetir.el, botao);
  return moldura(form);
}
