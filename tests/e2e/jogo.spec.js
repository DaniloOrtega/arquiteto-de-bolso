// Testes de ponta a ponta: abrem o jogo num navegador de verdade e jogam como um aluno.
const { test, expect } = require("@playwright/test");
const { carregarQuestoes } = require("./dados");

const { QS, TRAILS, TRAIL_ORDER } = carregarQuestoes();
const PRIMEIRA = TRAIL_ORDER[0];

// O jogo não depende de nada de fora para funcionar. Bloqueamos Google Fonts e Firebase
// para o teste ser rápido, repetível e não quebrar por causa da internet.
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com|.*\.googleapis\.com)\//, (r) => r.abort());
  page.erros = [];
  page.on("pageerror", (e) => page.erros.push(e.message));
});

test.afterEach(async ({ page }) => {
  expect(page.erros, "erros de JavaScript na página").toEqual([]);
});

// Responde a pergunta que está na tela. certo=true acerta, certo=false erra de propósito.
async function responder(page, certo) {
  const enunciado = (await page.locator(".qtext").textContent()).trim();
  const q = QS.find((x) => x.t === PRIMEIRA && x.q === enunciado);
  expect(q, `questão da tela não achada nos dados: "${enunciado}"`).toBeTruthy();

  if (!q.type) {
    const alvo = certo ? q.o[0] : q.o[1];
    await page.locator('[data-act="pick"]', { hasText: alvo }).first().click();
  } else if (q.type === "order") {
    const ordem = certo ? q.items : [...q.items].reverse();
    for (const item of ordem) await page.locator('[data-act="ord-add"]', { hasText: item }).first().click();
    await page.locator('[data-act="check"]').click();
  } else if (q.type === "match") {
    const n = q.pairs.length;
    for (let i = 0; i < n; i++) {
      const direita = certo ? q.pairs[i][1] : q.pairs[(i + 1) % n][1];
      await page.locator('[data-act="m-pick"][data-s="L"]', { hasText: q.pairs[i][0] }).first().click();
      await page.locator('[data-act="m-pick"][data-s="R"]', { hasText: direita }).first().click();
    }
    await page.locator('[data-act="check"]').click();
  } else if (q.type === "build") {
    for (let k = 0; k < q.slots.length; k++) {
      await page.locator(`[data-act="b-slot"][data-i="${k}"]`).click();
      await page.locator('[data-act="b-chip"]', { hasText: q.slots[k].a }).first().click();
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

test("a página inicial abre com todas as trilhas", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Arquiteto de Bolso/);
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

test("errando tudo, não passa e o nível 2 continua bloqueado", async ({ page }) => {
  await page.goto("/");
  await jogarLicao(page, false);
  await expect(page.locator("#app")).toContainText("Jogar de novo");
  await page.locator('[data-act="home"]').first().click();
  await abrirTrilha(page);
  await expect(page.locator(`[data-act="lesson"][data-t="${PRIMEIRA}"][data-l="2"]`)).toHaveAttribute("data-state", "locked");
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
