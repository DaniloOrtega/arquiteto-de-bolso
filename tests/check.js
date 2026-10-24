// Testes rápidos do jogo: sintaxe do script e consistência das questões.
// Uso: node tests/check.js
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
const fail = (m) => errors.push(m);

const m = html.match(/<script>\n\(function\(\)\{([\s\S]*?)\n\}\)\(\);\n<\/script>/);
if (!m) { console.error("Script principal não encontrado no index.html"); process.exit(1); }
const code = m[1];
// new Function roda código do nosso próprio index.html, nunca de quem usa o site (por isso o NOSONAR).
try { new Function(code); } catch (e) { console.error("Erro de sintaxe no script: " + e.message); process.exit(1); } // NOSONAR

// Roda só a parte de dados (até a criação do BYID) para inspecionar as questões.
const cut = code.indexOf("/* ---------- Sons e voz");
const data = code.slice(0, cut > 0 ? cut : code.indexOf("/* ---------- Estado"));
const D = new Function(data + "\nreturn {RAW, XRAW: typeof XRAW!=='undefined'?XRAW:[], BRAW: typeof BRAW!=='undefined'?BRAW:[], TEMAS, TRAILS, TRAIL_ORDER, QS, BYID};")(); // NOSONAR

const groups = {};
D.RAW.forEach((r, i) => {
  const where = `RAW[${i}] (${r[0]} ${r[1]})`;
  if (!D.TRAILS[r[0]]) fail(`${where}: trilha desconhecida`);
  if (![1, 2, 3, 4].includes(r[1])) fail(`${where}: nível inválido`);
  if (!Array.isArray(r[3]) || r[3].length !== 4) fail(`${where}: precisa de 4 alternativas`);
  else if (new Set(r[3]).size !== 4) fail(`${where}: alternativas repetidas`);
  if (!r[4]) fail(`${where}: sem explicação`);
  if (!D.TEMAS[r[0]] || !D.TEMAS[r[0]][r[5]]) fail(`${where}: tema "${r[5]}" não existe`);
  const k = r[0] + r[1]; groups[k] = (groups[k] || 0) + 1;
});
D.TRAIL_ORDER.forEach((t) => [1, 2, 3, 4].forEach((l) => {
  if (groups[t + l] !== 8) fail(`${t} nível ${l}: tem ${groups[t + l] || 0} questões, precisa de 8`);
}));
D.XRAW.forEach((r, i) => {
  const where = `XRAW[${i}] (${r[0]} ${r[1]})`;
  if (!D.TRAILS[r[0]]) fail(`${where}: trilha desconhecida`);
  if (!["o", "m"].includes(r[2])) fail(`${where}: tipo deve ser "o" ou "m"`);
  if (!Array.isArray(r[4]) || r[4].length < 3 || r[4].length > 6) fail(`${where}: precisa de 3 a 6 itens`);
  else if (r[2] === "m") {
    if (!r[4].every((p) => Array.isArray(p) && p.length === 2 && p[0] && p[1])) fail(`${where}: pares inválidos`);
    else if (new Set(r[4].map((p) => p[0])).size !== r[4].length || new Set(r[4].map((p) => p[1])).size !== r[4].length) fail(`${where}: pares repetidos`);
  } else if (new Set(r[4]).size !== r[4].length) fail(`${where}: itens repetidos`);
  if (!r[5]) fail(`${where}: sem explicação`);
  if (!D.TEMAS[r[0]] || !D.TEMAS[r[0]][r[6]]) fail(`${where}: tema "${r[6]}" não existe`);
});
D.BRAW.forEach((r, i) => {
  const where = `BRAW[${i}] (${r[0]} ${r[1]})`;
  if (!D.TRAILS[r[0]]) fail(`${where}: trilha desconhecida`);
  if (![1, 2, 3, 4].includes(r[1])) fail(`${where}: nível inválido`);
  if (!r[2]) fail(`${where}: sem enunciado`);
  const ok = Array.isArray(r[3]) && r[3].length && r[3].every((g) => Array.isArray(g) && g[0] && Array.isArray(g[1]) && g[1].length && g[1].every((x) => Array.isArray(x) && x.length === 2 && x[0] && x[1]));
  if (!ok) fail(`${where}: blocos inválidos`);
  else {
    const all = r[3].flatMap((g) => g[1].map((x) => x[1])).concat(r[4] || []);
    if (new Set(all).size !== all.length) fail(`${where}: peças repetidas (cada peça precisa ser única)`);
    if (all.length > 10) fail(`${where}: peças demais (máximo 10)`);
  }
  if (!Array.isArray(r[4])) fail(`${where}: distratores devem ser uma lista`);
  if (!r[5]) fail(`${where}: sem explicação`);
  if (!D.TEMAS[r[0]] || !D.TEMAS[r[0]][r[6]]) fail(`${where}: tema "${r[6]}" não existe`);
});
if (Object.keys(D.BYID).length !== D.QS.length) fail("IDs de questões repetidos");

for (const f of ["sw.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"]) {
  if (!fs.existsSync(path.join(__dirname, "..", f))) fail(`arquivo ausente: ${f}`);
}

if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} problema(s).`); process.exit(1); }
console.log(`OK: ${D.QS.length} questões (${D.RAW.length} de múltipla escolha, ${D.XRAW.length} de ordenar ou ligar, ${D.BRAW.length} de montar arquitetura) em ${D.TRAIL_ORDER.length} trilhas.`);
