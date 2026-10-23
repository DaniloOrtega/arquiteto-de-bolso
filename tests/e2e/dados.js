// Lê as questões direto do index.html (o mesmo jeito do tests/check.js),
// para o teste saber qual é a resposta certa de cada pergunta que aparecer na tela.
const fs = require("fs");
const path = require("path");

function carregarQuestoes() {
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  const m = html.match(/<script>\n\(function\(\)\{([\s\S]*?)\n\}\)\(\);\n<\/script>/);
  const code = m[1];
  const cut = code.indexOf("/* ---------- Sons e voz");
  const data = code.slice(0, cut > 0 ? cut : code.indexOf("/* ---------- Estado"));
  return new Function(data + "\nreturn {QS, TRAILS, TRAIL_ORDER};")();
}

module.exports = { carregarQuestoes };
