# Wayward CloudSave static Pages

Current client integration: **Wayward CloudSave 0.6.2**, PC `file://` authentication bridge protocol **v4**.

- Pages base URL: https://jeiky224.github.io/cloud/
- PC file bridge: https://jeiky224.github.io/cloud/file-auth.html
- Static source: `site/file-auth.html`, `site/file-auth.js`, `site/file-auth.css`, `site/config.js`
- Deployment source branch: `work/cloudsave-pages-drive-owner-20261113`
- Deployment workflow: `.github/workflows/deploy-pages.yml`

The v4 bridge validates the opener, opaque `file://` Origin, app ID, nonce, request/attempt/session IDs, and a single transferred MessagePort. The access token is delivered only through that selected port. The page communicates directly with Google Identity Services and Google Drive; no backend, proxy, worker, token broker, or relay is used.

Legacy `auth.html` and `auth-061.html` files are retained for older protocol clients. CloudSave 0.6.2 uses `file-auth.html`.

CI verifies JavaScript syntax and static protocol contracts. A successful CI run or Pages deployment does **not** prove a real Google account login, browser popup behavior, Drive CRUD, or device/runtime compatibility; those require live end-to-end tests.
