# MANDATORY CLOUDSAVE ARCHITECTURE SPECIFICATION

**Status: NON-NEGOTIABLE / MUST FOLLOW**
**Repository:** `jeiky224/cloud`
**Scope:** Wayward CloudSave authentication and Google Drive access across every supported client/runtime.

This document is a binding architectural constraint for every contributor, coding agent, maintainer, implementation, migration, review, and release. Read it before proposing or changing authentication, CloudSave, launcher, WML, or runtime integration code.

## 1. Absolute product requirements

1. CloudSave must provide the same user-visible experience and the same save/load capabilities in every supported environment: Android launcher/app, embedded WebView, ordinary browser, `http://127.0.0.1`, `http://0.0.0.0`, other local HTTP origins, and direct `file://` HTML execution.
2. The **only** intermediary between the Wayward mod/client and Google may be one static authentication page hosted from this repository (for example, GitHub Pages). The page consists only of static HTML, CSS, and JavaScript.
3. After the static page is delivered, the client/page communicates directly with Google OAuth and Google Drive APIs. No other service may participate in the required login, token, save, load, list, refresh/re-authentication, or account-selection path.
4. No authentication backend, API relay, proxy, token broker, serverless function, edge worker, database, hosted session service, or vendor-specific runtime may be introduced.
5. Vercel, Cloudflare, Render, Firebase, Supabase, or any other hosting/backend provider must not be a runtime dependency for CloudSave authentication or Drive operations. They may not be described as required infrastructure or silently inserted as a fallback.
6. The mod/client must not need a different CloudSave implementation or a different user workflow depending on whether it runs in a launcher, app, WebView, local HTTP origin, or `file://` context.

**Architecture invariant:** `Wayward client/mod <-> the one static auth page <-> Google OAuth / Google Drive`. No other network hop or service is allowed. Where the static page is opened by the client, the page may return the resulting authorization material directly to that client using an environment-appropriate local handoff (for example, opener messaging, an app deep link, or an explicit copy/paste fallback). Such handoff must not introduce a server.

## 2. Explicitly prohibited designs

Reject any proposal or patch that:
- routes OAuth authorization codes, access tokens, refresh tokens, DPoP proofs, save payloads, or Drive requests through a custom server or proxy;
- requires a Vercel Function, Cloudflare Worker, Render service, or any other backend to complete login or token exchange;
- stores Google client secrets, private keys, or other confidential credentials in this public repository or static client code;
- makes login depend on an account/session hosted by an intermediary provider;
- requires a specific origin such as `127.0.0.1` while breaking `0.0.0.0`, `file://`, WebView, or launcher execution;
- claims universal compatibility without testing the actual browser/runtime security restrictions;
- silently weakens OAuth state validation, PKCE (where supported), nonce/state binding, redirect validation, token audience/scope checks, or secure token storage to work around a runtime limitation;
- silently changes save format, encryption, key derivation, account identity, slot semantics, or existing user data.

A backend-based fallback is still prohibited. If one environment cannot complete a required operation under the static-only architecture, report the exact platform restriction and provide a client-side-compatible resolution or clearly mark the environment unsupported pending resolution. Do not add a server.

## 3. OAuth and Google API security model

- Use a Google-supported public-client/browser authorization flow that does not require a client secret in shipped code. Select the exact Google OAuth client type and flow only after checking current Google requirements for each target runtime.
- The static page must perform authorization directly with Google and call Google Drive APIs directly. It must not forward credentials to any third party.
- Use least-privilege Drive scopes. Request only the scopes required by the existing CloudSave data model.
- Validate OAuth state and the complete redirect/return transaction. Use PKCE wherever the selected Google flow and client type support it. Never invent or ship a client secret.
- Treat access tokens as bearer credentials: do not log them, put them in URLs, or expose them to unrelated origins or windows.
- Persist credentials only in the user-controlled device/app secure storage appropriate to the runtime. Never persist them in GitHub Pages, a public repository, a third-party database, or server logs.
- Re-authentication must be initiated directly with Google when Google-issued credentials expire or are revoked. Do not imply that a static-only public client can securely mint or refresh confidential-client refresh tokens.
- Existing users must receive a migration path that preserves their Drive files, encryption keys, save data, and account association. Do not clear or overwrite existing credentials/data as a migration shortcut.

## 4. Runtime parity requirements

Implement a small, explicit client-side compatibility layer for:
- Android launcher / native app bridge;
- Android WebView;
- ordinary browser over HTTPS;
- local HTTP including both `127.0.0.1` and `0.0.0.0`;
- direct `file://` execution.

The compatibility layer may select a different **local handoff mechanism** per runtime, but it must preserve the same CloudSave screens, account selection, save/list/load behavior, and error semantics. It must not select a different backend or route requests through a relay.

Do not assume browser APIs, popup behavior, storage, CORS, redirects, or opener messaging work identically across these contexts. Probe capabilities and implement/test the appropriate client-side path. Where Google itself blocks a specific origin or OAuth client type, document the exact restriction and the supported direct-to-Google alternative. Never disguise a platform restriction as a successful test.

## 5. Backward compatibility / preservation

Before changing implementation, inspect and document the actual existing CloudSave v0.4.4 and v0.6.1 authentication and storage flows. Preserve unless a verified incompatibility requires a narrowly scoped migration:
- existing Google Drive save files and their identifiers;
- encryption/decryption format and device-held key material;
- account identity and account-selection behavior;
- save slots, listing, loading, overwrite, and deletion semantics;
- existing session/token storage where safe and compatible;
- launcher and WML integration contracts.

Do not change game logic, RNG, save schema, or unrelated launcher behavior as part of authentication migration.

## 6. Mandatory acceptance tests

A release is not complete until the same test suite passes for every target environment, or an exact externally imposed Google/browser limitation is documented with a direct-to-Google client-side resolution:

1. Start login from the client and complete Google authorization.
2. Return authorization to the originating client without a backend.
3. Select an account and confirm the expected Drive identity.
4. List existing saves, create a save, overwrite it, load it, and delete it.
5. Verify encryption/decryption and that the existing save format remains readable.
6. Close and reopen the app/browser; verify safe credential persistence and expected re-auth behavior.
7. Revoke Google access and verify a clear recovery path.
8. Test `127.0.0.1`, `0.0.0.0`, direct `file://`, Android WebView, and launcher/app paths independently.
9. Block or disable all non-Google hosting/backend providers and verify CloudSave login and Drive operations still work.
10. Inspect network traffic: after static page delivery, required auth and Drive traffic must go only to Google endpoints and local client handoff. No custom API host may be contacted.

For every test, record device/runtime, origin, Google OAuth client type, flow, exact steps, result, and evidence. A code review or simulated response is not an end-to-end test.

## 7. Required implementation workflow

1. Inspect the current repository, existing CloudSave implementations, and actual deployed/static auth page before editing.
2. Record repository, branch, commit SHA, file paths, and relevant file hashes/sizes. Do not overwrite unrelated work.
3. Create an isolated work branch. Make the smallest possible changes.
4. Write down the chosen Google public-client flow and verify it against current Google documentation before coding.
5. Implement the static page and client-side runtime handoff only. No backend files or deployment configuration for an auth server.
6. Run syntax checks, static checks, diff checks, and the full runtime acceptance matrix.
7. Report passed and failed tests separately. Never claim an environment works unless it was actually tested.

## 8. Conflict rule

This specification overrides any previous design note, task instruction, implementation, deployment convention, or agent suggestion that introduces a required intermediary service. If another instruction conflicts with this document, stop and ask for clarification rather than implementing the conflicting architecture.

**Non-negotiable summary:** One static authentication page in this repository. Direct communication between that page/client and Google. No server, proxy, worker, relay, broker, database, or other intermediary. Same CloudSave experience across all target environments, with honest reporting of any Google-imposed platform limitation.
