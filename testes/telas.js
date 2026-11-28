const { chromium } = require('playwright');
const [S, base, email] = [process.argv[2], process.argv[3] || 'http://127.0.0.1:8300', process.argv[4] || 'admin@t.test'];
(async () => {
  const b = await chromium.launch(); const erros = [];
  const p = await (await b.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  p.on('pageerror', e => erros.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  p.on('response', async r => { if (r.url().includes('api.php') && r.request().method() === 'POST') { try { const j = await r.json(); if (!j.ok) erros.push('API ' + (r.request().postDataJSON()||{}).acao + ': ' + j.erro); } catch (e) {} } });
  await p.goto(base + '/'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/entrada.png` });
  await p.locator('input[type=email]').first().fill(email); await p.locator('input[type=password]').first().fill('Senha1234'); await p.keyboard.press('Enter'); await p.waitForTimeout(2000);
  if (await p.locator('text=Aceitar e continuar').count()) { await p.locator('input[type=checkbox]').first().check(); await p.click('text=Aceitar e continuar'); await p.waitForTimeout(1500); }
  const itens = await p.locator('nav a, nav button').allInnerTexts();
  console.log('MENU:', JSON.stringify(itens.map(t => t.trim()).filter(Boolean)));
  for (const t of itens.map(t => t.trim()).filter(Boolean)) {
    await p.locator('nav a, nav button', { hasText: t }).first().click().catch(() => {}); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${S}/${t.replace(/\W+/g, '_')}.png` });
  }
  console.log('ERROS:', JSON.stringify([...new Set(erros)], null, 1));
  await b.close();
})();
