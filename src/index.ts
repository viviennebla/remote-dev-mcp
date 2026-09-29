import { randomUUID } from "node:crypto";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { audit } from "./audit.js";
import { loadConfig } from "./config.js";
import { DesktopCommanderClient } from "./desktop-commander.js";
import { createGatewayServer } from "./gateway.js";

const config = loadConfig();
const downstream = new DesktopCommanderClient(config);
const app = express();

app.use(express.json({ limit: "2mb" }));

function requireOptionalToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.token) {
    next();
    return;
  }

  if (req.headers.authorization === `Bearer ${config.token}`) {
    next();
    return;
  }

  res.status(401).json({ error: "unauthorized" });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    host: config.hostName,
    downstream_connected: downstream.ready,
  });
});

app.use("/mcp", requireOptionalToken);

type Session = {
  server: ReturnType<typeof createGatewayServer>;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, Session>();

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

async function handleSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"];
  if (typeof sessionId !== "string") {
    jsonRpcError(res, 400, "Missing MCP session ID");
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    jsonRpcError(res, 404, "Unknown MCP session");
    return;
  }

  await session.transport.handleRequest(req, res, req.body);
}

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") {
      await handleSessionRequest(req, res);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      jsonRpcError(res, 400, "Expected MCP initialize request");
      return;
    }

    let transport!: StreamableHTTPServerTransport;
    const server = createGatewayServer(config, downstream);

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport });
        audit({ event: "mcp_session_started", detail: id });
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        sessions.delete(id);
        audit({ event: "mcp_session_closed", detail: id });
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    audit({
      event: "mcp_request_error",
      detail: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      jsonRpcError(res, 500, "Internal gateway error");
    }
  }
});

app.get("/mcp", async (req, res) => {
  try {
    await handleSessionRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      jsonRpcError(
        res,
        500,
        error instanceof Error ? error.message : "Internal gateway error",
      );
    }
  }
});

app.delete("/mcp", async (req, res) => {
  try {
    await handleSessionRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      jsonRpcError(
        res,
        500,
        error instanceof Error ? error.message : "Internal gateway error",
      );
    }
  }
});

const listener = app.listen(config.port, config.host, () => {
  audit({
    event: "gateway_started",
    detail: `http://${config.host}:${config.port}/mcp host=${config.hostName}`,
  });
});

async function shutdown(signal: string): Promise<void> {
  audit({ event: "gateway_stopping", detail: signal });

  listener.close();
  for (const { transport } of sessions.values()) {
    try {
      await transport.close();
    } catch {
      // Best-effort shutdown.
    }
  }
  sessions.clear();
  await downstream.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
