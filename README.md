# remote-dev-mcp

A small MCP gateway for remote development machines.

The first implementation exposes Streamable HTTP MCP and delegates local execution to Desktop Commander Local MCP over stdio. The gateway API is intentionally independent from Desktop Commander so high-frequency capabilities can be replaced later.

## v0 path

```text
MCP client
  -> Streamable HTTP
remote-dev-mcp
  -> stdio MCP
Desktop Commander Local MCP
  -> local machine
```

See [Phase 1 architecture](docs/phase-1-architecture.md).

## Run

Requires Node.js 20+.

```bash
npm install
npm run check
npm run build
npm start
```

Defaults:

- MCP: `http://127.0.0.1:8787/mcp`
- health: `http://127.0.0.1:8787/health`
- downstream: `npx -y @wonderwhy-er/desktop-commander@latest`

Copy `.env.example` values into your process environment as needed.

For ChatGPT, prefer a private connection such as Secure MCP Tunnel rather than exposing this endpoint directly to the public Internet.

## v0 tools

- `status`
- `exec_command`
- `start_process`
- `read_process_output`
- `stop_process`
- `read_file`
- `write_file`
- `edit_file`

## Verification

CI runs a real end-to-end smoke against Desktop Commander Local MCP:

```bash
npm run build
npx tsx scripts/smoke.ts
```

The smoke covers MCP transport, command execution, long-process output, file write/read, and exact text editing.
