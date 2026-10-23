# Segurança

Achou uma falha de segurança no Arquiteto de Bolso? Por favor, não abra uma issue pública.
Use a aba **Security > Report a vulnerability** deste repositório para avisar em particular.

## O que a esteira confere em cada mudança

| Etapa | Ferramenta | Onde ver |
| --- | --- | --- |
| Lint e testes | ESLint, `tests/check.js` | Actions > Esteira > Testes |
| SAST (código) | CodeQL | Security > Code scanning |
| SCA (bibliotecas) | Dependabot, Dependency Review | Security > Dependabot e o próprio PR |
| Segredos | Gitleaks, secret scanning do GitHub | Actions > Esteira > Segredos |
| Cabeçalhos | `_headers` na Cloudflare Pages | Actions > Esteira > Publicar |
| DAST (site no ar) | OWASP ZAP | Actions > Esteira > DAST (relatório em anexo) |
| Monitoramento | checagem de hora em hora | Actions > Monitoramento e issues |
