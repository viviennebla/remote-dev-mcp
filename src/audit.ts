export interface AuditEvent {
  event: string;
  tool?: string;
  ok?: boolean;
  duration_ms?: number;
  detail?: string;
}

export function audit(event: AuditEvent): void {
  process.stderr.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    }) + "\n",
  );
}

export async function audited<T>(tool: string, operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await operation();
    audit({ event: "tool_call", tool, ok: true, duration_ms: Date.now() - started });
    return result;
  } catch (error) {
    audit({
      event: "tool_call",
      tool,
      ok: false,
      duration_ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
