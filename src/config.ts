import os from "node:os";

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function parseArgs(value: string | undefined): string[] {
  if (!value) {
    return ["-y", "@wonderwhy-er/desktop-commander@latest"];
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("REMOTE_DEV_DOWNSTREAM_ARGS must be a JSON string array");
  }
  return parsed;
}

export interface GatewayConfig {
  host: string;
  port: number;
  hostName: string;
  token?: string;
  downstreamCommand: string;
  downstreamArgs: string[];
}

export function loadConfig(): GatewayConfig {
  return {
    host: process.env.REMOTE_DEV_HOST ?? "127.0.0.1",
    port: parseInteger(process.env.REMOTE_DEV_PORT, 8787),
    hostName: process.env.REMOTE_DEV_HOST_NAME ?? os.hostname(),
    token: process.env.REMOTE_DEV_TOKEN || undefined,
    downstreamCommand: process.env.REMOTE_DEV_DOWNSTREAM_COMMAND ?? "npx",
    downstreamArgs: parseArgs(process.env.REMOTE_DEV_DOWNSTREAM_ARGS),
  };
}
