import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { GatewayConfig } from "./config.js";
import { audit } from "./audit.js";

function inheritedEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }

  // Desktop Commander's own Remote Device sets this flag when it proxies to
  // the local MCP. It suppresses local-only UI behavior such as onboarding.
  env.DC_REMOTE_DEVICE = "true";
  return env;
}

export class DesktopCommanderClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly config: GatewayConfig) {}

  get ready(): boolean {
    return this.client !== null;
  }

  async ensureReady(): Promise<void> {
    if (this.client) return;
    if (!this.connectPromise) {
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = null;
      });
    }
    await this.connectPromise;
  }

  private async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: this.config.downstreamCommand,
      args: this.config.downstreamArgs,
      env: inheritedEnvironment(),
    });

    const client = new Client(
      { name: "remote-dev-mcp-gateway", version: "0.1.0" },
      { capabilities: {} },
    );

    client.onclose = () => {
      audit({ event: "downstream_closed" });
      if (this.client === client) {
        this.client = null;
        this.transport = null;
      }
    };

    client.onerror = (error) => {
      audit({
        event: "downstream_error",
        detail: error instanceof Error ? error.message : String(error),
      });
    };

    try {
      await client.connect(transport);
      await client.listTools();
      this.client = client;
      this.transport = transport;
      audit({ event: "downstream_ready" });
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Best-effort cleanup.
      }
      try {
        await transport.close();
      } catch {
        // Best-effort cleanup.
      }
      throw error;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    await this.ensureReady();

    try {
      return (await this.client!.callTool({
        name,
        arguments: args,
        _meta: {
          remote: true,
          clientInfo: { name: "remote-dev-mcp", version: "0.1.0" },
        },
      } as never)) as CallToolResult;
    } catch (error) {
      // A broken stdio child should be retried on the next gateway call rather
      // than wedging the gateway process forever.
      this.client = null;
      this.transport = null;
      throw error;
    }
  }

  async status(): Promise<{
    ready: boolean;
    toolCount: number;
    tools: string[];
  }> {
    await this.ensureReady();
    const listed = await this.client!.listTools();
    return {
      ready: true,
      toolCount: listed.tools.length,
      tools: listed.tools.map((tool) => tool.name),
    };
  }

  async close(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;

    try {
      await client?.close();
    } finally {
      try {
        await transport?.close();
      } catch {
        // Client close normally owns transport shutdown.
      }
    }
  }
}
