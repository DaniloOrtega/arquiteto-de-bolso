// Testes das regras do Firestore, rodando no emulador (nada toca o banco de verdade).
// Cada teste faz o que o jogo faz (tem que passar) ou o que um invasor tentaria (tem que falhar).
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, deleteDoc, collection, getDocs, limit, query, serverTimestamp } = require("firebase/firestore");

let env;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-arquiteto",
    firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8") },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const ana = () => env.authenticatedContext("ana").firestore();
const beto = () => env.authenticatedContext("beto").firestore();
const anonimo = () => env.unauthenticatedContext().firestore();
// Igual ao pubDoc() do index.html.
const pub = (extra = {}) => ({ nick: "Ana", xp: 120, wxp: 40, wk: "2026-10-19", streak: 3, t: 1761264000000, ...extra });
// A operação tem que ser barrada pelas regras (e não falhar por outro motivo).
const negado = (e) => e.code === "permission-denied";
// Prepara dados sem passar pelas regras (como se já existissem no banco).
const semRegras = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

// ---------- Progresso (users) ----------
test("o jogador salva e lê o próprio progresso", async () => {
  const db = ana();
  await assert.doesNotReject(setDoc(doc(db, "users/ana"), { state: "{}", profile: { nick: "Ana", groups: [], global: false }, updated: serverTimestamp() }));
  await assert.doesNotReject(getDoc(doc(db, "users/ana")));
});
test("ninguém lê nem apaga o progresso de outro jogador", async () => {
  await semRegras((db) => setDoc(doc(db, "users/ana"), { state: "{}" }));
  await assert.rejects(getDoc(doc(beto(), "users/ana")), negado);
  await assert.rejects(deleteDoc(doc(beto(), "users/ana")), negado);
  await assert.rejects(getDoc(doc(anonimo(), "users/ana")), negado);
});
test("o progresso não aceita campos extras nem um texto gigante", async () => {
  await assert.rejects(setDoc(doc(ana(), "users/ana"), { state: "{}", admin: true }), negado);
  await assert.rejects(setDoc(doc(ana(), "users/ana"), { state: "x".repeat(500001) }), negado);
});
test("o jogador apaga a própria conta na nuvem", async () => {
  await semRegras((db) => setDoc(doc(db, "users/ana"), { state: "{}" }));
  await assert.doesNotReject(deleteDoc(doc(ana(), "users/ana")));
});

// ---------- Ranking geral (global) ----------
test("quem está logado vê o ranking geral; quem não está, não", async () => {
  await semRegras((db) => setDoc(doc(db, "global/ana"), pub()));
  await assert.doesNotReject(getDocs(query(collection(beto(), "global"), limit(200))));
  await assert.rejects(getDocs(query(collection(anonimo(), "global"), limit(200))), negado);
});
test("o jogador entra e sai do ranking geral", async () => {
  await assert.doesNotReject(setDoc(doc(ana(), "global/ana"), pub()));
  await assert.doesNotReject(deleteDoc(doc(ana(), "global/ana")));
});
test("ninguém escreve nem apaga a linha de outro no ranking", async () => {
  await assert.rejects(setDoc(doc(beto(), "global/ana"), pub()), negado);
  await semRegras((db) => setDoc(doc(db, "global/ana"), pub()));
  await assert.rejects(deleteDoc(doc(beto(), "global/ana")), negado);
});
test("o ranking barra XP impossível, número quebrado e campo extra", async () => {
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ xp: 9999999 })), negado);
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ wxp: -5 })), negado);
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ xp: 10.5 })), negado);
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ admin: true })), negado);
});
test("o apelido no ranking não aceita HTML", async () => {
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ nick: "<img src=x>" })), negado);
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ nick: "a\"b" })), negado);
  await assert.rejects(setDoc(doc(ana(), "global/ana"), pub({ nick: "" })), negado);
  await assert.doesNotReject(setDoc(doc(ana(), "global/ana"), pub({ nick: "Ana Júlia 2" })));
});

// ---------- Turmas (groups) ----------
const turma = (dono) => ({ name: "Turma da Ana", owner: dono, created: serverTimestamp() });
test("o jogador cria uma turma com código válido", async () => {
  await assert.doesNotReject(setDoc(doc(ana(), "groups/ABC234"), turma("ana")));
});
test("a turma não aceita dono falso, código inválido ou nome vazio", async () => {
  await assert.rejects(setDoc(doc(ana(), "groups/ABC234"), turma("beto")), negado);
  await assert.rejects(setDoc(doc(ana(), "groups/abc"), turma("ana")), negado);
  await assert.rejects(setDoc(doc(ana(), "groups/ABC234"), { ...turma("ana"), name: "A" }), negado);
  await assert.rejects(setDoc(doc(ana(), "groups/ABC234"), { ...turma("ana"), admin: true }), negado);
});
test("ninguém sobrescreve a turma de outro (código repetido)", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assert.rejects(setDoc(doc(beto(), "groups/ABC234"), turma("beto")), negado);
});
test("quem tem o código abre a turma, mas ninguém lista todas", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assert.doesNotReject(getDoc(doc(beto(), "groups/ABC234")));
  await assert.rejects(getDocs(collection(beto(), "groups")), negado);
});
test("entrar na turma e ver o ranking dela", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assert.doesNotReject(setDoc(doc(beto(), "groups/ABC234/members/beto"), pub({ nick: "Beto" })));
  await assert.doesNotReject(getDocs(query(collection(beto(), "groups/ABC234/members"), limit(200))));
});
test("quem não está na turma não vê o ranking dela", async () => {
  await semRegras(async (db) => {
    await setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" });
    await setDoc(doc(db, "groups/ABC234/members/ana"), pub());
  });
  await assert.rejects(getDocs(collection(beto(), "groups/ABC234/members")), negado);
});
test("ninguém entra numa turma que não existe nem escreve a linha de outro", async () => {
  await assert.rejects(setDoc(doc(beto(), "groups/ZZZ999/members/beto"), pub()), negado);
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assert.rejects(setDoc(doc(beto(), "groups/ABC234/members/ana"), pub()), negado);
});
test("o jogador sai da turma", async () => {
  await semRegras(async (db) => {
    await setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" });
    await setDoc(doc(db, "groups/ABC234/members/beto"), pub());
  });
  await assert.doesNotReject(deleteDoc(doc(beto(), "groups/ABC234/members/beto")));
});
