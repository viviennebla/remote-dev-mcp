import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const port = 18787;
const baseUrl = `http://127.0.0.1:${port}`;
const smokeFile = "/tmp/remote-dev-mcp-smoke.txt";

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n");
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Gateway is still starting.
    }
    await sleep(500);
  }
  throw new Error("gateway health endpoint did not become ready");
}

async function main(): Promise<void> {
  const gateway = spawn(process.execPath, ["dist/src/index.js"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      REMOTE_DEV_HOST: "127.0.0.1",
      REMOTE_DEV_PORT: String(port),
      REMOTE_DEV_HOST_NAME: "ci-smoke",
    },
  });

  try {
    await waitForHealth();

    const client = new Client({
      name: "remote-dev-mcp-smoke",
      version: "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);

    const tools = await client.listTools();
    const required = [
      "status",
      "exec_command",
      "start_process",
      "read_process_output",
      "read_file",
      "write_file",
      "edit_file",
    ];
    for (const name of required) {
      if (!tools.tools.some((tool) => tool.name === name)) {
        throw new Error(`missing gateway tool: ${name}`);
      }
    }

    const status = textOf(await client.callTool({ name: "status", arguments: {} }));
    if (!status.includes('"downstream": "ready"')) {
      throw new Error(`status failed: ${status}`);
    }

    const exec = textOf(
      await client.callTool({
        name: "exec_command",
        arguments: { command: "printf gateway-smoke", timeout_ms: 5_000 },
      }),
    );
    if (!exec.includes("gateway-smoke")) {
      throw new Error(`exec_command failed: ${exec}`);
    }

    const started = textOf(
      await client.callTool({
        name: "start_process",
        arguments: {
          command:
            "node -e \"let i=0; const t=setInterval(()=>console.log('tick '+(++i)),150); setTimeout(()=>{clearInterval(t);process.exit(0)},900)\"",
          timeout_ms: 100,
        },
      }),
    );
    const pidMatch = started.match(/PID\s+(-?\d+)/);
    if (!pidMatch) {
      throw new Error(`start_process did not return a PID: ${started}`);
    }

    await sleep(350);
    const processOutput = textOf(
      await client.callTool({
        name: "read_process_output",
        arguments: { pid: Number(pidMatch[1]), offset: -20, length: 20 },
      }),
    );
    if (!processOutput.includes("tick")) {
      throw new Error(`read_process_output failed: ${processOutput}`);
    }

    await client.callTool({
      name: "write_file",
      arguments: { path: smokeFile, content: "alpha\n", mode: "rewrite" },
    });
    const firstRead = textOf(
      await client.callTool({
        name: "read_file",
        arguments: { path: smokeFile, offset: 0, length: 20 },
      }),
    );
    if (!firstRead.includes("alpha")) {
      throw new Error(`read_file after write failed: ${firstRead}`);
    }

    await client.callTool({
      name: "edit_file",
      arguments: {
        path: smokeFile,
        old_string: "alpha",
        new_string: "beta",
        expected_replacements: 1,
      },
    });
    const secondRead = textOf(
      await client.callTool({
        name: "read_file",
        arguments: { path: smokeFile, offset: 0, length: 20 },
      }),
    );
    if (!secondRead.includes("beta")) {
      throw new Error(`read_file after edit failed: ${secondRead}`);
    }

    await client.close();
    console.log("SMOKE_OK");
  } finally {
    gateway.kill("SIGTERM");
  }
}

await main();
