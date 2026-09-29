# remote-dev-mcp

A thin wrapper of Remote Desktop Commander for MCP clients.

## Configure in MCP client

Use the hosted Remote Desktop Commander endpoint:

```json
{
  "mcpServers": {
    "remote-dev-mcp": {
      "type": "http",
      "url": "https://mcp.desktopcommander.app/mcp"
    }
  }
}
```

You can also import this repository's `.mcp.json`, `server.json`, or `plugin.json` manifests depending on your client.
