window.AML_API = (() => {
  const toJson = (v) => {
    if (!v) return {};
    try { return JSON.parse(v); } catch { return {}; }
  };
  const apiBase = window.AML_BASE_URL || "";
  const api = async (path, init = {}, timeoutMs = 12000) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const headers = {
        "Accept": "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      };
      const response = await fetch(apiBase + path, {
        signal: ctrl.signal,
        headers,
        ...init,
      });
      clearTimeout(t);
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: body || `HTTP ${response.status}` };
      }
      const text = await response.text();
      const json = toJson(text);
      return Object.assign({ ok: true }, json);
    } catch (err) {
      return { ok: false, error: err ? String(err.message || err) : "request failed" };
    }
  };

  const unwrap = (res, fallback = null) => {
    if (!res || !res.ok) return fallback;
    return res;
  };

  return {
    listScenarios: async () => {
      return unwrap(await api("/api/scenarios"));
    },
    getChallenges: async (opts = {}) => {
      const qs = new URLSearchParams({ ...(opts || {}) }).toString();
      return unwrap(await api(`/api/challenges${qs ? `?${qs}` : ""}`));
    },
    getCurrentChallenge: async () => unwrap(await api("/api/challenges/current")),
    getChallenge: async (id) => unwrap(await api(`/api/challenges/${encodeURIComponent(id)}`)),
    runScenarioStep: async (id, opts = {}) => {
      const res = await api(`/api/challenges/${encodeURIComponent(id)}/run`, {
        method: "POST",
        body: JSON.stringify(opts || {}),
      });
      return unwrap(res);
    },
    getEpisodes: async (id) => {
      return unwrap(await api(`/api/challenges/${encodeURIComponent(id)}/episodes`));
    },
    runAllScenarios: async (opts = {}) => unwrap(await api(`/api/demo/run-all`, {
      method: "POST",
      body: JSON.stringify(opts || {}),
    })),
    runQuery: async (id) => {
      return unwrap(await api(`/api/challenges/${encodeURIComponent(id)}/query`));
    },
    resetDemo: async (opts = {}) => unwrap(await api(`/api/demo/reset`, {
      method: "POST",
      body: JSON.stringify(opts || {}),
    })),
    getAudit: async (branchRunId) => unwrap(await api(`/api/audit/${encodeURIComponent(branchRunId)}`)),
  };
})();
