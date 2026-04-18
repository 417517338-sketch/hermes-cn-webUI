/**
 * Hermes Agent WebUI - API Client
 * 
 * 基于 hermes-agent 官方 Web UI 的 api.ts 重构
 * 完整复用官方 Gateway API 类型定义
 */

const BASE = "";

// ── HTTP Client ────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

// Ephemeral session token for protected endpoints (reveal).
let _sessionToken: string | null = null;

async function getSessionToken(): Promise<string> {
  if (_sessionToken) return _sessionToken;
  const resp = await fetchJSON<{ token: string }>("/api/auth/session-token");
  _sessionToken = resp.token;
  return _sessionToken;
}

// ── API Response Types ─────────────────────────────────────────────────────

export interface PlatformStatus {
  error_code?: string;
  error_message?: string;
  state: string;
  updated_at: string;
}

export interface StatusResponse {
  active_sessions: number;
  config_path: string;
  config_version: number;
  env_path: string;
  gateway_exit_reason: string | null;
  gateway_pid: number | null;
  gateway_platforms: Record<string, PlatformStatus>;
  gateway_running: boolean;
  gateway_state: string | null;
  gateway_updated_at: string | null;
  hermes_home: string;
  latest_config_version: number;
  release_date: string;
  version: string;
}

export interface SessionInfo {
  id: string;
  source: string | null;
  model: string | null;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  last_active: number;
  is_active: boolean;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  preview: string | null;
}

/**
 * Server-side session format (maps from SQLite state.db)
 * Distinct from the official SessionInfo used by Hermes Agent web
 */
export interface SessionListItem {
  id: string
  title: string | null
  created_at: string   // ISO date string
  last_active: string // ISO date string
  message_count: number
  token_used: number
  model: string | null
  platform?: string
  source?: string | null
}

export interface PaginatedSessions {
  sessions: SessionListItem[]
  total: number
  limit: number
  offset: number
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  tool_name?: string;
  tool_call_id?: string;
  timestamp?: number;
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: SessionMessage[];
}

export interface LogsResponse {
  file: string;
  lines: string[];
}

export interface AnalyticsDailyEntry {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  estimated_cost: number;
  actual_cost: number;
  sessions: number;
}

export interface AnalyticsModelEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  sessions: number;
}

export interface AnalyticsResponse {
  daily: AnalyticsDailyEntry[];
  by_model: AnalyticsModelEntry[];
  totals: {
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_reasoning: number;
    total_estimated_cost: number;
    total_actual_cost: number;
    total_sessions: number;
  };
}

export interface CronJob {
  id: string;
  name?: string;
  prompt: string;
  schedule: { kind: string; expr: string; display: string };
  schedule_display: string;
  enabled: boolean;
  state: string;
  deliver?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface ToolsetInfo {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
}

export interface SessionSearchResult {
  session_id: string;
  snippet: string;
  role: string | null;
  source: string | null;
  model: string | null;
  session_started: number | null;
}

export interface SessionSearchResponse {
  results: SessionSearchResult[];
}

export interface EnvVarInfo {
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  url: string | null;
  category: string;
  is_password: boolean;
  tools: string[];
  advanced: boolean;
}

// ── OAuth Types ─────────────────────────────────────────────────────────────

export interface OAuthProviderStatus {
  logged_in: boolean;
  source?: string | null;
  source_label?: string | null;
  token_preview?: string | null;
  expires_at?: string | null;
  has_refresh_token?: boolean;
  last_refresh?: string | null;
  error?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  flow: "pkce" | "device_code" | "external";
  cli_command: string;
  docs_url: string;
  status: OAuthProviderStatus;
}

export interface OAuthProvidersResponse {
  providers: OAuthProvider[];
}

export type OAuthStartResponse =
  | { session_id: string; flow: "pkce"; auth_url: string; expires_in: number }
  | { session_id: string; flow: "device_code"; user_code: string; verification_url: string; expires_in: number; poll_interval: number };

export interface OAuthSubmitResponse {
  ok: boolean;
  status: "approved" | "error";
  message?: string;
}

export interface OAuthPollResponse {
  session_id: string;
  status: "pending" | "approved" | "denied" | "expired" | "error";
  error_message?: string | null;
  expires_at?: number | null;
}

// ── API Client ──────────────────────────────────────────────────────────────

export const api = {
  // Status & Health
  getStatus: () => fetchJSON<StatusResponse>("/api/status"),

  // Sessions
  getSessions: (limit = 20, offset = 0, search?: string) =>
    fetchJSON<PaginatedSessions>(
      `/api/sessions?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`
    ),
  getSessionMessages: (id: string) =>
    fetchJSON<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages`),
  deleteSession: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  searchSessions: (q: string) =>
    fetchJSON<SessionSearchResponse>(`/api/sessions/search?q=${encodeURIComponent(q)}`),

  // Logs
  getLogs: (params: { file?: string; lines?: number; level?: string; component?: string }) => {
    const qs = new URLSearchParams();
    if (params.file) qs.set("file", params.file);
    if (params.lines) qs.set("lines", String(params.lines));
    if (params.level && params.level !== "ALL") qs.set("level", params.level);
    if (params.component && params.component !== "all") qs.set("component", params.component);
    return fetchJSON<LogsResponse>(`/api/logs?${qs.toString()}`);
  },

  // Analytics
  getAnalytics: (days: number) =>
    fetchJSON<AnalyticsResponse>(`/api/analytics/usage?days=${days}`),

  // Memory
  getMemory: () => fetchJSON<{
    memories: Array<{
      id: string
      content: string
      created_at: string
      session_id?: string
      type: 'memory' | 'user'
    }>
    stats: {
      memory: { used: number; limit: number; percentage: number }
      user: { used: number; limit: number; percentage: number }
    }
  }>("/api/memory"),
  rebuildMemoryIndex: () =>
    fetchJSON<{ ok: boolean; message?: string }>("/api/memory/rebuild", { method: "POST" }),
  deleteMemory: (id: string) =>
    fetchJSON<{ ok: boolean; message?: string }>(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clearMemory: (type: 'memory' | 'user' | 'both') =>
    fetchJSON<{ ok: boolean; message?: string }>("/api/memory/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    }),

  // Config
  getConfig: () => fetchJSON<{ config: Record<string, unknown>; read_only: boolean }>("/api/config"),
  getDefaults: () => fetchJSON<Record<string, unknown>>("/api/config/defaults"),
  getSchema: () => fetchJSON<{ fields: Record<string, unknown>; category_order: string[] }>("/api/config/schema"),
  saveConfig: (config: Record<string, unknown>) =>
    fetchJSON<{ success: boolean; config: Record<string, unknown> }>("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  getConfigRaw: () => fetchJSON<{ yaml: string }>("/api/config/raw"),
  saveConfigRaw: (yaml_text: string) =>
    fetchJSON<{ ok: boolean }>("/api/config/raw", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml_text }),
    }),
  migrateConfig: () =>
    fetchJSON<{ ok: boolean }>("/api/config/migrate", { method: "POST" }),

  // Models
  getModels: () => fetchJSON<{
    current: { model: string; provider: string; base_url: string }
    quick_selection: { id: string; name: string; provider: string; provider_name: string }[]
    all_models: { id: string; name: string; provider: string; provider_name: string }[]
  }>("/api/models"),

  // Env vars
  getEnvVars: () => fetchJSON<Record<string, EnvVarInfo>>("/api/env"),
  setEnvVar: (key: string, value: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }),
  deleteEnvVar: (key: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
  revealEnvVar: async (key: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ key: string; value: string }>("/api/env/reveal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
    });
  },

  // Cron jobs — routes: GET /, POST /, GET /:id, PUT /:id, DELETE /:id,
  //   POST /:id/pause, POST /:id/resume, POST /:id/run, GET /:id/executions, POST /convert
  // Note: Cron.tsx calls these via direct fetch, not via api.* methods.

  // Skills & Toolsets
  getSkills: () => fetchJSON<SkillInfo[]>("/api/skills"),
  toggleSkill: (name: string, enabled: boolean) =>
    fetchJSON<{ ok: boolean }>("/api/skills/toggle", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled }),
    }),
  getToolsets: () => fetchJSON<ToolsetInfo[]>("/api/tools/toolsets"),
  toggleToolset: (name: string, enabled: boolean) =>
    fetchJSON<{ ok: boolean }>(`/api/tools/toolsets/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),

  // OAuth provider management
  getOAuthProviders: () =>
    fetchJSON<OAuthProvidersResponse>("/api/providers/oauth"),
  disconnectOAuthProvider: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean; provider: string }>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  },
  startOAuthLogin: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthStartResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      },
    );
  },
  submitOAuthCode: async (providerId: string, sessionId: string, code: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthSubmitResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, code }),
      },
    );
  },
  pollOAuthSession: (providerId: string, sessionId: string) =>
    fetchJSON<OAuthPollResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`,
    ),
  cancelOAuthSession: async (sessionId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean }>(
      `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  },

  // System info & settings
  getSystemInfo: () => fetchJSON<{
    webui_version: string
    agent_version: string
    hermes_home: string
    node_version: string
    platform: string
    theme: 'dark' | 'light' | 'system'
    language: string
  }>("/api/system"),
  setTheme: (theme: 'dark' | 'light' | 'system') =>
    fetchJSON<{ ok: boolean }>("/api/system/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    }),
  setLanguage: (language: string) =>
    fetchJSON<{ ok: boolean }>("/api/system/language", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    }),
  exportBackup: (): Promise<Blob> =>
    fetch(`${BASE}/api/system/backup`).then(r => {
      if (!r.ok) throw new Error('Failed to export backup')
      return r.blob()
    }),
  importBackup: (formData: FormData) =>
    fetch(`${BASE}/api/system/backup`, { method: "POST", body: formData }).then(r => r.json()),

  // Delegation
  getDelegations: () => fetchJSON<{
    tasks: Array<{
      id: string
      goal: string
      status: 'idle' | 'running' | 'done' | 'error'
      model?: string
      provider?: string
      created_at: string
      finished_at?: string
      result?: string
      error?: string
    }>
  }>("/api/delegation"),
  createDelegation: (task: {
    goal: string
    context?: string
    model?: string
    provider?: string
    toolsets?: string[]
  }) => fetchJSON<{ id: string; status: string; error?: string }>("/api/delegation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  }),
  getDelegation: (id: string) => fetchJSON<{
    id: string
    goal: string
    status: string
    result?: string
    error?: string
  }>(`/api/delegation/${id}`),
deleteDelegation: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/delegation/${id}`, { method: 'DELETE' }),

  // Direct Chat (non-Agent mode)
  sendDirectMessage: (body: { messages: Array<{role: string, content: string}>, model?: string, provider?: string, stream?: boolean }) =>
    fetch('/api/chat/direct', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }),

  // Startup
  getStartupStatus: () => fetchJSON<{
    running: boolean
    pid: number | null
    state: string
    exit_reason: string | null
    updated_at: string | null
  }>('/api/startup/status'),
  startGateway: () => fetchJSON<{
    success: boolean
    message: string
    pid: number | null
    state?: string
  }>('/api/startup/start', { method: 'POST' }),
  stopGateway: () => fetchJSON<{
    success: boolean
    message: string
    pid: number | null
  }>('/api/startup/stop', { method: 'POST' }),

  // Config maintenance
  configCheck: () => fetchJSON<{
    success: boolean
    output: string
    hasIssues: boolean
    error?: string | null
  }>('/api/startup/config-check', { method: 'POST' }),
  configMigrate: () => fetchJSON<{
    success: boolean
    output: string
    migrated: boolean
    error?: string | null
  }>('/api/startup/config-migrate', { method: 'POST' }),
  configFix: () => fetchJSON<{
    success: boolean
    fixed: boolean
    backupPath: string | null
    migrateOutput: string
    checkOutput: string
    message: string
    error?: string | null
  }>('/api/startup/config-fix', { method: 'POST' }),

  // Version & Update
  getVersion: () => fetchJSON<{
    success: boolean
    version: string
    raw: string
  }>('/api/startup/version'),
  getMirrors: () => fetchJSON<{
    mirrors: Array<{ id: string; label: string; gitUrl: string }>
  }>('/api/startup/mirrors'),
  checkUpdate: (mirror = 'github') => fetchJSON<{
    success: boolean
    output: string
    updateAvailable: boolean
    mirror: string
  }>('/api/startup/check-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mirror }) }),
  doUpdate: (mirror = 'github') => fetchJSON<{
    success: boolean
    message: string
    gatewayWasRunning: boolean
    mirror: string
  }>('/api/startup/do-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mirror }) }),
};
