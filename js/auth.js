// auth.js — Autenticação via Supabase Auth
(function () {
  window.Auth = {
    isLoggedIn() {
      return !!localStorage.getItem("sb_session");
    },
    async loginWithSupabase(email, password) {
      const url = (window.ENV?.SUPABASE_URL || "") + "/auth/v1/token?grant_type=password";
      const key = window.ENV?.SUPABASE_ANON_KEY || "";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": key },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.access_token) return false;
      localStorage.setItem("sb_session", JSON.stringify({
        token: data.access_token,
        expires_at: Date.now() + (data.expires_in * 1000),
      }));
      return true;
    },
    logout() {
      localStorage.removeItem("sb_session");
    },
    getToken() {
      try {
        const s = JSON.parse(localStorage.getItem("sb_session"));
        if (!s || Date.now() > s.expires_at) {
          this.logout();
          return null;
        }
        return s.token;
      } catch { return null; }
    },
  };
})();