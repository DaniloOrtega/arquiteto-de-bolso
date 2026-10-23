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
try { new Function(code); } catch (e) { console.error("Erro de sintaxe no script: " + e.message); process.exit(1); }

// Roda só a parte de dados (até a criação do BYID) para inspecionar as questões.
const cut = code.indexOf("/* ---------- Sons e voz");
const data = code.slice(0, cut > 0 ? cut : code.indexOf("/* ---------- Estado"));
const D = new Function(data + "\nreturn {RAW, XRAW: typeof XRAW!=='undefined'?XRAW:[], TEMAS, TRAILS, TRAIL_ORDER, QS, BYID};")();

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
if (Object.keys(D.BYID).length !== D.QS.length) fail("IDs de questões repetidos");

for (const f of ["sw.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"]) {
  if (!fs.existsSync(path.join(__dirname, "..", f))) fail(`arquivo ausente: ${f}`);
}

if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} problema(s).`); process.exit(1); }
console.log(`OK: ${D.QS.length} questões (${D.RAW.length} de múltipla escolha, ${D.XRAW.length} interativas) em ${D.TRAIL_ORDER.length} trilhas.`);
