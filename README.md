# Wayward CloudSave static Pages

Current client integration: **Wayward CloudSave 0.6.2**, PC `file://` authentication bridge protocol **v4**.

- Pages base URL: https://jeiky224.github.io/cloud/
- PC file bridge: https://jeiky224.github.io/cloud/file-auth.html
- Static source: `site/file-auth.html`, `site/file-auth.js`, `site/file-auth.css`, `site/config.js`
- Deployment source branch: `main` (the initial validated deployment was run from `work/cloudsave-pages-drive-owner-20261113`)
- Deployment workflow: `.github/workflows/deploy-pages.yml`

The v4 bridge validates the opener, opaque `file://` Origin, app ID, nonce, request/attempt/session IDs, and a single transferred MessagePort. The access token is delivered only through that selected port. The page communicates directly with Google Identity Services and Google Drive; no backend, proxy, worker, token broker, or relay is used.

Legacy `auth.html` and `auth-061.html` files are retained for older protocol clients. CloudSave 0.6.2 uses `file-auth.html`.

CI verifies JavaScript syntax and static protocol contracts. A successful CI run or Pages deployment does **not** prove a real Google account login, browser popup behavior, Drive CRUD, or device/runtime compatibility; those require live end-to-end tests.

## Repository purpose — CloudSave authentication Pages only

This repository exists **only to host and serve the static CloudSave authentication pages** at the Pages URL above. It is not a WAL/Wayward application development repository and must not be used as a development workspace, source-of-truth repository, or staging area for launcher, game, or other product features.

- All application, launcher, game, and product development belongs in the designated development repositories under the WAL Studio organization.
- This repository's scope is limited to the static authentication-page files and the minimum Pages deployment configuration required to keep the existing CloudSave authentication integration available and compatible.
- Do not start unrelated feature development, experimental implementation, or general application development here.
- Preserve the existing static Pages architecture, URL paths, bridge protocol, and compatibility with already released CloudSave clients.

In short: **CloudSave authentication page hosting only; no general development work in this repository.**
