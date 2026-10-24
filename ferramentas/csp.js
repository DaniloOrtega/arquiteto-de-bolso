// CSP com hash dos scripts: em vez de liberar qualquer <script> escrito na página ('unsafe-inline'),
// a política lista a "impressão digital" (SHA-256) de cada script nosso. Um script injetado por um
// invasor tem outra impressão digital e o navegador recusa.
// O _headers guarda a marca HASHES_DOS_SCRIPTS; este arquivo troca a marca pelos hashes do index.html.
// Uso na esteira: node ferramentas/csp.js dist/_headers dist/index.html
const crypto = require("crypto");
const fs = require("fs");

const MARCA = "HASHES_DOS_SCRIPTS";

// Só os <script> escritos dentro da página (os com src="" já são cobertos pelos endereços da política).
function hashesDosScripts(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    hashes.push("'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
  }
  return hashes;
}

function aplicar(headers, html) {
  const hashes = hashesDosScripts(html);
  if (!headers.includes(MARCA)) throw new Error("O _headers não tem a marca " + MARCA);
  if (hashes.length === 0) throw new Error("Nenhum <script> encontrado no index.html");
  return headers.split(MARCA).join(hashes.join(" "));
}

module.exports = { hashesDosScripts, aplicar, MARCA };

if (require.main === module) {
  const [arquivoHeaders, arquivoHtml] = process.argv.slice(2);
  if (!arquivoHeaders || !arquivoHtml) {
    console.error("Uso: node ferramentas/csp.js <_headers> <index.html>");
    process.exit(1);
  }
  const html = fs.readFileSync(arquivoHtml, "utf8");
  fs.writeFileSync(arquivoHeaders, aplicar(fs.readFileSync(arquivoHeaders, "utf8"), html));
  console.log("CSP pronta com os hashes: " + hashesDosScripts(html).join(" "));
}
