'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'site/auth.js'), 'utf8');
const authHtml = fs.readFileSync(path.join(root, 'site/auth.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'site/config.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'site/recovery.html'), 'utf8');
const CLIENT_ID = '35944231952-p82giir62o28bo001j9uvmqo3kgp9c99.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH_ORIGIN = 'https://jeiky224.github.io';

function makeElement(id) {
  return {
    id, hidden: false, disabled: false, checked: false, value: '',
    textContent: '', href: '', target: '', rel: '',
    classList: { toggle() {} },
    listeners: Object.create(null),
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() {}, select() {},
    append() {}
  };
}

function runPage({ gameOrigin, nonce, opener = true, mode = 'login' }) {
  const ids = [
    'connect','status','origin-title','origin-detail','confirm-wrap','confirm',
    'confirm-copy','manual','manual-title','manual-detail','payload','copy',
    'select','connection'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, makeElement(id)]));
  const messages = [];
  const parent = opener ? {
    closed: false,
    postMessage(data, targetOrigin) { messages.push({ data, targetOrigin }); }
  } : null;
  const listeners = Object.create(null);
  const gisCalls = [];
  const gis = {
    accounts: {
      oauth2: {
        hasGrantedAllScopes(response, scope) {
          return scope === DRIVE_SCOPE && String(response.scope || '').includes(scope);
        },
        initTokenClient(options) {
          return {
            requestAccessToken(request) {
              gisCalls.push({ request, scope: options.scope });
              options.callback({
                access_token: 'test-access-token-only',
                expires_in: 3600,
                scope: options.scope
              });
            }
          };
        },
        revoke(token, callback) {
          gisCalls.push({ revokeToken: token });
          callback({ successful: true });
        }
      }
    }
  };
  const location = {
    origin: AUTH_ORIGIN,
    search: '?origin=' + encodeURIComponent(gameOrigin) +
      '&nonce=' + encodeURIComponent(nonce) +
      '&mode=' + encodeURIComponent(mode)
  };
  const window = {
    location, opener: parent, google: gis,
    addEventListener(type, callback) { listeners[type] = callback; },
    close() {}
  };
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = makeElement(id)); },
    createElement() { return makeElement('created'); }
  };
  const navigator = { clipboard: { async writeText() {} } };
  const timers = [];
  vm.runInNewContext(authSource, {
    window, document, location, google: gis, navigator,
    URL, URLSearchParams, Date, String, Number, Math, RegExp,
    setTimeout(callback, ms) { timers.push({ callback, ms }); return timers.length; },
    clearTimeout() {}
  }, { filename: 'site/auth.js' });
  return { elements, messages, parent, listeners, gisCalls, timers, window, gis };
}

test('file:// opaque-origin handoff uses wildcard only on the auth sender and a nonce-bound popup', () => {
  const nonce = '0123456789abcdef0123456789abcdef0123456789abcdef';
  const page = runPage({ gameOrigin: 'null', nonce });
  assert.equal(page.elements['confirm-wrap'].hidden, false);
  assert.equal(page.elements.connect.disabled, true);

  page.listeners.message({
    source: page.parent,
    origin: 'null',
    data: { type: 'wayward-cloud-auth-hello', nonce }
  });
  assert.equal(page.messages[0].data.type, 'wayward-cloud-auth-ready');
  assert.equal(page.messages[0].targetOrigin, '*');
  assert.equal(page.elements.connect.disabled, true, 'file mode still requires explicit user confirmation');

  page.elements.confirm.checked = true;
  page.elements.confirm.listeners.change();
  assert.equal(page.elements.connect.disabled, false);
  page.elements.connect.listeners.click();

  const result = page.messages.at(-1);
  assert.equal(result.targetOrigin, '*');
  assert.equal(result.data.type, 'wayward-cloud-auth-success');
  assert.equal(result.data.nonce, nonce);
  assert.equal(result.data.accessToken, 'test-access-token-only');
  assert.equal(page.gisCalls[0].scope, DRIVE_SCOPE);
  assert.equal(page.gisCalls[0].request.state, nonce);
});

test('0.0.0.0 is treated as a concrete HTTP origin, not as opaque file origin', () => {
  const nonce = 'abcdef0123456789abcdef0123456789abcdef0123456789';
  const origin = 'http://0.0.0.0:8090';
  const page = runPage({ gameOrigin: origin, nonce });
  page.listeners.message({
    source: page.parent,
    origin,
    data: { type: 'wayward-cloud-auth-hello', nonce }
  });
  assert.equal(page.elements['confirm-wrap'].hidden, true);
  assert.equal(page.elements.connect.disabled, false);
  page.elements.connect.listeners.click();
  const result = page.messages.at(-1);
  assert.equal(result.targetOrigin, origin);
  assert.equal(result.data.type, 'wayward-cloud-auth-success');
});

test('external-browser/no-opener mode exposes a manual response instead of failing', () => {
  const nonce = 'fedcba9876543210fedcba9876543210fedcba9876543210';
  const page = runPage({ gameOrigin: 'http://127.0.0.1:8080', nonce, opener: false });
  assert.equal(page.elements['confirm-wrap'].hidden, false);
  page.elements.confirm.checked = true;
  page.elements.confirm.listeners.change();
  page.elements.connect.listeners.click();
  assert.equal(page.elements.manual.hidden, false);
  const payload = JSON.parse(page.elements.payload.value);
  assert.equal(payload.type, 'wayward-cloud-auth-success');
  assert.equal(payload.nonce, nonce);
  assert.equal(payload.accessToken, 'test-access-token-only');
  assert.equal(page.messages.length, 0);
});

test('revoke mode waits for the opener handshake and sends the revoke result back directly', () => {
  const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef';
  const page = runPage({ gameOrigin: 'null', nonce, opener: true, mode: 'revoke' });
  assert.equal(page.elements.connect.hidden, true);
  page.listeners.message({
    source: page.parent,
    origin: 'null',
    data: { type: 'wayward-cloud-auth-hello', nonce }
  });
  assert.equal(page.messages[0].data.type, 'wayward-cloud-revoke-ready');
  page.listeners.message({
    source: page.parent,
    origin: 'null',
    data: { type: 'wayward-cloud-revoke', nonce, accessToken: 'test-token-to-revoke' }
  });
  assert.equal(page.gisCalls[0].revokeToken, 'test-token-to-revoke');
  assert.equal(page.messages.at(-1).data.type, 'wayward-cloud-revoke-result');
  assert.equal(page.messages.at(-1).data.revoked, true);
  assert.equal(page.messages.at(-1).targetOrigin, '*');
});

test('the static site contains only a public client ID and explicit recovery guidance', () => {
  assert.match(config, /WAYWARD_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(config, /client_secret|refresh_token/i);
  assert.match(authHtml, /accounts\.google\.com\/gsi\/client/);
  assert.match(authHtml, /auth\.js/);
  assert.match(recovery, /복사/);
  assert.match(recovery, /URL/);
  assert.doesNotMatch(authSource, /vercel\.app|workers\.dev|cloudflare|render\.com|wss?:\/\//i);
  assert.doesNotMatch(authSource, /localStorage|sessionStorage|console\.log/);
  assert.match(authSource, /event\.source !== window\.opener/);
  assert.match(authSource, /event\.data\.nonce/);
  assert.match(authSource, /fileMode \? '\\*' : gameOrigin/);
  assert.doesNotMatch(index, /location\.replace/);
});
