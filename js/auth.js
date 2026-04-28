/**
 * auth.js — Authentication module
 * Credentials are obfuscated (not stored as plaintext)
 */

(function () {
  'use strict';

  // Credentials stored as Base64-encoded segments, never as plaintext
  // Assembled at runtime only during validation — not exposed in DOM
  const _seg = [
    'Y29udGF0b0BnZXJhY2Fv',
    'dGVjaC5pZWwtY2Uub3Jn',
    'LmJy'
  ];
  const _codeSegs = [
    'R3RlY2hSZWMt',
    'QWRtaW4t',
    'MjAyNiE='
  ];

  function _resolve(segs) {
    try {
      return atob(segs.join(''));
    } catch {
      return '';
    }
  }

  function _checkCredentials(email, code) {
    const validEmail = _resolve(_seg);
    const validCode  = _resolve(_codeSegs);
    return email.trim() === validEmail && code === validCode;
  }

  const SK = 'gt_session_v1';

  window.Auth = {
    isLoggedIn() {
      try {
        const s = localStorage.getItem(SK);
        if (!s) return false;
        const { t, h } = JSON.parse(s);
        // Basic integrity check: hash must match expected derivation
        return h === btoa('gt_' + t).slice(0, 16);
      } catch {
        return false;
      }
    },

    login(email, code) {
      if (!_checkCredentials(email, code)) return false;
      const t = Date.now().toString(36);
      const h = btoa('gt_' + t).slice(0, 16);
      localStorage.setItem(SK, JSON.stringify({ t, h }));
      return true;
    },

    logout() {
      localStorage.removeItem(SK);
    }
  };
})();
