export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  data?: EmployeeRow[];
  type?: string;
  error?: boolean;
}

export interface EmployeeRow {
  EMPID?: string | number | null;
  EMPNAME?: string | null;
  EMPMOB?: string | null;
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  type?: string;
  answer?: string;
  data?: EmployeeRow[];
  error?: string;
  query?: {
    operation: string;
    table: string;
    columns: string[];
    limit: number;
  };
  systemStatus?: SystemStatus;
}

export interface ServiceStatus {
  status: string;
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string | null;
}

export interface SystemStatus {
  checkedAt: string;
  overall: 'UP' | 'DOWN' | 'DEGRADED';
  nodejs: ServiceStatus;
  nvidia: ServiceStatus;
  javaApi: ServiceStatus;
  jdbc: { status: string };
  ddf: { status: string };
  db2: { status: string; server: string | null; responseTimeMs?: number; error?: string | null };
}

export interface HealthResponse {
  success: boolean;
  status: string;
  timestamp: string;
}

const API_BASE = '';

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The backend returned an invalid response.');
  }
  return data as T;
}

export async function checkHealth(): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/health`, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    throw new Error('Could not reach the Node.js service.');
  }
  if (!res.ok) throw new Error(`Health check failed (${res.status}).`);
  return parseResponse<HealthResponse>(res);
}

export async function getSystemStatus(): Promise<SystemStatus> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/system-status`, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    throw new Error('Could not reach the Node.js service.');
  }
  if (!res.ok) {
    const body = await parseResponse<{ error?: string }>(res).catch(() => ({ error: undefined }));
    throw new Error(body.error ?? `System status check failed (${res.status}).`);
  }
  const wrapped = await parseResponse<{ success: boolean; status?: SystemStatus; error?: string }>(res);
  if (!wrapped.status) {
    throw new Error(wrapped.error ?? 'System status response was missing the status payload.');
  }
  return wrapped.status;
}

export async function sendChat(
  message: string,
  history: ChatHistoryEntry[]
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
  } catch {
    throw new Error(
      'Could not reach the chatbot backend. Please check that the Node.js service is running.'
    );
  }

  const fallback: ChatResponse = { success: false, error: 'The chatbot request failed.' };
  const data = await parseResponse<ChatResponse>(res).catch(() => fallback);

  if (!res.ok && !data.success) {
    throw new Error(data.error ?? 'The chatbot request failed.');
  }

  return data;
}
