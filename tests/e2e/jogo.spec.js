// Testes de ponta a ponta: abrem o jogo num navegador de verdade e jogam como um aluno.
const { test, expect } = require("@playwright/test");
const { carregarQuestoes } = require("./dados");

const { QS, TRAILS, TRAIL_ORDER } = carregarQuestoes();
const PRIMEIRA = TRAIL_ORDER[0];

// O jogo não depende de nada de fora para funcionar. Bloqueamos Google Fonts e Firebase
// para o teste ser rápido, repetível e não quebrar por causa da internet.
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com|.*\.googleapis\.com)\//, (r) => r.abort());
  // Simula quem já entrou com o Google neste aparelho (o login é obrigatório no site).
  await page.addInitScript(() => { if (!sessionStorage.getItem("sem-login")) localStorage.setItem("arquiteto-de-bolso.auth", "teste"); });
  page.erros = [];
  page.on("pageerror", (e) => page.erros.push(e.message));
  // Guarda tudo que a CSP bloquear. Se um script nosso mudar sem o hash acompanhar, aparece aqui.
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline")));
  });
});

test.afterEach(async ({ page }) => {
  expect(page.erros, "erros de JavaScript na página").toEqual([]);
  const bloqueios = page.isClosed() ? [] : await page.evaluate(() => window.__csp || []).catch(() => []);
  expect(bloqueios, "coisas bloqueadas pela CSP").toEqual([]);
});

// Responde a pergunta que está na tela. certo=true acerta, certo=false erra de propósito.
// Botão cujo texto é exatamente "texto" ("HTTP" não pode pegar "HTTPS").
// O botão pode ter na frente a letra da alternativa (A-D) ou o número do par.
const exato = (texto) => new RegExp("^\\s*[A-D0-9]?\\s*" + texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$");
const botaoExato = (page, sel, texto) => page.locator(sel).filter({ hasText: exato(texto) }).first();

async function responder(page, certo, todas = false) {
  const enunciado = (await page.locator(".qtext").textContent()).trim();
  const q = QS.find((x) => (todas || x.t === PRIMEIRA) && x.q === enunciado);
  expect(q, `questão da tela não achada nos dados: "${enunciado}"`).toBeTruthy();
  if (typeof certo === "function") certo = certo(q);

  if (!q.type) {
    const alvo = certo ? q.o[0] : q.o[1];
    await botaoExato(page, '[data-act="pick"]', alvo).click();
  } else if (q.type === "order") {
    const ordem = certo ? q.items : [...q.items].reverse();
    for (const item of ordem) await botaoExato(page, '[data-act="ord-add"]', item).click();
    await page.locator('[data-act="check"]').click();
  } else if (q.type === "match") {
    const n = q.pairs.length;
    for (let i = 0; i < n; i++) {
      const direita = certo ? q.pairs[i][1] : q.pairs[(i + 1) % n][1];
      await botaoExato(page, '[data-act="m-pick"][data-s="L"]', q.pairs[i][0]).click();
      await botaoExato(page, '[data-act="m-pick"][data-s="R"]', direita).click();
    }
    await page.locator('[data-act="check"]').click();
  } else if (q.type === "build") {
    for (let k = 0; k < q.slots.length; k++) {
      await page.locator(`[data-act="b-slot"][data-i="${k}"]`).click();
      await botaoExato(page, '[data-act="b-chip"]', q.slots[k].a).click();
    }
    await page.locator('[data-act="check"]').click();
  }
  await expect(page.locator(".fb")).toContainText(certo ? "Correto!" : "Não foi dessa vez.");
}

// Abre a primeira trilha (se já estiver aberta, não fecha).
async function abrirTrilha(page) {
  const botao = page.locator(`[data-act="toggle"][data-t="${PRIMEIRA}"]`);
  if ((await botao.getAttribute("aria-expanded")) !== "true") await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
}

async function jogarLicao(page, certo) {
  await abrirTrilha(page);
  await page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`).click();
  for (let i = 1; i <= 8; i++) {
    await expect(page.locator(".count")).toContainText(`${i}/`);
    await responder(page, certo);
    await page.locator('[data-act="next"]').click();
  }
}

// Abre todos os grupos de trilhas da tela inicial.
async function abrirGrupos(page) {
  const fechados = page.locator('.ghead[aria-expanded="false"]');
  // dispatchEvent não espera o botão ficar parado: offline a tela se redesenha e o clique normal se perdia.
  while ((await fechados.count()) > 0) await fechados.first().dispatchEvent("click");
}

test("a página inicial abre com todas as trilhas", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Arquiteto de Bolso/);
  // As trilhas ficam em 7 grupos; só o grupo da primeira trilha abre sozinho.
  await expect(page.locator(".ghead")).toHaveCount(7);
  await expect(page.locator('.ghead[aria-expanded="true"]')).toHaveCount(1);
  await abrirGrupos(page);
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(TRAIL_ORDER.length);
  await expect(page.locator(`[data-act="toggle"][data-t="${PRIMEIRA}"]`)).toContainText(TRAILS[PRIMEIRA].name);
});

test("acertando tudo, passa no nível 1 e o progresso fica salvo", async ({ page }) => {
  await page.goto("/");
  await jogarLicao(page, true);
  await expect(page.locator("#app")).toContainText("Próximo nível");
  await page.screenshot({ path: "tests/e2e/telas/resultado-aprovado.png", fullPage: true });

  // Recarrega a página: o progresso precisa continuar lá (salvo no aparelho).
  await page.reload();
  await abrirTrilha(page);
  await expect(page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`)).toHaveAttribute("data-state", "done");
  await expect(page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="2"]`)).toHaveAttribute("data-state", "open");
});

test("errando tudo, as vidas acabam e o nível 2 continua bloqueado", async ({ page }) => {
  await page.goto("/");
  await abrirTrilha(page);
  await page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`).click();
  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(".hearts")).toContainText(String(6 - i));
    await responder(page, false);
    await page.locator('[data-act="next"]').click();
  }
  await expect(page.locator("#app")).toContainText("Acabaram as vidas");
  await page.screenshot({ path: "tests/e2e/telas/sem-vidas.png", fullPage: true });
  // Sem vidas, não dá para começar outra lição.
  await page.locator('[data-act="home"]').first().click();
  await expect(page.locator('.chip.heart')).toContainText("0");
  await abrirTrilha(page);
  await page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`).click();
  await expect(page.locator("#toast")).toContainText("Sem vidas");
  await expect(page.locator(".qtext")).toHaveCount(0);
  await expect(page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="2"]`)).toHaveAttribute("data-state", "locked");
});

test("errando 2, refaz só as 2 no fim e passa de nível", async ({ page }) => {
  await page.goto("/");
  await abrirTrilha(page);
  await page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`).click();
  for (let i = 1; i <= 8; i++) {
    await responder(page, i > 2); // erra as 2 primeiras
    if (i <= 2) await expect(page.locator(".fb")).toContainText("volta no fim da lição");
    await page.locator('[data-act="next"]').click();
  }
  // Depois das 8, só as 2 erradas voltam.
  await expect(page.locator(".count")).toContainText("9/10");
  await expect(page.locator(".xtag.again")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await responder(page, true);
    await page.locator('[data-act="next"]').click();
  }
  await expect(page.locator("#app")).toContainText("Nível aprovado");
  await expect(page.locator(".stars")).toHaveText("★★☆");
  await page.screenshot({ path: "tests/e2e/telas/aprovado-com-erros.png", fullPage: true });
  await page.locator('[data-act="home"]').first().click();
  await expect(page.locator('.chip.heart')).toContainText("3");
  await abrirTrilha(page);
  await expect(page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="2"]`)).toHaveAttribute("data-state", "open");
});

test("lição perfeita dá 3 estrelas e bônus", async ({ page }) => {
  await page.goto("/");
  await jogarLicao(page, true);
  await expect(page.locator(".stars")).toHaveText("★★★");
  await expect(page.locator("#app")).toContainText("Lição perfeita!");
  await expect(page.locator(".gains")).toContainText("XP de lição perfeita");
});

test("no celular, a tela não rola para os lados", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await abrirTrilha(page);
  const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(larguras[0]).toBeLessThanOrEqual(larguras[1]);
  await page.screenshot({ path: "tests/e2e/telas/celular.png", fullPage: true });
});

test("o app funciona offline depois da primeira visita", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // a segunda visita já passa pelo service worker
  await context.setOffline(true);
  await page.reload();
  await abrirGrupos(page);
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(TRAIL_ORDER.length);
  await context.setOffline(false);
});

test("reportar tira a questão da trilha e ela aparece em revisão", async ({ page }) => {
  await page.goto("/");
  await abrirTrilha(page);
  await page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="1"]`).click();
  const enunciado = (await page.locator(".qtext").textContent()).trim();
  const q = QS.find((x) => x.t === PRIMEIRA && x.q === enunciado);

  await page.locator('[data-act="flag"]').click();
  await page.locator("#flagnote").fill("A alternativa certa parece errada");
  await page.locator('[data-act="flag-yes"]').click();
  // A lição segue sem ela: uma questão a menos e outro enunciado na tela.
  await expect(page.locator(".count")).toContainText("1/7");
  await expect(page.locator(".qtext")).not.toHaveText(enunciado);

  await page.locator('[data-act="home"]').first().click();
  await expect(page.locator(".revcard")).toContainText("1 questão em revisão");
  await page.locator('.revcard [data-act="rev-open"]').click();
  await expect(page.locator("#app")).toContainText(enunciado);
  await expect(page.locator("#app")).toContainText("A alternativa certa parece errada");
  const link = await page.locator('a.btnlink').getAttribute("href");
  expect(link).toContain("github.com/DaniloOrtega/arquiteto-de-bolso/issues/new");
  expect(decodeURIComponent(link)).toContain(q.id);
  await page.screenshot({ path: "tests/e2e/telas/revisao.png", fullPage: true });

  // Devolver à trilha tira da lista.
  await page.locator('[data-act="unflag"]').click();
  await expect(page.locator("#app")).toContainText("Nenhuma questão em revisão");
});

test("questão corrigida volta sozinha para a trilha", async ({ page }) => {
  const q = QS.find((x) => x.t === PRIMEIRA && x.l === 1 && !x.type);
  await page.goto("/");
  // Simula uma questão reportada antes da correção (impressão digital antiga).
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem("arquiteto-de-bolso.v2") || "{}");
    s.xp = s.xp || 0; s.prog = s.prog || {}; s.flagged = { [id]: { h: "antiga", note: "", at: 1 } };
    localStorage.setItem("arquiteto-de-bolso.v2", JSON.stringify(s));
  }, q.id);
  await page.reload();
  await expect(page.locator("#toast")).toContainText("1 questão corrigida voltou para a trilha.");
  await expect(page.locator(".revcard")).toHaveCount(0);
});

test("a CSP bloqueia um script injetado na página", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(`[data-act="toggle"][data-t="${PRIMEIRA}"]`)).toBeVisible();
  // Simula um ataque XSS: alguém consegue colocar um <script> novo na página.
  const rodou = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__invasor = true;";
    document.body.appendChild(s);
    return window.__invasor === true;
  });
  expect(rodou, "o script injetado não pode rodar").toBe(false);
  await expect.poll(() => page.evaluate(() => window.__csp.length)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__csp = []; }); // bloqueio esperado, não conta como falha
});

test("sem login, o site pede para entrar com o Google", async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem("sem-login", "1"); localStorage.removeItem("arquiteto-de-bolso.auth"); });
  await page.goto("/");
  await expect(page.locator(".gate")).toBeVisible();
  await expect(page.locator(".gate")).toContainText("funciona offline");
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(0);
  await page.screenshot({ path: "tests/e2e/telas/login.png", fullPage: true });
});

test("o nivelamento geral monta um plano só com as trilhas mais fracas", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-act="placement-all"]').first().click();
  // Trilhas finais (avançadas) ficam fora do nivelamento geral.
  const geral = TRAIL_ORDER.filter((t) => !TRAILS[t].final);
  expect(geral).not.toContain("svl");
  const total = geral.length * 2;
  // Acerta tudo, menos nas trilhas 2, 4 e 6 (erra as duas perguntas de cada uma).
  const fracas = [TRAIL_ORDER[1], TRAIL_ORDER[3], TRAIL_ORDER[5]];
  for (let i = 1; i <= total; i++) {
    await expect(page.locator(".count")).toContainText(`${i}/${total}`);
    await responder(page, (q) => !fracas.includes(q.t), true);
    await page.locator('[data-act="next"]').click();
  }
  await expect(page.locator("#app")).toContainText("Seu plano de estudo");
  for (const t of fracas) await expect(page.locator(".prow.plan")).toContainText([TRAILS[t].name]);
  await expect(page.locator(".prow.plan")).toHaveCount(3);
  await page.screenshot({ path: "tests/e2e/telas/plano.png", fullPage: true });

  // Na tela inicial, só o plano aparece; as outras ficam recolhidas.
  await page.locator('[data-act="home"]').first().click();
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(3);
  await page.locator('[data-act="others"]').click();
  await abrirGrupos(page);
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(TRAIL_ORDER.length);

  // Pôr uma trilha a mais no plano.
  const extra = TRAIL_ORDER[0];
  const botao = page.locator(`[data-act="toggle"][data-t="${extra}"]`);
  if ((await botao.getAttribute("aria-expanded")) !== "true") await botao.click();
  await page.locator(`[data-act="plan-toggle"][data-t="${extra}"]`).click();
  await page.locator('[data-act="others"]').first().click();
  await expect(page.locator('[data-act="toggle"]')).toHaveCount(4);
  await expect(page.locator(".ghead")).toHaveCount(0);
});

test("o teste de nível de uma trilha vai até o fim", async ({ page }) => {
  await page.goto("/");
  await abrirTrilha(page);
  await page.locator(`[data-act="placement"][data-t="${PRIMEIRA}"]`).click();
  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(".count")).toContainText(`${i}/5`);
    await responder(page, true);
    await page.locator('[data-act="next"]').click();
  }
  await expect(page.locator("#app")).toContainText("Nivelamento concluído");
});

test("a trilha de equivalências sorteia 8 questões de um banco maior", async ({ page }) => {
  expect(QS.filter((x) => x.t === "eqv" && x.l === 1).length).toBeGreaterThan(8);
  await page.goto("/");
  await abrirGrupos(page);
  await page.locator('[data-act="toggle"][data-t="eqv"]').click();
  await page.locator('[data-act="lesson"][data-t="eqv"][data-l="1"]').click();
  await expect(page.locator(".count")).toContainText("1/8");
  const txt = (await page.locator(".qtext").textContent()).trim();
  expect(QS.find((x) => x.t === "eqv" && x.q === txt), `questão "${txt}"`).toBeTruthy();
  await page.screenshot({ path: "tests/e2e/telas/equivalencias.png", fullPage: true });
});

for (const [t, nome] of [["aws", "AWS Cloud Practitioner"], ["azr", "Azure Fundamentals"], ["gcp", "Google Cloud Digital Leader"], ["oci", "OCI Foundations"], ["svl", "Serverless e gerenciados (avançado)"]]) test(`a trilha ${nome} tem os 4 níveis e abre a lição`, async ({ page }) => {
  for (const l of [1, 2, 3, 4]) expect(QS.filter((x) => x.t === t && x.l === l).length).toBeGreaterThan(8);
  await page.goto("/");
  await abrirGrupos(page);
  await page.locator(`[data-act="toggle"][data-t="${t}"]`).click();
  await page.locator(`[data-act="lesson"][data-t="${t}"][data-l="1"]`).click();
  await expect(page.locator(".count")).toContainText("1/8");
  const txt = (await page.locator(".qtext").textContent()).trim();
  expect(QS.find((x) => x.t === t && x.q === txt), `questão "${txt}"`).toBeTruthy();
});
