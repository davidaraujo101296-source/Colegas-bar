import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_CHAVE, EMAIL_LOGIN } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'colegas-bar-sessao' },
});

/** Transforma erros técnicos em frases simples. */
function traduzir(erro) {
  const msg = erro?.message || String(erro || '');
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) return 'Sem internet. Confira a conexão e tente de novo.';
  if (/Invalid login credentials/i.test(msg)) return 'Senha errada. Tente de novo.';
  if (/JWT|not authenticated|Acesso negado|permission denied|row-level security/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/contas_mesa_aberta/.test(msg)) return 'Essa mesa já tem uma conta aberta.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 números ou letras.';
  if (/same password|different from the old/i.test(msg)) return 'A senha nova precisa ser diferente da provisória.';
  if (/check constraint|violates/i.test(msg)) return 'Algum dado não está certo. Confira e tente de novo.';
  return msg || 'Algo deu errado. Tente de novo.';
}

async function ok(promessa) {
  let r;
  try {
    r = await promessa;
  } catch (e) {
    throw new Error(traduzir(e));
  }
  if (r.error) throw new Error(traduzir(r.error));
  return r.data;
}

const rpc = (nome, args) => ok(sb.rpc(nome, args));

// ---------- login ----------
export async function entrar(senha) {
  return ok(sb.auth.signInWithPassword({ email: EMAIL_LOGIN, password: senha }));
}
export async function sair() { await sb.auth.signOut(); }
export async function usuarioAtual() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
export async function trocarSenha(nova) {
  return ok(sb.auth.updateUser({ password: nova, data: { trocar_senha: false } }));
}

// ---------- produtos (guardados na memória para a busca ser instantânea) ----------
let cacheProdutos = null;
export async function produtos(forcar = false) {
  if (!cacheProdutos || forcar) {
    cacheProdutos = await ok(sb.from('produtos').select('*').eq('ativo', true).order('codigo'));
  }
  return cacheProdutos;
}
export function esquecerProdutos() { cacheProdutos = null; }

export async function criarProduto({ nome, preco, categoria }) {
  const p = await ok(sb.from('produtos').insert({ nome: nome.trim(), preco, categoria }).select().single());
  esquecerProdutos();
  return p;
}
export async function editarProduto(id, { nome, preco, categoria }) {
  const p = await rpc('editar_produto', { p_id: id, p_nome: nome, p_preco: preco, p_categoria: categoria });
  esquecerProdutos();
  return p;
}
export async function removerProduto(id) {
  await ok(sb.from('produtos').update({ ativo: false }).eq('id', id));
  esquecerProdutos();
}

// ---------- contas ----------
export const contasAbertas = () => ok(sb.from('contas_abertas').select('*').order('aberta_em'));
export const abrirConta = ({ mesa = null, nome = null }) => rpc('abrir_conta', { p_mesa: mesa, p_nome: nome });
export async function conta(id) {
  const c = await ok(sb.from('contas').select('*, clientes(nome)').eq('id', id).maybeSingle());
  if (!c) throw new Error('Conta não encontrada.');
  c.itens = await ok(sb.from('itens_conta').select('*').eq('conta_id', id).order('id'));
  c.total_atual = c.itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  return c;
}
export const lancarItem = (contaId, produtoId, qtd = 1) => rpc('lancar_item', { p_conta: contaId, p_produto: produtoId, p_qtd: qtd });
export const mudarQuantidade = (itemId, qtd) => rpc('mudar_quantidade', { p_item: itemId, p_qtd: qtd });
export const fecharConta = (id, forma, clienteId = null) => rpc('fechar_conta', { p_conta: id, p_forma: forma, p_cliente: clienteId });
export const cancelarConta = (id) => rpc('cancelar_conta', { p_conta: id });

// ---------- fiado ----------
export const clientes = () => ok(sb.from('clientes_saldo').select('*').order('nome'));
export async function cliente(id) {
  const c = await ok(sb.from('clientes_saldo').select('*').eq('id', id).maybeSingle());
  if (!c) throw new Error('Cliente não encontrado.');
  return c;
}
export const movimentos = (clienteId, inicio, fim) => ok(sb.from('fiado').select('*')
  .eq('cliente_id', clienteId).gte('criado_em', inicio).lt('criado_em', fim).order('criado_em', { ascending: false }));
export const primeiroMovimento = (clienteId) => ok(sb.from('fiado').select('criado_em')
  .eq('cliente_id', clienteId).order('criado_em').limit(1).maybeSingle());
export const criarCliente = ({ nome, telefone }) => ok(sb.from('clientes')
  .insert({ nome: nome.trim(), telefone: (telefone || '').trim() }).select().single());
export const editarCliente = (id, { nome, telefone }) => ok(sb.from('clientes')
  .update({ nome: nome.trim(), telefone: (telefone || '').trim() }).eq('id', id));
export const apagarCliente = (id) => ok(sb.from('clientes').update({ ativo: false }).eq('id', id));
export const lancarFiado = (clienteId, produtoId, quem = '', qtd = 1) => rpc('anotar_fiado', { p_cliente: clienteId, p_produto: produtoId, p_qtd: qtd, p_quem: quem });
/** Nomes já usados em "Quem pegou?" para esse cliente (mais recentes primeiro). */
export async function nomesQuem(clienteId) {
  const linhas = await ok(sb.from('fiado').select('quem').eq('cliente_id', clienteId).neq('quem', '')
    .order('criado_em', { ascending: false }).limit(300));
  const vistos = new Map();
  for (const { quem } of linhas) if (!vistos.has(quem.toLowerCase())) vistos.set(quem.toLowerCase(), quem);
  return [...vistos.values()];
}
export const receberFiado = (clienteId, valor, forma) => rpc('receber_fiado', { p_cliente: clienteId, p_valor: valor, p_forma: forma });
export const apagarMovimento = (id) => ok(sb.from('fiado').delete().eq('id', id).is('conta_id', null));

// ---------- painel ----------
export const painel = (inicio, fim) => rpc('painel', { p_inicio: inicio, p_fim: fim });
