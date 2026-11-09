# Colegas Bar

Sistema do Colegas Bar para o celular: contas por mesa, lançamento por código ou nome, caderninho do fiado e painel de vendas. Funciona no navegador do celular (Chrome) e não precisa instalar nada.

- **Site:** hospedado na Vercel (publica sozinho a cada mudança na branch `main`).
- **Banco de dados e login:** Supabase, projeto `colegas-bar` (região São Paulo).

## O que tem

| Aba | Para que serve |
|---|---|
| **Contas** | As 10 mesas, onde as ocupadas ficam em vermelho e mostram o valor. Também tem contas com nome. A busca do topo lança direto no Balcão. |
| **Conta da mesa** | Busca por **código ou nome**. O **+** lança o produto; o **lápis** edita nome e preço. Se o produto não existe, aparece **Criar**. |
| **Fechar conta** | Dinheiro (com troco), Pix, Cartão ou Fiado. No fiado, cada produto vai para o caderninho do cliente. |
| **Fiado** | Clientes (nome e telefone opcional) e quanto cada um deve. Tem lançamento de fiado e de pagamento, histórico por mês com dia e hora, e envio da conta do mês pelo WhatsApp. |
| **Produtos** | Lista por tipo (Bebidas, Comidas, Doses, Outros), com edição fácil. Os códigos são criados sozinhos. |
| **Painel** | Hoje, semana, mês ou datas escolhidas. Mostra o vendido, o que foi pago na hora, o **fiado a receber**, o que entrou no caixa, as vendas por dia, as formas de pagamento e os mais vendidos. |

O tamanho da letra muda nos botões **A−** e **A+**, sempre no topo. São 5 tamanhos, e o celular guarda a escolha.

### Regras importantes

- **Preço editado:** o preço novo vale também para o que já está lançado em **contas abertas**. Contas fechadas e fiados já anotados continuam com o preço antigo.
- **Fiado:** conta como venda, mas o dinheiro ainda não entrou. No painel ele aparece separado, como **a receber**. Quando o cliente paga, o valor entra em "Dinheiro que entrou" no dia do pagamento.
- **Valores:** ficam guardados em centavos, para não ter erro de arredondamento.

## Login

Só a administradora entra. Ela digita **só a senha**, e o e-mail fica configurado em `src/config.js`. No primeiro acesso, o sistema pede para criar uma senha nova. Depois disso, o celular continua conectado.

Para trocar a senha de novo ou recuperar o acesso, use o painel do Supabase: **Authentication → Users**.

A segurança fica nas regras do banco (RLS): só o usuário cadastrado na tabela `administradores` lê ou grava dados. A chave pública em `src/config.js` sozinha não dá acesso a nada.

## Desenvolvimento

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes das contas, busca e datas
npm run build    # gera a pasta dist/
```

Organização do código:

- `src/main.js`: rotas, moldura das telas e tamanho da letra.
- `src/api.js`: todas as conversas com o Supabase.
- `src/busca.js`: a barra de busca de produtos (lançar, editar e criar).
- `src/telas/`: uma tela por arquivo.
- `src/util.js`: cálculos puros (dinheiro, busca, datas e mensagem do WhatsApp), com testes em `tests/`.
- `supabase/migrations/`: tabelas, regras de segurança e operações do banco.

## Para o futuro

- Impressora na cozinha: usar uma impressora térmica com impressão pela nuvem (Star CloudPRNT ou Epson Server Direct Print).
- Trocar os produtos de exemplo pela tabela real do bar.
