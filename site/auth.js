(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const gameOrigin = params.get('origin') || '';
  const nonce = params.get('nonce') || '';
  const mode = params.get('mode') === 'revoke' ? 'revoke' : 'login';
  const loginPolicy = params.get('login') === 'select_account' ? 'select_account' : 'remember';
  const clientId = String(window.WAYWARD_GOOGLE_CLIENT_ID || '').trim();
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const AUTH_ORIGIN = location.origin;

  const button = $('connect');
  const statusNode = $('status');
  const originTitle = $('origin-title');
  const originDetail = $('origin-detail');
  const confirmWrap = $('confirm-wrap');
  const confirmBox = $('confirm');
  const confirmCopy = $('confirm-copy');
  const manual = $('manual');
  const manualTitle = $('manual-title');
  const manualDetail = $('manual-detail');
  const payloadBox = $('payload');

  let ready = false;
  let finished = false;
  let openerVerified = false;
  let originConfirmed = false;
  let googleTokenClient = null;

  function status(message, error) {
    statusNode.textContent = String(message || '');
    statusNode.classList.toggle('error', error === true);
  }

  function classifyGameOrigin(value) {
    if (value === 'null') return 'file';
    let parsed;
    try { parsed = new URL(value); } catch (_) { return 'invalid'; }
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== value || parsed.username || parsed.password) return 'invalid';
    return parsed.protocol === 'https:' ? 'https' : 'http';
  }

  const originKind = classifyGameOrigin(gameOrigin);
  const fileMode = originKind === 'file';
  const nonceValid = /^[a-f0-9]{48}$/.test(nonce);
  const originValid = originKind !== 'invalid';

  function hasOpener() {
    try { return !!window.opener && !window.opener.closed; }
    catch (_) { return false; }
  }

  function postToGame(payload) {
    if (!openerVerified || !hasOpener()) return false;
    const target = fileMode ? '*' : gameOrigin;
    try {
      // file:// has an opaque origin, so '*' is unavoidable here. The game
      // must independently validate this page's exact HTTPS origin, popup
      // WindowProxy, nonce, type, token shape, and expiry before accepting.
      window.opener.postMessage(payload, target);
      return true;
    } catch (_) {
      return false;
    }
  }

  function showManual(payload, detail) {
    manual.hidden = false;
    manualTitle.textContent = payload && payload.type === 'wayward-cloud-auth-success'
      ? 'Google 인증 결과 수동 전달'
      : '인증 응답 수동 전달';
    manualDetail.textContent = detail ||
      '자동 전달이 되지 않았습니다. 아래 일회성 JSON을 복사해 원래 Wayward CloudSave 화면에 붙여 넣으세요.';
    payloadBox.value = JSON.stringify(payload);
    $('copy').focus();
  }

  function deliver(payload) {
    if (postToGame(payload)) {
      status('인증 결과를 원래 Wayward 창에 전달했습니다. 게임으로 돌아가세요.');
      button.disabled = true;
      setTimeout(() => { try { window.close(); } catch (_) {} }, 900);
      return true;
    }
    showManual(payload);
    status('게임 창으로 자동 전달되지 않았습니다. 아래 응답을 복사해 게임에 붙여 넣으세요.');
    return false;
  }

  function sendError(message, code) {
    if (finished) return;
    finished = true;
    const payload = {
      type: 'wayward-cloud-auth-error',
      nonce,
      code: String(code || 'auth_error'),
      message: String(message || 'Google 인증에 실패했습니다.')
    };
    if (!deliver(payload)) status(payload.message, true);
    button.disabled = true;
  }

  function updateControls() {
    const canUse = ready && nonceValid && originValid && originConfirmed && !finished;
    button.disabled = !canUse;
    if (mode === 'revoke') button.textContent = 'Google 권한 철회 대기';
    else button.textContent = loginPolicy === 'select_account'
      ? 'Google 계정 선택' : '기존 Google 계정으로 연결';
  }

  function onParentMessage(event) {
    if (!hasOpener() || event.source !== window.opener || !event.data ||
        event.data.nonce !== nonce) return;

    // For file://, the sender's serialized origin is the opaque string "null".
    // For HTTP(S), require an exact match to the origin bound into this request.
    if (fileMode ? event.origin !== 'null' : event.origin !== gameOrigin) return;

    if (event.data.type === 'wayward-cloud-auth-hello') {
      openerVerified = true;
      if (!fileMode) {
        originConfirmed = true;
        confirmWrap.hidden = true;
      }
      if (mode === 'revoke') {
        postToGame({ type: 'wayward-cloud-revoke-ready', nonce });
      } else {
        postToGame({ type: 'wayward-cloud-auth-ready', nonce });
      }
      originTitle.textContent = 'Wayward 게임 연결 확인됨';
      originDetail.textContent = fileMode
        ? 'file:// 게임 창과 nonce 연결을 확인했습니다. 불투명 출처이므로 아래 본인 확인도 필요합니다.'
        : '게임 창의 실제 origin과 일회성 nonce를 확인했습니다.';
      updateControls();
      return;
    }

    if (mode === 'revoke' && event.data.type === 'wayward-cloud-revoke') {
      revokeToken(event.data.accessToken);
    }
  }

  function revokeToken(token) {
    if (finished) return;
    if (typeof token !== 'string' || !token || token.length > 4096) {
      deliver({ type: 'wayward-cloud-revoke-result', nonce, revoked: false, error: 'invalid_token' });
      finished = true;
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.oauth2 ||
        typeof google.accounts.oauth2.revoke !== 'function') {
      deliver({ type: 'wayward-cloud-revoke-result', nonce, revoked: false, error: 'gis_unavailable' });
      finished = true;
      return;
    }
    status('Google에 앱 권한 철회를 직접 요청하고 있습니다.');
    try {
      google.accounts.oauth2.revoke(token, response => {
        if (finished) return;
        finished = true;
        const revoked = !!(response && response.successful === true);
        deliver({
          type: 'wayward-cloud-revoke-result',
          nonce,
          revoked,
          error: response && response.error ? String(response.error) : ''
        });
      });
    } catch (error) {
      finished = true;
      deliver({
        type: 'wayward-cloud-revoke-result',
        nonce,
        revoked: false,
        error: String(error && error.message || error)
      });
    }
  }

  function hasDriveScope(response) {
    try {
      if (google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) return true;
    } catch (_) {}
    return String(response && response.scope || '').split(/\s+/).includes(DRIVE_SCOPE);
  }

  function beginLogin() {
    if (!ready || !originConfirmed || finished || mode === 'revoke') return;
    button.disabled = true;
    status('Google 계정 선택 및 Drive 앱 데이터 접근 권한을 요청합니다.');
    try {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: true,
        callback: response => {
          if (!response || response.error || !response.access_token) {
            sendError(response && (response.error_description || response.error) ||
              'Google 액세스 토큰을 받지 못했습니다.', response && response.error);
            return;
          }
          if (response.state !== nonce) {
            sendError('Google 인증 응답 state가 현재 요청과 일치하지 않습니다.', 'state_mismatch');
            return;
          }
          if (!hasDriveScope(response)) {
            sendError('Google Drive 앱 데이터(appDataFolder) 권한이 승인되지 않았습니다.', 'scope_missing');
            return;
          }
          const expiresIn = Math.max(60, Math.min(3600, Number(response.expires_in) || 3600));
          const result = {
            type: 'wayward-cloud-auth-success',
            nonce,
            accessToken: String(response.access_token),
            expiresIn,
            scope: DRIVE_SCOPE
          };
          finished = true;
          deliver(result);
        },
        error_callback: error => {
          const code = String(error && error.type || 'popup_error');
          sendError(code === 'popup_closed'
            ? 'Google 계정 선택 창이 닫혔습니다.'
            : 'Google 인증 창을 열지 못했습니다. 팝업 정책을 확인하세요.', code);
        }
      });

      // Must be called synchronously from this button's user gesture.
      googleTokenClient.requestAccessToken({
        prompt: loginPolicy === 'select_account' ? 'select_account' : '',
        state: nonce
      });
    } catch (error) {
      sendError(String(error && error.message || error), 'request_failed');
    }
  }

  function waitForGIS(deadline) {
    if (window.google && google.accounts && google.accounts.oauth2 &&
        typeof google.accounts.oauth2.initTokenClient === 'function') {
      ready = true;
      if (mode === 'revoke') {
        button.disabled = true;
        button.textContent = 'Google 권한 철회 응답 대기';
        status(openerVerified
          ? '게임에서 권한 철회 요청을 기다리고 있습니다.'
          : '게임으로 돌아가 CloudSave의 권한 철회를 다시 실행하세요.');
      } else {
        status(originConfirmed
          ? 'Google 계정 연결을 시작할 수 있습니다.'
          : '계속하려면 실행 환경 확인란을 선택하세요.');
      }
      updateControls();
      return;
    }
    if (Date.now() >= deadline) {
      status('Google Identity 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.', true);
      button.disabled = true;
      return;
    }
    setTimeout(() => waitForGIS(deadline), 80);
  }

  // The static page announces readiness only after its document and listener
  // exist. The game validates this message's exact popup source, Pages origin,
  // and nonce before sending the hello handshake back.
  window.addEventListener('message', onParentMessage);

  if (!nonceValid || !originValid) {
    originTitle.textContent = '잘못된 인증 요청';
    originDetail.textContent = '게임에서 전달된 origin 또는 192-bit nonce 형식이 올바르지 않습니다.';
    status('인증 요청을 시작할 수 없습니다.', true);
    button.disabled = true;
    return;
  }

  if (fileMode) {
    confirmCopy.textContent = 'opaque origin인 file:// 게임에서 제가 직접 Google 연결을 시작했습니다.';
  } else if (!hasOpener()) {
    confirmCopy.textContent = '표시된 게임 origin에서 제가 직접 시작한 일회성 인증 요청입니다: ' + gameOrigin;
  } else {
    confirmCopy.textContent = '이 인증 요청을 Wayward 게임에서 직접 시작했습니다: ' + gameOrigin;
  }

  // A nonce-bound hello from the actual opener is required for automatic
  // delivery. A user confirmation enables the copy/paste path when the opener
  // is absent or has been severed by an external browser.
  confirmWrap.hidden = false;
  originConfirmed = false;
  confirmCopy.textContent = fileMode
    ? 'opaque origin인 file:// 게임에서 제가 직접 Google 연결을 시작했습니다.'
    : '이 주소의 Wayward 게임에서 제가 직접 시작한 인증 요청입니다: ' + gameOrigin;
  confirmBox.addEventListener('change', () => {
    originConfirmed = confirmBox.checked;
    updateControls();
    status(originConfirmed
      ? '실행 환경 확인을 완료했습니다. 자동 전달 또는 수동 복구를 사용할 수 있습니다.'
      : 'Google 인증을 시작하려면 확인란을 선택하세요.');
  });
  if (hasOpener()) {
    originTitle.textContent = 'Wayward 게임 연결 요청 확인 중';
    originDetail.textContent = fileMode
      ? 'file://의 opaque origin은 사용자가 확인해야 합니다. 게임과 nonce 연결도 함께 확인합니다.'
      : '게임의 실제 origin과 nonce 연결을 확인하고 있습니다.';
  } else {
    originTitle.textContent = '외부 브라우저 수동 복구 모드';
    originDetail.textContent = '게임 창으로 자동 전달할 수 없으면 인증 결과를 복사해 CloudSave에 붙여 넣습니다.';
  }

  if (!/^[^@\s]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    status('Google OAuth 공개 Client ID 설정이 올바르지 않습니다.', true);
    button.disabled = true;
    return;
  }

  if (mode === 'revoke') {
    button.hidden = true;
    if (!hasOpener()) {
      confirmWrap.hidden = true;
      originDetail.textContent = '외부 브라우저에서는 원래 게임의 권한 철회 요청을 받을 수 없습니다. 게임에서 다시 시도하거나 Google 계정 권한 관리 페이지를 이용하세요.';
      const link = document.createElement('a');
      link.href = 'https://myaccount.google.com/permissions';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Google 계정 앱 권한 관리';
      $('connection').append(link);
    }
  } else {
    button.addEventListener('click', beginLogin);
  }

  $('copy').addEventListener('click', async () => {
    const text = payloadBox.value;
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        status('인증 응답을 클립보드에 복사했습니다. Wayward로 돌아가 붙여 넣으세요.');
        return;
      }
    } catch (_) {}
    payloadBox.focus();
    payloadBox.select();
    status('자동 복사를 사용할 수 없습니다. 선택된 내용을 길게 눌러 복사하세요.');
  });

  $('select').addEventListener('click', () => {
    payloadBox.focus();
    payloadBox.select();
    status('전체 응답을 선택했습니다. 길게 눌러 복사하세요.');
  });

  // Do not race the about:blank popup. Announce page readiness from this
  // HTTPS document; the opener must validate origin/source/nonce and reply.
  if (hasOpener() && nonceValid && originValid) {
    try {
      window.opener.postMessage({
        type: 'wayward-cloud-auth-page-ready',
        nonce
      }, fileMode ? '*' : gameOrigin);
    } catch (_) {}
  }

  waitForGIS(Date.now() + 15000);
})();
