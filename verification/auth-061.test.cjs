'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site/auth-061.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'site/auth-061.html'), 'utf8');
const PAGES_ORIGIN = 'https://jeiky224.github.io';
const GAME_ORIGIN = 'http://127.0.0.1:8080';
const NONCE = '0123456789abcdef0123456789abcdef0123456789abcdef';
const TOKEN = 'unit-test-access-token-not-persisted';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

function makePage({ gameOrigin = GAME_ORIGIN, login = 'remember', responseError = '', mode = 'login' } = {}) {
  const ids = ['origin-title','origin-detail','origin-value','account-status','status','connect'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    id, disabled: id === 'connect', textContent: '', listeners: Object.create(null),
    classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; }
  }]));
  const parentMessages = [];
  const parent = { closed: false, postMessage(data, targetOrigin) {
    parentMessages.push({ data, targetOrigin });
  } };
  const listeners = Object.create(null);
  const gisCalls = [];
  const google = { accounts: { oauth2: {
    initTokenClient(options) {
      return { requestAccessToken(request) {
        gisCalls.push({ request, scope: options.scope });
        if (responseError) options.callback({ error: responseError, error_description: responseError });
        else options.callback({ access_token: TOKEN, expires_in: 3600, scope: SCOPE, state: NONCE });
      } };
    },
    hasGrantedAllScopes(response, scope) {
      return String(response.scope || '').split(/\s+/).includes(scope);
    },
    revoke(token, callback) {
      gisCalls.push({ kind: 'revoke', token });
      callback({ successful: true });
    }
  } } };
  const window = {
    opener: parent, google,
    addEventListener(type, callback) { listeners[type] = callback; },
    close() {}
  };
  const location = {
    origin: PAGES_ORIGIN,
    search: '?origin=' + encodeURIComponent(gameOrigin) +
      '&nonce=' + encodeURIComponent(NONCE) + '&login=' + encodeURIComponent(login) +
      (mode === 'revoke' ? '&mode=revoke' : '')
  };
  const document = { getElementById(id) { return elements[id]; } };
  vm.runInNewContext(source, {
    window, location, document, google, URL, URLSearchParams, Date, String, Number,
    Math, RegExp, Promise, setTimeout() { return 1; }, clearTimeout() {}
  }, { filename: 'site/auth-061.js' });
  function handshake(eventOrigin = gameOrigin) {
    listeners.message({ source: parent, origin: eventOrigin, data: {
      type: 'wayward-cloud-auth-061-hello', version: 1, nonce: NONCE
    } });
  }
  function click() {
    if (elements.connect.listeners.click) elements.connect.listeners.click();
  }
  function sendParent(data, eventOrigin = gameOrigin) {
    listeners.message({ source: parent, origin: eventOrigin, data });
  }
  return { elements, parentMessages, parent, listeners, gisCalls, handshake, click, sendParent };
}

test('the 0.6.1 endpoint is separate from the 0.7.x session bridge', () => {
  assert.match(html, /auth-061\.js/);
  assert.match(html, /구글 계정으로 연결/);
  assert.doesNotMatch(source, /wayward-cloudsave-request|wayward-cloudsave-ready|sessionId/);
});
test('HTTP Origin handshake returns a nonce-bound one-time token', () => {
  const page = makePage();
  assert.equal(page.parentMessages[0].data.type, 'wayward-cloud-auth-061-ready');
  assert.equal(page.parentMessages[0].data.nonce, NONCE);
  assert.equal(page.parentMessages[0].targetOrigin, GAME_ORIGIN);
  page.handshake();
  assert.equal(page.elements.connect.disabled, false);
  page.click();
  const success = page.parentMessages.find(x => x.data.type === 'wayward-cloud-auth-success');
  assert.ok(success);
  assert.equal(success.data.nonce, NONCE);
  assert.equal(success.data.accessToken, TOKEN);
  assert.equal(success.data.expiresIn, 3600);
  assert.equal(success.targetOrigin, GAME_ORIGIN);
  assert.equal(page.gisCalls[0].request.prompt, '');
  assert.equal(page.gisCalls[0].request.state, NONCE);
});
test('file:// opaque Origin uses wildcard only for opener handoff', () => {
  const page = makePage({ gameOrigin: 'null' });
  assert.equal(page.parentMessages[0].targetOrigin, '*');
  page.handshake('null');
  page.click();
  const success = page.parentMessages.find(x => x.data.type === 'wayward-cloud-auth-success');
  assert.ok(success);
  assert.equal(success.targetOrigin, '*');
  assert.equal(success.data.nonce, NONCE);
});
test('explicit logout requests account selection', () => {
  const page = makePage({ login: 'select_account' });
  page.handshake();
  page.click();
  assert.equal(page.gisCalls[0].request.prompt, 'select_account');
});
test('a different parent Origin cannot establish the handshake', () => {
  const page = makePage();
  page.handshake('https://attacker.example');
  assert.equal(page.elements.connect.disabled, true);
  page.click();
  assert.equal(page.gisCalls.length, 0);
});
test('GIS failure is reported and the page remains retryable', () => {
  const page = makePage({ responseError: 'access_denied' });
  page.handshake();
  page.click();
  const failure = page.parentMessages.find(x => x.data.type === 'wayward-cloud-auth-error');
  assert.ok(failure);
  assert.equal(failure.data.nonce, NONCE);
  assert.equal(failure.data.code, 'access_denied');
  assert.equal(page.elements.connect.disabled, false);
});
test('token is not persisted and parent messages require source, origin and nonce', () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  assert.match(source, /event\.source === window\.opener/);
  assert.match(source, /event\.origin !== expectedGameOrigin\(\)/);
  assert.match(source, /data\.nonce !== nonce/);
});

test('0.6.1 endpoint supports the explicit Google permission revoke command', () => {
  const page = makePage({ mode: 'revoke' });
  page.handshake();
  assert.ok(page.parentMessages.some(x => x.data.type === 'wayward-cloud-revoke-ready'));
  page.sendParent({
    type: 'wayward-cloud-revoke', version: 1, nonce: NONCE, accessToken: TOKEN
  });
  const result = page.parentMessages.find(x => x.data.type === 'wayward-cloud-revoke-result');
  assert.ok(result);
  assert.equal(result.data.revoked, true);
  assert.equal(page.gisCalls.find(x => x.kind === 'revoke').token, TOKEN);
});
