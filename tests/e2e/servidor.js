// Servidor estático mínimo para os testes, com os mesmos cabeçalhos do _headers da Cloudflare.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { aplicar } = require("../../ferramentas/csp.js");

const raiz = path.join(__dirname, "..", "..");
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
// Lista fechada dos arquivos que o site publica. O endereço pedido só serve para
// procurar nesta lista: ele nunca vira caminho de arquivo (evita path traversal, "../").
const arquivos = new Map();
for (const nome of ["index.html", "sw.js", "manifest.webmanifest"]) arquivos.set("/" + nome, path.join(raiz, nome));
for (const nome of fs.readdirSync(path.join(raiz, "icons"))) arquivos.set("/icons/" + nome, path.join(raiz, "icons", nome));
arquivos.set("/", arquivos.get("/index.html"));

// Lê os cabeçalhos de "/*" do arquivo _headers, com os hashes da CSP preenchidos como na esteira.
const cabecalhos = [];
let dentro = false;
const headers = aplicar(fs.readFileSync(path.join(raiz, "_headers"), "utf8"), fs.readFileSync(path.join(raiz, "index.html"), "utf8"));
for (const linha of headers.split("\n")) {
  if (/^\S/.test(linha)) dentro = linha.trim() === "/*";
  else if (dentro && linha.includes(":") && !linha.trim().startsWith("#")) {
    const i = linha.indexOf(":");
    cabecalhos.push([linha.slice(0, i).trim(), linha.slice(i + 1).trim()]);
  }
}

http.createServer((req, res) => {
  const arquivo = arquivos.get(req.url.split("?")[0]);
  if (!arquivo) {
    res.writeHead(404); return res.end();
  }
  cabecalhos.forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", tipos[path.extname(arquivo)] || "application/octet-stream");
  res.end(fs.readFileSync(arquivo));
}).listen(4173, () => console.log("Site de teste em http://localhost:4173"));
