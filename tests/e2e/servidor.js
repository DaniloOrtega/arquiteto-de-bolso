// Servidor estático mínimo para os testes, com os mesmos cabeçalhos do _headers da Cloudflare.
const http = require("http");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const publicos = ["index.html", "sw.js", "manifest.webmanifest", "icons"];

// Lê os cabeçalhos de "/*" do arquivo _headers.
const cabecalhos = [];
let dentro = false;
for (const linha of fs.readFileSync(path.join(raiz, "_headers"), "utf8").split("\n")) {
  if (/^\S/.test(linha)) dentro = linha.trim() === "/*";
  else if (dentro && linha.includes(":")) {
    const i = linha.indexOf(":");
    cabecalhos.push([linha.slice(0, i).trim(), linha.slice(i + 1).trim()]);
  }
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const arquivo = path.join(raiz, rel);
  if (!publicos.some((p) => rel === p || rel.startsWith(p + "/")) || !fs.existsSync(arquivo)) {
    res.writeHead(404); return res.end();
  }
  cabecalhos.forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", tipos[path.extname(arquivo)] || "application/octet-stream");
  res.end(fs.readFileSync(arquivo));
}).listen(4173, () => console.log("Site de teste em http://localhost:4173"));
