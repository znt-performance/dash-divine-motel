# Ativação + configuração do cron-job.org

> owner/repo: `znt-performance/dash-divine-motel` · URL do Pages:
> `https://znt-performance.github.io/dash-divine-motel/` (mesmos valores de `config.js`).
> O **token nunca é comitado** no repositório: ele vai apenas no cron-job.org.

## Passo 1 — Branch `main`

`workflow_dispatch` (o que o cron-job.org chama) **só existe na branch padrão**.
O `.github/workflows/deploy.yml` já está na `main`. Todo push na `main` também
dispara o build.

Pages: **Settings → Pages → Source: GitHub Actions** (o workflow tenta ligar
sozinho com `configure-pages` + `enablement: true`; se falhar com
`Resource not accessible by integration`, ligue uma vez na mão e re-execute).

URL pública: `https://znt-performance.github.io/dash-divine-motel/`

## Passo 2 — Token (fine-grained)

GitHub → *Settings* → *Developer settings* → **Fine-grained tokens** → *Generate*:
- Repository access: **Only select repositories → `dash-divine-motel`**
- Permissions → **Actions: Read and write**

Guarde o token; ele vai só no cron-job.org (no lugar de `TOKEN_AQUI`).

## Passo 3 — Criar o cron job em https://cron-job.org

### URL
```
https://api.github.com/repos/znt-performance/dash-divine-motel/actions/workflows/deploy.yml/dispatches
```
### Método
```
POST
```
### Schedule
```
A cada 30 minutos  (Every 30 minutes)
```
### Headers (nome e valor em campos separados)

| Header | Valor |
|---|---|
| `Accept` | `application/vnd.github+json` |
| `Authorization` | `Bearer TOKEN_AQUI` |
| `X-GitHub-Api-Version` | `2022-11-28` |
| `Content-Type` | `application/json` |

### Request body
```
{"ref":"main"}
```

## Como saber se funcionou
- Resposta esperada da API: **HTTP 204 No Content**.
- Em **Actions** aparece uma nova execução *Build & Deploy Dashboard* a cada disparo.
- Na dashboard: "Última atualização" na topbar e `build ...` no rodapé do menu.
