import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { audited } from "./audit.js";
import type { GatewayConfig } from "./config.js";
import { DesktopCommanderClient } from "./desktop-commander.js";

export function createGatewayServer(
  config: GatewayConfig,
  downstream: DesktopCommanderClient,
): McpServer {
  const server = new McpServer({
    name: "remote-dev-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "status",
    {
      title: "Remote dev status",
      description: "Check this remote development host and its local MCP downstream.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      audited("status", async () => {
        const status = await downstream.status();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  host: config.hostName,
                  gateway: "ready",
                  downstream: status.ready ? "ready" : "unavailable",
                  downstream_tool_count: status.toolCount,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "exec_command",
    {
      title: "Execute command",
      description:
        "Run a shell command on the development host. If it outlives timeout_ms, the returned PID can be followed with read_process_output.",
      inputSchema: {
        command: z.string().min(1).describe("Shell command to execute"),
        timeout_ms: z.number().int().positive().optional().default(30_000),
        shell: z.string().optional().describe("Optional shell executable"),
      },
    },
    async ({ command, timeout_ms, shell }) =>
      audited("exec_command", () =>
        downstream.callTool("start_process", {
          command,
          timeout_ms,
          ...(shell ? { shell } : {}),
        }),
      ),
  );

  server.registerTool(
    "start_process",
    {
      title: "Start process",
      description:
        "Start a long-running shell process and return its Desktop Commander session PID.",
      inputSchema: {
        command: z.string().min(1).describe("Shell command to start"),
        timeout_ms: z.number().int().positive().optional().default(1_000),
        shell: z.string().optional().describe("Optional shell executable"),
      },
    },
    async ({ command, timeout_ms, shell }) =>
      audited("start_process", () =>
        downstream.callTool("start_process", {
          command,
          timeout_ms,
          ...(shell ? { shell } : {}),
        }),
      ),
  );

  server.registerTool(
    "read_process_output",
    {
      title: "Read process output",
      description:
        "Read output from a process started by start_process. offset=0 reads new output; negative offsets tail from the end.",
      inputSchema: {
        pid: z.number().int(),
        timeout_ms: z.number().int().nonnegative().optional(),
        offset: z.number().int().optional(),
        length: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ pid, timeout_ms, offset, length }) =>
      audited("read_process_output", () =>
        downstream.callTool("read_process_output", {
          pid,
          ...(timeout_ms !== undefined ? { timeout_ms } : {}),
          ...(offset !== undefined ? { offset } : {}),
          ...(length !== undefined ? { length } : {}),
        }),
      ),
  );

  server.registerTool(
    "stop_process",
    {
      title: "Stop process",
      description: "Force-stop a process session previously started by start_process.",
      inputSchema: {
        pid: z.number().int(),
      },
    },
    async ({ pid }) =>
      audited("stop_process", () =>
        downstream.callTool("force_terminate", { pid }),
      ),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Read a file from the development host with optional pagination.",
      inputSchema: {
        path: z.string().min(1).describe("File path on the development host"),
        offset: z.number().int().optional().default(0),
        length: z.number().int().positive().optional().default(1_000),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, offset, length }) =>
      audited("read_file", () =>
        downstream.callTool("read_file", { path, offset, length }),
      ),
  );

  server.registerTool(
    "write_file",
    {
      title: "Write file",
      description: "Rewrite or append a text file on the development host.",
      inputSchema: {
        path: z.string().min(1),
        content: z.string(),
        mode: z.enum(["rewrite", "append"]).optional().default("rewrite"),
      },
    },
    async ({ path, content, mode }) =>
      audited("write_file", () =>
        downstream.callTool("write_file", { path, content, mode }),
      ),
  );

  server.registerTool(
    "edit_file",
    {
      title: "Edit file",
      description:
        "Apply an exact text replacement to a file. Prefer this for small code edits.",
      inputSchema: {
        path: z.string().min(1),
        old_string: z.string(),
        new_string: z.string(),
        expected_replacements: z.number().int().positive().optional().default(1),
      },
    },
    async ({ path, old_string, new_string, expected_replacements }) =>
      audited("edit_file", () =>
        downstream.callTool("edit_block", {
          file_path: path,
          old_string,
          new_string,
          expected_replacements,
        }),
      ),
  );

  return server;
}
