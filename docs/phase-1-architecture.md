# Phase 1 — Investigation and v0 Architecture

## Decision

Build **Gateway + Desktop Commander Local MCP** first.

The gateway owns the public MCP contract and remote transport. Desktop Commander is only the first local execution adapter. We do not expose its whole tool surface and we do not make its schemas our long-term API.

Project trade-off order:

> usability > reliability > security

Security stays sufficient for practical use, but v0 must remain easy to run and useful for real development.

## Desktop Commander findings

Current upstream inspected during this phase:

- Repository: `wonderwhy-er/DesktopCommanderMCP`
- Package: `@wonderwhy-er/desktop-commander`
- Observed version: `0.2.51`
- License: MIT
- Runtime: Node.js >= 18
- Local MCP entrypoint: stdio via `FilteredStdioServerTransport`
- Normal launch: `npx -y @wonderwhy-er/desktop-commander@latest`

The official Desktop Commander Remote Device already uses the same important boundary we need:

```text
Remote Device
  -> MCP Client
  -> StdioClientTransport
  -> Local Desktop Commander MCP
```

It sets `DC_REMOTE_DEVICE=true`, connects to the local stdio MCP, verifies readiness with `listTools()`, and forwards tool calls. That makes stdio wrapping a first-class upstream-supported path rather than a workaround.

Relevant Local MCP tools include:

- process: `start_process`, `read_process_output`, `interact_with_process`, `force_terminate`
- files: `read_file`, `write_file`, `edit_block`
- filesystem/search/process inspection tools beyond the v0 subset

The current `start_process` schema requires `timeout_ms`. The gateway deliberately owns a simpler stable schema and supplies sensible defaults.

### Capability boundary

Desktop Commander Local MCP is strong at shell/process/filesystem work.

It does **not** expose browser automation / browser screenshot as a core Local MCP tool surface. Image support mainly means reading/rendering image files. Browser validation should therefore become a later independent adapter (for example Playwright/Chrome), not something v0 pretends Desktop Commander already provides.

## Two implementation paths

| | Gateway + Local MCP | Own Remote Dev MCP |
|---|---|---|
| Time to usable v0 | Low | Higher |
| Shell/process maturity | Reuse Desktop Commander | Must implement |
| Windows/WSL coverage | Reuse existing behavior | Must implement/test |
| File editing | Reuse | Must implement |
| Long-process sessions | Reuse | Must implement |
| Dependency on Desktop Commander internals | Adapter only | None |
| Long-term control | Good if gateway API is ours | Full |
| Best first step | **Yes** | Later, incrementally |

We should replace individual downstream capabilities only when there is a concrete reason: behavior mismatch, performance, portability, missing capability, or upstream instability.

## v0

```text
ChatGPT / MCP client
        |
        | Streamable HTTP
        v
remote-dev-mcp
  - stable small tool surface
  - optional bearer auth for generic clients
  - basic audit events
        |
        | stdio MCP client
        v
Desktop Commander Local MCP
        |
        v
local OS / shell / filesystem
```

Single gateway process = single development machine.

No host registry, scheduler, database, control plane, remote agent fleet, or policy engine in v0.

### Gateway tools

- `status`
- `exec_command`
- `start_process`
- `read_process_output`
- `stop_process`
- `read_file`
- `write_file`
- `edit_file`

These map to a deliberately small subset of Desktop Commander tools.

## Connectivity and auth

Default bind is `127.0.0.1`.

For ChatGPT, prefer OpenAI Secure MCP Tunnel when available. It connects a local/private MCP server without making the gateway public, and avoids building an OAuth service during the PoC.

For generic direct MCP clients, `REMOTE_DEV_TOKEN` enables a simple bearer token. This is a convenience mechanism, not the final ChatGPT authentication design.

If we later expose a public ChatGPT-facing endpoint directly, implement standards-compliant OAuth instead of inventing a custom API-key flow.

Tailscale remains useful for developer-to-developer or local-agent connectivity, but a cloud ChatGPT client cannot reach an arbitrary tailnet address by itself.

## Security floor for v0

Do:

- listen on loopback by default
- run as the normal development user, not root
- keep secrets in environment / host configuration
- never commit SSH keys, tokens, or passwords
- log tool name, success/failure, duration, and lifecycle events
- reuse Desktop Commander's own command/file guardrails

Do not build yet:

- RBAC
- command allowlist policy engine
- approval workflow
- per-host credentials database
- centralized audit backend
- sandbox orchestration

Desktop Commander executes commands with the OS user's privileges. Its guardrails are not a sandbox.

## Multi-device later

Keep the future shape simple:

```yaml
hosts:
  vimo-dev-server:
    ...
  sop-dev:
    ...
  windows-wsl:
    ...
```

The first expansion should be a host selector + one adapter instance per host. Do not add a control plane until multiple independently managed gateways create a real need.

## Phase 2 acceptance

A clean machine should be able to:

1. start `remote-dev-mcp`
2. spawn Desktop Commander Local MCP through stdio
3. connect over Streamable HTTP MCP
4. call `status`
5. run a command
6. start a process and read later output
7. write and read a file
8. edit that file and verify the change

The repository CI contains an end-to-end smoke for exactly this path.
