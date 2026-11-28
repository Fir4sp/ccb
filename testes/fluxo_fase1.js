const { chromium } = require('playwright');
const S = process.argv[2]; const base = 'http://127.0.0.1:8300';
let falhas = 0, total = 0; const ok = (n, c, info) => { total++; if (c) console.log('  ✔ ' + n); else { falhas++; console.log('  ✘ ' + n + '  → ' + JSON.stringify(info).slice(0, 300)); } };
(async () => {
  const b = await chromium.launch(); const erros = [];
  async function entrar(email) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(email + ' JS: ' + e.message));
    await p.goto(base + '/'); await p.waitForTimeout(500);
    await p.locator('input[type=email]').first().fill(email); await p.locator('input[type=password]').first().fill('Senha1234'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
    if (await p.locator('text=Aceitar e continuar').count()) { await p.locator('input[type=checkbox]').first().check(); await p.click('text=Aceitar e continuar'); await p.waitForTimeout(1200); }
    p.api = async (acao, dados) => p.evaluate(async ([acao, dados]) => { const r = await fetch('api.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-KSAAS': '1' }, body: JSON.stringify({ acao, dados }) }); return r.json(); }, [acao, dados || {}]);
    return p;
  }
  const adm = await entrar('admin@t.test'), cora = await entrar('cora@t.test'), gil = await entrar('gil@t.test'), paulo = await entrar('paulo@t.test'), sara = await entrar('sara@t.test'), teo = await entrar('teo@t.test');
  console.log('Casas de Oração e grupos');
  let r = await adm.api('clientes.grupo.salvar', { nome: 'Grupo 8.1' }); ok('admin cria grupo', r.ok, r); const g = r.dados;
  r = await cora.api('clientes.grupo.salvar', { nome: 'Grupo X' }); ok('coordenação não cria grupo', !r.ok, r);
  r = await adm.api('clientes.salvar', { nome: 'Jardim Ingás', codigo: 'CO-01', grupoId: g.id, contato: 'Irmão João', endereco: 'Rua A, 10' }); ok('cadastra Casa de Oração com código e grupo (sem origem)', r.ok && r.dados.grupoNome === 'Grupo 8.1' && r.dados.codigo === 'CO-01', r); const casa = r.dados;
  r = await adm.api('clientes.salvar', { nome: 'Outra', codigo: 'CO-01' }); ok('código repetido é recusado', !r.ok && /código/.test(r.erro), r);
  r = await gil.api('clientes.listar', {}); ok('Gestão consulta as casas', r.ok && r.dados.itens.length === 1, r);
  r = await gil.api('clientes.salvar', { nome: 'X' }); ok('Gestão não altera casas', !r.ok, r);

  console.log('Chamado R$ 300 (Hidráulica) — Coordenação aprova');
  const orc = v => ({ servicos: [{ nome: 'Troca de sifão', qtd: 1, unit: v }], materiais: [{ nome: 'Sifão', qtd: 1, unit: 0, un: 'un' }], maquinas: [], imposto: { on: false, pct: 0 }, rt: { on: false, pct: 0 }, desconto: { tipo: 'valor', valor: 0 }, pagamentos: [], markup: 0 });
  r = await cora.api('chamados.salvar', { clienteId: casa.id, tipoServico: 'Hidráulica e esgoto', necessidade: 'Vazamento na pia', status: 'Aprovado', orcamento: orc(300) });
  ok('chamado novo não nasce aprovado', !r.ok && /aprovado/i.test(r.erro), r);
  r = await cora.api('chamados.salvar', { clienteId: casa.id, tipoServico: 'Hidráulica e esgoto', necessidade: 'Vazamento na pia', status: 'Aguardando aprovação', orcamento: orc(300) });
  ok('Coordenação abre o chamado com orçamento', r.ok && r.dados.valor === 300 && r.dados.aprovacao.nivelExigido === 'coord', r); const c1 = r.dados;
  r = await cora.api('chamados.mudar_status', { id: c1.id, status: 'Em Andamento' }); ok('não pula a aprovação pelo status', !r.ok && r.codigo === 'SEM_APROVACAO', r);
  r = await teo.api('chamados.aprovacao', { id: c1.id, acao: 'aprovar' }); ok('técnico não aprova', !r.ok, r);
  r = await cora.api('chamados.aprovacao', { id: c1.id, acao: 'aprovar' }); ok('Coordenação aprova até R$ 500', r.ok && r.dados.status === 'Aprovado' && r.dados.aprovacao.aprovado.nivel === 'coord', r);
  r = await cora.api('chamados.mudar_status', { id: c1.id, status: 'Em Andamento' }); ok('aprovado, segue para Em Andamento', r.ok, r);

  console.log('Chamado R$ 1.500 (Elétrica) — Segurança + Procurador');
  r = await cora.api('chamados.salvar', { clienteId: casa.id, tipoServico: 'Elétrica', necessidade: 'Trocar quadro', status: 'Aguardando aprovação', orcamento: orc(1500) });
  const c2 = r.dados; ok('valor acima da Gestão pede o Procurador e parecer', r.ok && c2.aprovacao.nivelExigido === 'procurador' && c2.aprovacao.exigeSeguranca, r);
  r = await cora.api('chamados.aprovacao', { id: c2.id, acao: 'aprovar' }); ok('Coordenação não aprova R$ 1.500', !r.ok, r);
  r = await paulo.api('chamados.aprovacao', { id: c2.id, acao: 'aprovar' }); ok('sem parecer da Segurança, nem o Procurador aprova', !r.ok && /Segurança/.test(r.erro), r);
  r = await gil.api('chamados.aprovacao', { id: c2.id, acao: 'parecer', situacao: 'favoravel' }); ok('só a Segurança dá parecer', !r.ok, r);
  r = await sara.api('chamados.aprovacao', { id: c2.id, acao: 'parecer', situacao: 'desfavoravel' }); ok('parecer desfavorável exige motivo', !r.ok, r);
  r = await sara.api('chamados.aprovacao', { id: c2.id, acao: 'parecer', situacao: 'favoravel', texto: 'Usar EPI e desligar o geral' }); ok('Segurança dá parecer favorável', r.ok && r.dados.aprovacao.parecer.situacao === 'favoravel', r);
  r = await gil.api('chamados.aprovacao', { id: c2.id, acao: 'aprovar' }); ok('Gestão não aprova acima de R$ 1.000', !r.ok && r.codigo === 'SEM_ALCADA', r);
  r = await paulo.api('chamados.aprovacao', { id: c2.id, acao: 'aprovar' }); ok('Procurador aprova', r.ok && r.dados.status === 'Aprovado' && r.dados.aprovacao.aprovado.nivel === 'procurador', r);
  r = await cora.api('chamados.salvar', Object.assign({}, c2, { status: 'Aprovado', orcamento: orc(1700) })); ok('valor sobe depois de aprovado → volta para aprovação? (mesma alçada: continua)', r.ok && r.dados.status === 'Aprovado', r);

  console.log('Chamado R$ 800 → aumenta para R$ 900 (Gestão) e reprovação');
  r = await cora.api('chamados.salvar', { clienteId: casa.id, tipoServico: 'Civil (paredes, piso, pintura)', necessidade: 'Pintura', status: 'Aguardando aprovação', orcamento: orc(450) });
  let c3 = r.dados; r = await cora.api('chamados.aprovacao', { id: c3.id, acao: 'aprovar' }); c3 = r.dados; ok('Coordenação aprova R$ 450', r.ok && c3.status === 'Aprovado', r);
  r = await cora.api('chamados.salvar', Object.assign({}, c3, { orcamento: orc(900) })); ok('valor passou da alçada da Coordenação → volta para aprovação', r.ok && r.dados.status === 'Aguardando aprovação' && !r.dados.aprovacao.aprovado, r);
  r = await gil.api('chamados.aprovacao', { id: c3.id, acao: 'reprovar' }); ok('não aprovar exige motivo', !r.ok, r);
  r = await gil.api('chamados.aprovacao', { id: c3.id, acao: 'reprovar', texto: 'Esperar o próximo semestre' }); ok('Gestão não aprova, com motivo', r.ok && r.dados.status === 'Não Aprovado', r);
  r = await cora.api('chamados.acomp.listar', { id: c3.id }); ok('o histórico registra aprovação e não aprovação', r.ok && r.dados.itens.some(a => a.tipo === 'aprovacao' && /Não aprovado/.test(a.texto)), r);

  console.log('OS a partir do chamado aprovado');
  r = await cora.api('os.opcoes', {}); ok('checklists do CCB (Elétrica, Hidráulica, Civil…)', r.ok && r.dados.checklists.some(c => c.nome === 'Elétrica'), r);
  await adm.screenshot({ path: `${S}/x.png` });
  // telas
  await cora.goto(base + '/#/chamados'); await cora.waitForTimeout(1500); await cora.screenshot({ path: `${S}/1-chamados.png` });
  await cora.locator('text=Trocar quadro').first().click().catch(() => {}); await cora.waitForTimeout(1500); await cora.screenshot({ path: `${S}/2-chamado-aprovado.png`, fullPage: true });
  await adm.goto(base + '/#/clientes'); await adm.waitForTimeout(1500); await adm.screenshot({ path: `${S}/3-casas.png` });
  await adm.goto(base + '/#/config'); await adm.waitForTimeout(1200); await adm.locator('text=Chamados e aprovação').first().click(); await adm.waitForTimeout(800); await adm.screenshot({ path: `${S}/4-config.png`, fullPage: true });
  console.log('ERROS JS:', JSON.stringify(erros));
  console.log(falhas ? `${falhas} DE ${total} FALHARAM` : `TODOS OS ${total} PASSARAM`);
  await b.close();
})();
