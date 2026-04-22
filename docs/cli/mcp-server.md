# kai mcp-server

:octicons-tag-24: Added in v0.9.0
{ .version-badge }

Start the MCP server (stdio transport).

## Usage

```bash
kai mcp-server [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--profile`, `-p` | Profile to operate on (default: active) |
| `--allow`, `-a` | Allowed tiers (default: `read`) |

## Tiers

| Value | Includes | Description |
|-------|----------|-------------|
| `read` | read | Query-only tools |
| `write` | read + write | Read and create/modify |
| `destructive` | read + write + destructive | All tools |

## Examples

```bash
# Read-only access to the work profile
kai mcp-server --profile work

# Read and write access
kai mcp-server -p work -a read,write

# Full access (includes delete, archive, CLI execution)
kai mcp-server -p work -a destructive
```

## Client Configuration

See [MCP Server](../integrations/mcp.md) for configuration
examples for Claude Code, Claude Desktop, and Cursor.
