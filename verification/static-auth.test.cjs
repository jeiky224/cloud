'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'site/auth.js'), 'utf8');
const driveSource = fs.readFileSync(path.join(root, 'site/drive.js'), 'utf8');
const authHtml = fs.readFileSync(path.join(root, 'site/auth.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'site/config.js'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'site/recovery.html'), 'utf8');

const CLIENT_ID = '35944231952-p82giir62o28bo001j9uvmqo3kgp9c99.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const PAGES_ORIGIN = 'https://jeiky224.github.io';
const NONCE = '0123456789abcdef0123456789abcdef0123456789abcdef';
const SESSION_ID = /^[a-f0-9]{48}$/;
const TOKEN = 'test-private-access-token-never-posted';

function element(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    textContent: '',
    href: '',
    target: '',
    rel: '',
    listeners: Object.create(null),
    classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() {},
    select() {},
    append() {}
  };
}

function makeDriveService() {
  let token = '';
  const calls = [];
  return {
    calls,
    get tokenForTestOnly() { return token; },
    setAccessToken(value, expiresIn) {
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
      token = value;
      calls.push({ kind: 'set-token', expiresIn });
    },
    clearAccessToken() {
      token = '';
      calls.push({ kind: 'clear-token' });
    },
    hasAccessToken() { return !!token; },
    async perform(action, payload) {
      calls.push({ kind: 'drive', action, payload });
      if (!token) throw Object.assign(new Error('no token'), { code: 'reauth-required' });
      if (action === 'list') return { files: [{ id: 'file-1', name: 'wayward-cloud-slot-1.json', modifiedTime: '2026-11-13T00:00:00Z' }] };
      if (action === 'read') return { slot: payload.slot, file: { id: 'file-1' }, envelope: { format: 'wayward-google-drive-save' } };
      if (action === 'save') return { saved: true, slot: payload.slot };
      if (action === 'delete') return { deleted: true, slot: payload.slot };
      throw Object.assign(new Error('unsupported'), { code: 'unsupported-command' });
    },
    async revokeAccess(revokeFn) {
      if (!token) return { successful: false };
      const oldToken = token;
      return new Promise(resolve => {
        revokeFn(oldToken, response => {
          token = '';
          calls.push({ kind: 'revoke', successful: !!(response && response.successful) });
          resolve({ successful: !!(response && response.successful) });
        });
      });
    }
  };
}

function runAuthPage({
  gameOrigin = 'null',
  opener = true,
  scope = DRIVE_SCOPE,
  revokeSuccessful = true,
  responseError = ''
} = {}) {
  const ids = [
    'connect','select-account','logout','revoke','status','account-status','drive-status',
    'origin-title','origin-detail','origin-value','confirm-wrap','confirm','confirm-copy'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  const parentMessages = [];
  const parent = opener ? {
    closed: false,
    postMessage(data, targetOrigin) { parentMessages.push({ data, targetOrigin }); }
  } : null;
  const eventListeners = Object.create(null);
  const drive = makeDriveService();
  const gisCalls = [];
  const gis = {
    accounts: {
      oauth2: {
        hasGrantedAllScopes(response, wanted) {
          return String(response.scope || '').split(/\s+/).includes(wanted);
        },
        initTokenClient(options) {
          return {
            requestAccessToken(request) {
              gisCalls.push({ request, scope: options.scope });
              if (responseError) {
                options.callback({ error: responseError, error_description: responseError });
              } else {
                options.callback({
                  access_token: TOKEN,
                  expires_in: 3600,
                  scope,
                  error: ''
                });
              }
            }
          };
        },
        revoke(token, callback) {
          gisCalls.push({ kind: 'revoke', token });
          callback({ successful: revokeSuccessful });
        }
      }
    }
  };
  const search = '?origin=' + encodeURIComponent(gameOrigin) +
    '&nonce=' + encodeURIComponent(NONCE);
  const location = { origin: PAGES_ORIGIN, search };
  const window = {
    location,
    opener: parent,
    google: gis,
    WAYWARD_GOOGLE_CLIENT_ID: CLIENT_ID,
    WaywardCloudSaveDrive: drive,
    addEventListener(type, callback) { eventListeners[type] = callback; },
    close() {}
  };
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = element(id)); }
  };
  const timers = [];
  vm.runInNewContext(authSource, {
    window, document, location, google: gis, crypto: webcrypto,
    URL, URLSearchParams, Uint8Array, Date, String, Number, Math, RegExp,
    setTimeout(callback, ms) { timers.push({ callback, ms }); return timers.length; },
    clearTimeout() {},
    setInterval(callback, ms) { timers.push({ callback, ms, interval: true }); return timers.length; },
    clearInterval() {}
  }, { filename: 'site/auth.js' });

  function sendParent(data, origin = gameOrigin, source = parent) {
    eventListeners.message({ data, origin, source });
  }
  function handshake() {
    sendParent({ type: 'wayward-cloudsave-hello', version: 1, nonce: NONCE });
    elements.confirm.checked = true;
    elements.confirm.listeners.change();
  }
  return {
    elements, parentMessages, parent, eventListeners, drive, gisCalls, timers,
    sendParent, handshake, sessionId: () => parentMessages.find(x =>
      x.data && x.data.type === 'wayward-cloudsave-ready')?.data.sessionId
  };
}

function requestData(sessionId, requestId, action, payload = {}) {
  return {
    type: 'wayward-cloudsave-request',
    version: 1,
    nonce: NONCE,
    sessionId,
    requestId,
    action,
    payload
  };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

test('file:// handshake uses wildcard only toward the opaque game origin; token never enters messages', async () => {
  const page = runAuthPage({ gameOrigin: 'null' });
  assert.equal(page.parentMessages[0].data.type, 'wayward-cloudsave-page-ready');
  assert.equal(page.parentMessages[0].targetOrigin, '*');

  page.handshake();
  const sessionId = page.sessionId();
  assert.match(sessionId, SESSION_ID);
  assert.equal(page.parentMessages[1].data.type, 'wayward-cloudsave-ready');
  assert.equal(page.parentMessages[1].targetOrigin, '*');

  page.elements.connect.listeners.click();
  assert.equal(page.drive.tokenForTestOnly, TOKEN);
  assert.equal(page.parentMessages.at(-1).data.type, 'wayward-cloudsave-status');
  assert.equal(page.parentMessages.at(-1).data.status, 'connected');
  assert.ok(!JSON.stringify(page.parentMessages).includes(TOKEN), 'no access token may cross postMessage');

  const requestId = 'abcdef0123456789abcdef0123456789abcdef0123456789';
  page.sendParent(requestData(sessionId, requestId, 'list'));
  await tick();
  const response = page.parentMessages.at(-1).data;
  assert.equal(response.type, 'wayward-cloudsave-response');
  assert.equal(response.requestId, requestId);
  assert.equal(response.ok, true);
  assert.equal(response.data.files[0].name, 'wayward-cloud-slot-1.json');

  const driveCount = page.drive.calls.filter(x => x.kind === 'drive').length;
  page.sendParent(requestData(sessionId, requestId, 'delete', { slot: 1 }));
  await tick();
  assert.equal(page.drive.calls.filter(x => x.kind === 'drive').length, driveCount,
    'a replayed request id must be rejected');
  assert.ok(!JSON.stringify(page.parentMessages).includes(TOKEN));
});

test('an HTTP 0.0.0.0 origin is returned to exactly that origin, not null or localhost', () => {
  const origin = 'http://0.0.0.0:8080';
  const page = runAuthPage({ gameOrigin: origin });
  assert.equal(page.parentMessages[0].targetOrigin, origin);
  page.handshake();
  assert.equal(page.parentMessages[1].targetOrigin, origin);
  assert.equal(page.parentMessages[1].data.type, 'wayward-cloudsave-ready');
});

test('localhost and 127.0.0.1 origins are not normalized to one another', () => {
  for (const origin of ['http://localhost:8080', 'http://127.0.0.1:8080']) {
    const page = runAuthPage({ gameOrigin: origin });
    assert.equal(page.parentMessages[0].targetOrigin, origin);
    page.handshake();
    assert.equal(page.parentMessages[1].targetOrigin, origin);
  }
});

test('wrong opener, wrong origin and wrong nonce cannot establish the bridge', () => {
  const page = runAuthPage({ gameOrigin: 'null' });
  const nonceWrong = 'ffffffffffffffffffffffffffffffffffffffffffffffff';
  page.sendParent({ type: 'wayward-cloudsave-hello', version: 1, nonce: nonceWrong });
  page.sendParent({ type: 'wayward-cloudsave-hello', version: 1, nonce: NONCE }, 'https://evil.example');
  page.sendParent({ type: 'wayward-cloudsave-hello', version: 1, nonce: NONCE }, 'null', { closed: false, postMessage() {} });
  assert.equal(page.parentMessages.filter(x => x.data.type === 'wayward-cloudsave-ready').length, 0);
  assert.equal(page.drive.calls.filter(x => x.kind === 'set-token').length, 0);
  assert.equal(page.drive.calls.filter(x => x.kind === 'set-token').length, 0);
});

test('no opener fails closed and does not show an access-token paste fallback', () => {
  const page = runAuthPage({ gameOrigin: 'null', opener: false });
  assert.equal(page.elements.connect.disabled, true);
  assert.match(page.elements.status.textContent, /게임 창/);
  assert.doesNotMatch(authHtml, /textarea|payload-box/i);
  assert.match(recovery, /토큰을 게임 파일로 복사/);
});

test('scope missing and consent denied remain distinct states and never set a token', () => {
  const scopePage = runAuthPage({ gameOrigin: 'null', scope: 'openid email' });
  scopePage.handshake();
  scopePage.elements.connect.listeners.click();
  assert.ok(scopePage.parentMessages.some(x => x.data.status === 'scope-missing'));
  assert.equal(scopePage.drive.calls.filter(x => x.kind === 'set-token').length, 0);

  const denied = runAuthPage({ gameOrigin: 'null', responseError: 'access_denied' });
  denied.handshake();
  denied.elements.connect.listeners.click();
  assert.ok(denied.parentMessages.some(x => x.data.status === 'consent-denied'));
  assert.equal(denied.drive.calls.filter(x => x.kind === 'set-token').length, 0);
});

test('pagehide notifies the game and destroys its in-memory access token', () => {
  const page = runAuthPage({ gameOrigin: 'null' });
  page.handshake();
  page.elements.connect.listeners.click();
  assert.equal(page.drive.tokenForTestOnly, TOKEN);
  assert.equal(typeof page.eventListeners.pagehide, 'function');
  page.eventListeners.pagehide();
  assert.equal(page.drive.tokenForTestOnly, '');
  assert.ok(page.parentMessages.some(x => x.data.status === 'reauth-required'));
  assert.ok(!JSON.stringify(page.parentMessages).includes(TOKEN));
});

test('explicit logout clears only in-memory token; revoke succeeds only on a positive GIS result', async () => {
  const loggedOut = runAuthPage({ gameOrigin: 'null' });
  loggedOut.handshake();
  loggedOut.elements.connect.listeners.click();
  loggedOut.elements.logout.listeners.click();
  assert.equal(loggedOut.drive.tokenForTestOnly, '');
  assert.ok(loggedOut.parentMessages.some(x => x.data.status === 'logged-out'));
  assert.equal(loggedOut.gisCalls.some(x => x.kind === 'revoke'), false);

  const revokeSuccess = runAuthPage({ gameOrigin: 'null', revokeSuccessful: true });
  revokeSuccess.handshake();
  revokeSuccess.elements.connect.listeners.click();
  revokeSuccess.elements.revoke.listeners.click();
  await tick();
  assert.ok(revokeSuccess.parentMessages.some(x => x.data.status === 'permission-revoked'));
  assert.equal(revokeSuccess.drive.tokenForTestOnly, '');

  const revokeFailure = runAuthPage({ gameOrigin: 'null', revokeSuccessful: false });
  revokeFailure.handshake();
  revokeFailure.elements.connect.listeners.click();
  revokeFailure.elements.revoke.listeners.click();
  await tick();
  assert.ok(revokeFailure.parentMessages.some(x => x.data.status === 'revoke-failed'));
  assert.ok(!revokeFailure.parentMessages.some(x => x.data.status === 'permission-revoked'));
});

test('Drive service performs list/read/update/create/delete only on Google with bearer token private to the page', async () => {
  const calls = [];
  const file = { id: 'file-1', name: 'wayward-cloud-slot-1.json', modifiedTime: '2026-11-13T00:00:00Z' };
  const envelope = {
    format: 'wayward-google-drive-save', version: 1, keyMode: 'embedded-addon-v2',
    cipher: 'AES-256-GCM', iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA=='
  };
  const responses = [
    { ok: true, status: 200, json: async () => ({ files: [file] }) },
    { ok: true, status: 200, json: async () => envelope },
    { ok: true, status: 200, json: async () => ({ id: 'file-1' }) },
    { ok: true, status: 200, json: async () => ({ files: [file] }) },
    { ok: true, status: 200, json: async () => ({ id: 'file-2' }) },
    { ok: true, status: 200, json: async () => ({ files: [file] }) },
    { ok: true, status: 204, json: async () => ({}) }
  ];
  const window = {};
  const sandbox = {
    window, URLSearchParams, Uint8Array, crypto: webcrypto, TextEncoder, TextDecoder,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch');
      return next;
    },
    Date, Math, Number, String, Object, Array, Map, Set, Error, RegExp, Promise
  };
  vm.runInNewContext(driveSource, sandbox, { filename: 'site/drive.js' });
  const drive = window.WaywardCloudSaveDrive;
  drive.setAccessToken(TOKEN, 3600);

  const listed = await drive.perform('list', {});
  assert.equal(listed.files[0].id, 'file-1');
  const read = await drive.perform('read', { slot: 1 });
  assert.equal(read.envelope.format, envelope.format);
  await drive.perform('save', { slot: 1, envelope });
  await drive.perform('save', { slot: 2, envelope });
  await drive.perform('delete', { slot: 1 });

  assert.ok(calls.every(x => x.url.startsWith('https://www.googleapis.com/')));
  assert.ok(calls.every(x => x.options.credentials === 'omit'));
  assert.ok(calls.every(x => x.options.headers.Authorization === 'Bearer ' + TOKEN));
  assert.ok(calls.some(x => x.options.method === 'PATCH'));
  assert.ok(calls.some(x => x.options.method === 'POST'));
  assert.ok(calls.some(x => x.options.method === 'DELETE'));
  assert.ok(calls[0].url.includes('spaces=appDataFolder'));
});

test('expired or revoked Drive tokens map to a re-authentication error without storage fallback', async () => {
  const window = {};
  const sandbox = {
    window, URLSearchParams, Uint8Array, crypto: webcrypto, TextEncoder, TextDecoder,
    fetch: async () => ({ ok: false, status: 401, clone: () => ({ json: async () => ({ error: { status: 'UNAUTHENTICATED' } }) }) }),
    Date, Math, Number, String, Object, Array, Map, Set, Error, RegExp, Promise
  };
  vm.runInNewContext(driveSource, sandbox, { filename: 'site/drive.js' });
  const drive = window.WaywardCloudSaveDrive;
  drive.setAccessToken(TOKEN, 3600);
  await assert.rejects(() => drive.perform('list', {}), error => error.code === 'reauth-required');
  assert.equal(drive.hasAccessToken(), false);
});

test('generic Drive permission denial is not mislabeled as permission revocation', async () => {
  const window = {};
  const sandbox = {
    window, URLSearchParams, Uint8Array, crypto: webcrypto, TextEncoder, TextDecoder,
    fetch: async () => ({
      ok: false, status: 403,
      clone: () => ({ json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'Policy denied' } }) })
    }),
    Date, Math, Number, String, Object, Array, Map, Set, Error, RegExp, Promise
  };
  vm.runInNewContext(driveSource, sandbox, { filename: 'site/drive.js' });
  const drive = window.WaywardCloudSaveDrive;
  drive.setAccessToken(TOKEN, 3600);
  await assert.rejects(() => drive.perform('list', {}), error => error.code === 'permission-denied');
  assert.equal(drive.hasAccessToken(), true, 'a generic 403 must not erase a still-valid token');
});

test('static page uses the exact existing public Web Client ID and has no refresh-token storage or relay', () => {
  assert.ok(config.includes(CLIENT_ID));
  assert.ok(authHtml.includes('https://accounts.google.com/gsi/client'));
  assert.ok(authHtml.includes('./drive.js'));
  assert.ok(authHtml.includes('https://www.googleapis.com'));
  assert.doesNotMatch(authSource, /localStorage|sessionStorage|indexedDB|refresh_token|refreshToken|client_secret|console\.log/i);
  assert.doesNotMatch(driveSource, /localStorage|sessionStorage|indexedDB|refresh_token|refreshToken|client_secret|console\.log/i);
  const sendFn = authSource.slice(
    authSource.indexOf('function sendToGame('),
    authSource.indexOf('function sendStatus(', authSource.indexOf('function sendToGame('))
  );
  assert.doesNotMatch(sendFn, /accessToken|access_token/);
  for (const banned of ['vercel.app', 'workers.dev', 'cloudflare', 'render.com', 'wss://', 'ws://']) {
    assert.ok(!authSource.includes(banned) && !driveSource.includes(banned), 'forbidden service: ' + banned);
  }
  assert.ok(authSource.includes('event.source === window.opener'));
  assert.ok(authSource.includes('event.origin === expectedEventOrigin'));
  assert.ok(authSource.includes('nativeTransportRequested'));
  assert.ok(authSource.includes("init.type !== 'wayward-cloudsave-cct-init'"));
  assert.ok(authSource.includes('event.ports.length !== 1'));
  assert.ok(authSource.includes('nativePort.postMessage(raw)'));
  assert.ok(authSource.includes('event.origin !== AUTH_ORIGIN'));
  assert.ok(authSource.includes("if (!nativeTransportRequested && !openerAlive())"));
  assert.ok(authSource.includes("data.type === 'wayward-cloudsave-native-close'"));
  assert.ok(authSource.includes('window.addEventListener(\'message\', onParentMessage)'));
  assert.ok(authSource.includes('seenRequestIds.has(data.requestId)'));
});
