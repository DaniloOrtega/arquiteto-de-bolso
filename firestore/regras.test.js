// Testes das regras do Firestore, rodando no emulador (nada toca o banco de verdade).
// Cada teste faz o que o jogo faz (tem que passar) ou o que um invasor tentaria (tem que falhar).
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
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
// Prepara dados sem passar pelas regras (como se já existissem no banco).
const semRegras = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

// ---------- Progresso (users) ----------
test("o jogador salva e lê o próprio progresso", async () => {
  const db = ana();
  await assertSucceeds(setDoc(doc(db, "users/ana"), { state: "{}", profile: { nick: "Ana", groups: [], global: false }, updated: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, "users/ana")));
});
test("ninguém lê nem apaga o progresso de outro jogador", async () => {
  await semRegras((db) => setDoc(doc(db, "users/ana"), { state: "{}" }));
  await assertFails(getDoc(doc(beto(), "users/ana")));
  await assertFails(deleteDoc(doc(beto(), "users/ana")));
  await assertFails(getDoc(doc(anonimo(), "users/ana")));
});
test("o progresso não aceita campos extras nem um texto gigante", async () => {
  await assertFails(setDoc(doc(ana(), "users/ana"), { state: "{}", admin: true }));
  await assertFails(setDoc(doc(ana(), "users/ana"), { state: "x".repeat(500001) }));
});
test("o jogador apaga a própria conta na nuvem", async () => {
  await semRegras((db) => setDoc(doc(db, "users/ana"), { state: "{}" }));
  await assertSucceeds(deleteDoc(doc(ana(), "users/ana")));
});

// ---------- Ranking geral (global) ----------
test("quem está logado vê o ranking geral; quem não está, não", async () => {
  await semRegras((db) => setDoc(doc(db, "global/ana"), pub()));
  await assertSucceeds(getDocs(query(collection(beto(), "global"), limit(200))));
  await assertFails(getDocs(query(collection(anonimo(), "global"), limit(200))));
});
test("o jogador entra e sai do ranking geral", async () => {
  await assertSucceeds(setDoc(doc(ana(), "global/ana"), pub()));
  await assertSucceeds(deleteDoc(doc(ana(), "global/ana")));
});
test("ninguém escreve nem apaga a linha de outro no ranking", async () => {
  await assertFails(setDoc(doc(beto(), "global/ana"), pub()));
  await semRegras((db) => setDoc(doc(db, "global/ana"), pub()));
  await assertFails(deleteDoc(doc(beto(), "global/ana")));
});
test("o ranking barra XP impossível, número quebrado e campo extra", async () => {
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ xp: 9999999 })));
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ wxp: -5 })));
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ xp: 10.5 })));
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ admin: true })));
});
test("o apelido no ranking não aceita HTML", async () => {
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ nick: "<img src=x>" })));
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ nick: "a\"b" })));
  await assertFails(setDoc(doc(ana(), "global/ana"), pub({ nick: "" })));
  await assertSucceeds(setDoc(doc(ana(), "global/ana"), pub({ nick: "Ana Júlia 2" })));
});

// ---------- Turmas (groups) ----------
const turma = (dono) => ({ name: "Turma da Ana", owner: dono, created: serverTimestamp() });
test("o jogador cria uma turma com código válido", async () => {
  await assertSucceeds(setDoc(doc(ana(), "groups/ABC234"), turma("ana")));
});
test("a turma não aceita dono falso, código inválido ou nome vazio", async () => {
  await assertFails(setDoc(doc(ana(), "groups/ABC234"), turma("beto")));
  await assertFails(setDoc(doc(ana(), "groups/abc"), turma("ana")));
  await assertFails(setDoc(doc(ana(), "groups/ABC234"), { ...turma("ana"), name: "A" }));
  await assertFails(setDoc(doc(ana(), "groups/ABC234"), { ...turma("ana"), admin: true }));
});
test("ninguém sobrescreve a turma de outro (código repetido)", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assertFails(setDoc(doc(beto(), "groups/ABC234"), turma("beto")));
});
test("quem tem o código abre a turma, mas ninguém lista todas", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assertSucceeds(getDoc(doc(beto(), "groups/ABC234")));
  await assertFails(getDocs(collection(beto(), "groups")));
});
test("entrar na turma e ver o ranking dela", async () => {
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assertSucceeds(setDoc(doc(beto(), "groups/ABC234/members/beto"), pub({ nick: "Beto" })));
  await assertSucceeds(getDocs(query(collection(beto(), "groups/ABC234/members"), limit(200))));
});
test("quem não está na turma não vê o ranking dela", async () => {
  await semRegras(async (db) => {
    await setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" });
    await setDoc(doc(db, "groups/ABC234/members/ana"), pub());
  });
  await assertFails(getDocs(collection(beto(), "groups/ABC234/members")));
});
test("ninguém entra numa turma que não existe nem escreve a linha de outro", async () => {
  await assertFails(setDoc(doc(beto(), "groups/ZZZ999/members/beto"), pub()));
  await semRegras((db) => setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" }));
  await assertFails(setDoc(doc(beto(), "groups/ABC234/members/ana"), pub()));
});
test("o jogador sai da turma", async () => {
  await semRegras(async (db) => {
    await setDoc(doc(db, "groups/ABC234"), { name: "Turma da Ana", owner: "ana" });
    await setDoc(doc(db, "groups/ABC234/members/beto"), pub());
  });
  await assertSucceeds(deleteDoc(doc(beto(), "groups/ABC234/members/beto")));
});
