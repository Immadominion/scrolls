# @scrolls/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for [Scrolls](https://scrolls.wal.app). Lets Claude, Cursor, or any MCP-aware agent create and read Scrolls forms on your behalf.

## Install

```bash
npm install -g @scrolls/mcp
```

Installs a `scrolls-mcp` binary that speaks JSON-RPC over stdio.

## Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
    "mcpServers": {
        "scrolls": {
            "command": "scrolls-mcp",
            "env": {
                "SCROLLS_NETWORK": "testnet",
                "SUI_PRIVATE_KEY": "suiprivkey1…"
            }
        }
    }
}
```

Restart Claude. Ask:

> Create a Scrolls form for hackathon judging — project name, score 1-10, and freeform feedback. Share the link.

## Configure Cursor

Add the same `mcpServers` block to `~/.cursor/mcp.json`.

## Tools

| Tool | Purpose |
| --- | --- |
| `scrolls_create_form` | Publish a form |
| `scrolls_list_forms` | List forms by address |
| `scrolls_get_form` | Fetch a form's config |
| `scrolls_list_submissions` | List submissions (optional decrypt) |
| `scrolls_export_submissions` | CSV dump |
| `scrolls_submit_response` | Submit a response |

## Environment

| Variable | Required | Default |
| --- | --- | --- |
| `SCROLLS_NETWORK` | no | `testnet` |
| `SUI_PRIVATE_KEY` | for on-chain ops | — |
| `SCROLLS_PACKAGE`, `SCROLLS_PUBLISHER`, `SCROLLS_AGGREGATOR`, `SCROLLS_SUI_RPC`, `SCROLLS_APP_URL` | no | per-network defaults |

## Full documentation

See [docs/PROGRAMMATIC.md](https://github.com/Immadominion/scrolls/blob/main/docs/PROGRAMMATIC.md).

## License

MIT.
