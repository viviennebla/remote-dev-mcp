import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
TARGET_URL = "https://mcp.desktopcommander.app/mcp"


class ManifestTests(unittest.TestCase):
    def test_mcp_json_points_to_remote_desktop_commander(self):
        data = json.loads((ROOT / ".mcp.json").read_text())
        self.assertEqual(data["mcpServers"]["remote-dev-mcp"]["type"], "http")
        self.assertEqual(data["mcpServers"]["remote-dev-mcp"]["url"], TARGET_URL)

    def test_server_json_uses_streamable_http_remote(self):
        data = json.loads((ROOT / "server.json").read_text())
        self.assertEqual(data["remotes"][0]["type"], "streamable-http")
        self.assertEqual(data["remotes"][0]["url"], TARGET_URL)

    def test_plugin_json_references_mcp_manifest(self):
        data = json.loads((ROOT / "plugin.json").read_text())
        self.assertEqual(data["mcpServers"], ".mcp.json")


if __name__ == "__main__":
    unittest.main()
