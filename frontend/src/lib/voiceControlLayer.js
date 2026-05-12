import { api } from '@/lib/api';

const OFFLINE_QUEUE_KEY = 'roadboss.voice.offline.queue.v1';

const AFFIRMATIVE = ['yes', 'yep', 'yeah', 'confirm', 'do it', 'go ahead', 'send it', 'correct'];
const NEGATIVE = ['no', 'cancel', 'never mind', 'nevermind', 'don\'t', 'do not'];
const INTERRUPT = ['stop', 'cancel', 'be quiet', 'hold up', 'pause', 'no wait'];
const UNDO = ['undo', 'revert', 'roll back', 'go back'];
const CORRECTION_PREFIX = ['no i said', 'no, i said', 'actually', 'correction'];

const CRITICAL_PATTERNS = [
  /\b(mark paid|paid in|charge\b|set price|invoice|bill this)\b/i,
  /\b(cancel|completed|complete (job|trip)|end trip)\b/i,
  /\b(send (sms|text)|text dispatch|message dispatch)\b/i,
];

const SENSITIVE_PATTERNS = [
  /\b(start trip|start inspection|log expense|new job|tow job|dispatch roadside)\b/i,
  /\b(change status|switch me to|on duty|off duty|sleeper|driving)\b/i,
];

const PHYSICAL_TASK_PATTERNS = [
  /\b(sign|signature|waiver|take photo|camera|scan document|upload photo)\b/i,
];

const toNorm = (text = '') => text.toLowerCase().trim().replace(/\s+/g, ' ');

export const parseVoiceDirective = (text = '') => {
  const norm = toNorm(text);
  if (!norm) return { type: 'empty', text: '' };
  if (UNDO.some((x) => norm.includes(x))) return { type: 'undo', text: norm };
  if (INTERRUPT.some((x) => norm.includes(x))) return { type: 'interrupt', text: norm };
  const correctionPrefix = CORRECTION_PREFIX.find((x) => norm.startsWith(x));
  if (correctionPrefix) {
    const corrected = norm.slice(correctionPrefix.length).replace(/^[\s,:-]+/, '').trim();
    return { type: 'correction', text: corrected || '' };
  }
  if (AFFIRMATIVE.some((x) => norm === x || norm.startsWith(`${x} `))) return { type: 'affirmative', text: norm };
  if (NEGATIVE.some((x) => norm === x || norm.startsWith(`${x} `))) return { type: 'negative', text: norm };
  return { type: 'normal', text: norm };
};

export const assessRiskLevel = (text = '') => {
  if (CRITICAL_PATTERNS.some((re) => re.test(text))) return 'critical';
  if (SENSITIVE_PATTERNS.some((re) => re.test(text))) return 'sensitive';
  return 'low';
};

export const shouldBlockForDrivingSafety = (text = '', speedMph = null) => {
  if (typeof speedMph !== 'number' || Number.isNaN(speedMph)) return false;
  if (speedMph < 8) return false;
  return PHYSICAL_TASK_PATTERNS.some((re) => re.test(text));
};

const readQueue = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (items) => {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items)); } catch {}
};

export const queueOfflineCommand = (message, meta = {}) => {
  const q = readQueue();
  q.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    meta,
    created_at: new Date().toISOString(),
  });
  writeQueue(q);
  return q.length;
};

export const getOfflineQueueSize = () => readQueue().length;

export const sendCopilotMessage = async (message, meta = {}) => {
  const r = await api.post('/copilot/chat', { message, meta });
  return r.data || {};
};

export const flushOfflineCommands = async ({ buildMeta, onItemSuccess, onItemError } = {}) => {
  const q = readQueue();
  if (!q.length) return 0;
  const remaining = [];
  for (const item of q) {
    try {
      const meta = { ...(item.meta || {}), ...(buildMeta ? buildMeta() : {}) };
      const data = await sendCopilotMessage(item.message, meta);
      try { onItemSuccess?.(item, data); } catch {}
    } catch (e) {
      remaining.push(item);
      try { onItemError?.(item, e); } catch {}
    }
  }
  writeQueue(remaining);
  return q.length - remaining.length;
};
