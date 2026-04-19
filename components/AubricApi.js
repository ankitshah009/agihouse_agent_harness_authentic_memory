const API_BASE = process.env.NEXT_PUBLIC_AUBRIC_API || "http://127.0.0.1:9000";

const toJson = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const request = async (path, init = {}, timeoutMs = 12000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...init,
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: body || `HTTP ${response.status}` };
    }

    const payload = await toJson(response);
    return payload;
  } catch (err) {
    return { ok: false, error: err ? String(err.message || err) : "request failed" };
  } finally {
    clearTimeout(timer);
  }
};

const unwrap = (res) => (res?.ok === false ? null : res);

export const listScenarios = async () => unwrap(await request("/api/scenarios"));
export const getChallenges = async (opts = {}) => {
  const qs = new URLSearchParams({ ...(opts || {}) }).toString();
  return unwrap(await request(`/api/challenges${qs ? `?${qs}` : ""}`));
};
export const getCurrentChallenge = async () => unwrap(await request("/api/challenges/current"));
export const getChallenge = async (id) => unwrap(await request(`/api/challenges/${encodeURIComponent(id)}`));
export const runScenarioStep = async (id, opts = {}) => unwrap(await request(`/api/challenges/${encodeURIComponent(id)}/run`, {
  method: "POST",
  body: JSON.stringify(opts || {}),
}));
export const runQuery = async (id) => unwrap(await request(`/api/challenges/${encodeURIComponent(id)}/query`));
export const getEpisodes = async (id) => unwrap(await request(`/api/challenges/${encodeURIComponent(id)}/episodes`));
export const resetDemo = async (opts = {}) => unwrap(await request("/api/demo/reset", {
  method: "POST",
  body: JSON.stringify(opts || {}),
}, 30000));
export const runAllScenarios = async (opts = {}) => unwrap(await request("/api/demo/run-all", {
  method: "POST",
  body: JSON.stringify(opts || {}),
}, 120000));
export const getAudit = async (branchRunId) => unwrap(await request(`/api/audit/${encodeURIComponent(branchRunId)}`));

export const prewarm = async () => unwrap(await request("/api/demo/prewarm", { method: "POST" }, 30000));

export const getDaytonaStatus = async () => unwrap(await request("/api/daytona/status"));

export const runDaytonaCode = async (code, opts = {}) =>
  unwrap(
    await request("/api/daytona/run", {
      method: "POST",
      body: JSON.stringify({ code, ...(opts.timeout ? { timeout: opts.timeout } : {}) }),
    }, 60000),
  );
