(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const gameOrigin = params.get('origin') || '';
  const nonce = params.get('nonce') || '';
  const mode = params.get('mode') === 'revoke' ? 'revoke' : 'login';
  const loginPolicy = params.get('login') === 'select_account' ? 'select_account' : 'remember';
  const authOrigin = location.origin;
  const clientId = '35944231952-p82giir62o28bo001j9uvmqo3kgp9c99.apps.googleusercontent.com';
  const driveScope = 'https://www.googleapis.com/auth/drive.appdata';
  const protocolVersion = 1;
  const originTitle = document.getElementById('origin-title');
  const originDetail = document.getElementById('origin-detail');
  const originValue = document.getElementById('origin-value');
  const accountStatus = document.getElementById('account-status');
  const statusNode = document.getElementById('status');
  const connectButton = document.getElementById('connect');
  const fileMode = gameOrigin === 'null';
  let parentReady = false;
  let requestInFlight = false;
  let completed = false;
  let revokeReadySent = false;

  function setStatus(message, error) {
    statusNode.textContent = String(message || '');
    statusNode.classList.toggle('error', error === true);
  }
  function setAccountStatus(message, error) {
    accountStatus.textContent = String(message || '');
    accountStatus.classList.toggle('error', error === true);
  }
  function validGameOrigin(value) {
    if (value === 'null') return true;
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.origin === value && !parsed.username && !parsed.password;
    } catch (_) { return false; }
  }
  function expectedGameOrigin() { return fileMode ? 'null' : gameOrigin; }
  function targetGameOrigin() {
    // Opaque file:// origins cannot be supplied as postMessage targetOrigin.
    // The wildcard is limited to the opener and this fresh 192-bit nonce.
    return fileMode ? '*' : gameOrigin;
  }
  function parentAlive() {
    try { return !!window.opener && !window.opener.closed; }
    catch (_) { return false; }
  }
  const nonceValid = /^[a-f0-9]{48}$/.test(nonce);
  const originValid = validGameOrigin(gameOrigin);
  function sendToParent(type, extra) {
    if (!parentReady || !parentAlive() || !nonceValid || !originValid) return false;
    const payload = Object.assign({ type, version: protocolVersion, nonce }, extra || {});
    try {
      window.opener.postMessage(payload, targetGameOrigin());
      return true;
    } catch (_) { return false; }
  }
  function gisReady() {
    return !!(window.google && window.google.accounts &&
      window.google.accounts.oauth2 &&
      typeof window.google.accounts.oauth2.initTokenClient === 'function');
  }
  function updateButton() {
    connectButton.disabled = !parentReady || !gisReady() || requestInFlight || completed;
  }
  function handleParentMessage(event) {
    const data = event && event.data;
    if (!data || typeof data !== 'object' ||
        !parentAlive() || event.source !== window.opener ||
        event.origin !== expectedGameOrigin() ||
        data.version !== protocolVersion || data.nonce !== nonce) return;

    if (data.type === 'wayward-cloud-auth-061-hello' && !parentReady) {
      parentReady = true;
      originTitle.textContent = 'Wayward 게임 연결 확인됨';
      originDetail.textContent = fileMode
        ? 'file:// 실행 창의 opaque Origin(null), 실제 opener 창 및 일회성 nonce를 확인했습니다.'
        : '실제 게임 opener 창, 요청 Origin 및 일회성 nonce를 확인했습니다.';
      originValue.textContent = '게임 Origin: ' + gameOrigin;
      if (mode === 'revoke') {
        setAccountStatus('Google 앱 권한 철회 요청을 확인했습니다.');
        setStatus('Google 권한 철회 응답을 처리할 준비가 되었습니다.');
        sendRevokeReady();
      } else {
        setAccountStatus('Google 계정을 연결할 준비가 되었습니다.');
        setStatus(loginPolicy === 'select_account'
          ? '로그아웃 후 재연결 요청입니다. Google 계정 선택 화면을 표시합니다.'
          : '기존 Google 로그인 및 승인 상태를 재사용하도록 시도합니다.');
        updateButton();
      }
      return;
    }

    if (!parentReady || mode !== 'revoke' || data.type !== 'wayward-cloud-revoke') return;
    const token = data.accessToken;
    if (typeof token !== 'string' || token.length < 16 || token.length > 4096) {
      sendToParent('wayward-cloud-revoke-result', { revoked: false, error: 'invalid-token' });
      setStatus('철회 요청의 토큰 형식이 올바르지 않습니다.', true);
      return;
    }
    if (!gisReady() || typeof google.accounts.oauth2.revoke !== 'function') {
      sendToParent('wayward-cloud-revoke-result', { revoked: false, error: 'gis-unavailable' });
      setStatus('Google 권한 철회 서비스를 사용할 수 없습니다.', true);
      return;
    }
    if (requestInFlight || completed) return;
    requestInFlight = true;
    try {
      google.accounts.oauth2.revoke(token, response => {
        const revoked = !!(response && response.successful === true);
        completed = true;
        requestInFlight = false;
        sendToParent('wayward-cloud-revoke-result', {
          revoked, error: String(response && response.error || '')
        });
        setAccountStatus(revoked
          ? 'Google 앱 권한을 철회했습니다.'
          : 'Google 앱 권한 철회를 확인하지 못했습니다.', !revoked);
        setStatus(revoked
          ? 'Google 앱 권한 철회가 완료되었습니다.'
          : 'Google 앱 권한 철회에 실패했습니다.', !revoked);
        setTimeout(() => { try { window.close(); } catch (_) {} }, 700);
      });
    } catch (error) {
      requestInFlight = false;
      sendToParent('wayward-cloud-revoke-result', {
        revoked: false, error: String(error && error.message || error)
      });
      setStatus('Google 앱 권한 철회 실패: ' + String(error && error.message || error), true);
    }
  }

  function sendRevokeReady() {
    if (mode !== 'revoke' || revokeReadySent || !parentReady || !gisReady() ||
        typeof google.accounts.oauth2.revoke !== 'function') return;
    revokeReadySent = true;
    sendToParent('wayward-cloud-revoke-ready');
  }

  function fail(message, code) {
    requestInFlight = false;
    completed = false;
    setAccountStatus(message, true);
    setStatus(message, true);
    if (parentReady) sendToParent('wayward-cloud-auth-error', {
      code: String(code || 'auth-failed'),
      message: String(message || 'Google 인증에 실패했습니다.')
    });
    updateButton();
  }
  function beginLogin() {
    if (!parentReady || !parentAlive() || requestInFlight || completed) return;
    if (!gisReady()) {
      fail('Google 인증 라이브러리를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.', 'gis-unavailable');
      return;
    }
    requestInFlight = true;
    updateButton();
    setAccountStatus('Google 계정과 Drive 접근 권한을 확인하고 있습니다.');
    setStatus('Google 인증을 시작합니다…');
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: driveScope,
        include_granted_scopes: true,
        callback: response => {
          if (!response || response.error || !response.access_token) {
            fail(String(response && (response.error_description || response.error) ||
              'Google 액세스 토큰을 받지 못했습니다.'),
              String(response && response.error || 'token-error'));
            return;
          }
          if (response.state && response.state !== nonce) {
            fail('Google 인증 state가 일치하지 않습니다.', 'state-mismatch');
            return;
          }
          let granted = false;
          try { granted = google.accounts.oauth2.hasGrantedAllScopes(response, driveScope); }
          catch (_) {}
          if (!granted) granted = String(response.scope || '').split(/\s+/).includes(driveScope);
          if (!granted) {
            fail('Google Drive appData 접근 권한이 승인되지 않았습니다.', 'scope_missing');
            return;
          }
          const expiresIn = Number(response.expires_in);
          if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 7200) {
            fail('Google 액세스 토큰 만료 시간이 올바르지 않습니다.', 'invalid-token-response');
            return;
          }
          if (!sendToParent('wayward-cloud-auth-success', {
            accessToken: response.access_token, expiresIn
          })) {
            fail('Google 인증은 완료했지만 게임 창에 토큰을 안전하게 전달하지 못했습니다.', 'handoff-failed');
            return;
          }
          completed = true;
          requestInFlight = false;
          connectButton.disabled = true;
          setAccountStatus('Google 계정 연결이 완료되었습니다.');
          setStatus('인증이 완료되었습니다. 게임으로 돌아갑니다.');
          setTimeout(() => { try { window.close(); } catch (_) {} }, 700);
        },
        error_callback: error => {
          const code = String(error && error.type || 'popup-error');
          const message = code === 'popup_closed'
            ? 'Google 계정 선택 창이 닫혔습니다. 다시 연결 버튼을 누르면 재시도할 수 있습니다.'
            : code === 'popup_failed_to_open'
              ? '브라우저가 Google 계정 창을 차단했습니다. 팝업을 허용한 뒤 다시 시도하세요.'
              : 'Google 인증 UI를 시작하지 못했습니다: ' + code;
          fail(message, code);
        }
      });
      // GIS must be called directly from the user's click handler.
      client.requestAccessToken({
        prompt: loginPolicy === 'select_account' ? 'select_account' : '',
        state: nonce
      });
    } catch (error) {
      fail(String(error && error.message || error || 'Google 인증을 시작하지 못했습니다.'), 'request-failed');
    }
  }
  if (!nonceValid || !originValid || !/^https?:$/.test(authOrigin)) {
    setStatus('잘못된 인증 요청입니다. 게임에서 다시 연결하세요.', true);
    connectButton.disabled = true;
    return;
  }
  window.addEventListener('message', handleParentMessage);
  if (mode === 'revoke') {
    connectButton.hidden = true;
    connectButton.disabled = true;
    connectButton.textContent = 'Google 권한 철회';
  } else {
    connectButton.addEventListener('click', beginLogin);
    connectButton.textContent = '구글 계정으로 연결';
  }
  updateButton();
  if (!parentAlive()) {
    setStatus('Wayward 게임 창을 찾을 수 없습니다. 게임에서 연결 버튼을 다시 누르세요.', true);
    return;
  }
  try {
    window.opener.postMessage({
      type: 'wayward-cloud-auth-061-ready', version: protocolVersion, nonce
    }, targetGameOrigin());
  } catch (_) {
    setStatus('Wayward 게임 창에 연결 준비 메시지를 보내지 못했습니다.', true);
  }
  const waitForGIS = deadline => {
    if (gisReady()) {
      updateButton();
      sendRevokeReady();
      return;
    }
    if (Date.now() >= deadline) {
      setStatus('Google 인증 라이브러리를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.', true);
      return;
    }
    setTimeout(() => waitForGIS(deadline), 100);
  };
  waitForGIS(Date.now() + 20000);
})();
