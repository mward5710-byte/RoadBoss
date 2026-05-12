const STORAGE_KEY = 'roadboss.copilot.ui_context.v1';

function safeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

export function setCopilotScreenContext(patch = {}) {
  const w = safeWindow();
  if (!w) return;
  try {
    const prevRaw = w.sessionStorage.getItem(STORAGE_KEY);
    const prev = prevRaw ? JSON.parse(prevRaw) : {};
    const next = {
      ...prev,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    w.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}

export function clearCopilotScreenContext(screenKey) {
  const w = safeWindow();
  if (!w) return;
  try {
    if (!screenKey) {
      w.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const prevRaw = w.sessionStorage.getItem(STORAGE_KEY);
    const prev = prevRaw ? JSON.parse(prevRaw) : null;
    if (prev?.screen_key === screenKey) {
      w.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

export function getCopilotContextPayload() {
  const w = safeWindow();
  if (!w) return {};
  let ctx = {};
  try {
    const raw = w.sessionStorage.getItem(STORAGE_KEY);
    ctx = raw ? JSON.parse(raw) : {};
  } catch {
    ctx = {};
  }
  return {
    route: `${w.location.pathname || ''}${w.location.search || ''}`,
    screen_key: ctx.screen_key || null,
    screen_state: ctx.screen_state || {},
    draft_values: ctx.draft_values || {},
    touch_fallback: Boolean(ctx.touch_fallback),
    updated_at: ctx.updated_at || new Date().toISOString(),
  };
}
