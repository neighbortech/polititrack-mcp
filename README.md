# PolitiTrack MCP Server

Search political donations, donors, and lobbying data from any AI assistant.

Works with Claude Desktop, ChatGPT, Cursor, VS Code, Windsurf, and any MCP-compatible client.

## Tools

| Tool | Description |
|------|-------------|
| `search_donor` | Search donors by name (individuals, PACs, corporations) |
| `search_people` | Search individual donors like OpenSecrets donor lookup |
| `person_profile` | Full donor profile: party split, top recipients, timeline |
| `search_donations` | Search contributions with amount, donor, cycle filters |
| `donor_profile` | Donor profile for PACs and organizations |
| `money_flow` | Trace money trail from donor → politicians → committees |

## Install

### Option 1: npm (recommended)

```bash
npm install -g polititrack-mcp
```

### Option 2: Clone

```bash
git clone https://github.com/YOUR_USERNAME/polititrack-mcp.git
cd polititrack-mcp
npm install
```

## Connect to Claude Desktop

Edit your Claude Desktop config file:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "polititrack": {
      "command": "npx",
      "args": ["polititrack-mcp"],
      "env": {
        "POLITITRACK_API_URL": "https://polititrack-api.vercel.app"
      }
    }
  }
}
```

If you cloned the repo instead:

```json
{
  "mcpServers": {
    "polititrack": {
      "command": "node",
      "args": ["/path/to/polititrack-mcp/index.js"],
      "env": {
        "POLITITRACK_API_URL": "https://polititrack-api.vercel.app"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see a hammer icon showing PolitiTrack tools are available.

## Connect to VS Code (Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "polititrack": {
      "command": "npx",
      "args": ["polititrack-mcp"],
      "env": {
        "POLITITRACK_API_URL": "https://polititrack-api.vercel.app"
      }
    }
  }
}
```

## Connect to Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "polititrack": {
      "command": "npx",
      "args": ["polititrack-mcp"],
      "env": {
        "POLITITRACK_API_URL": "https://polititrack-api.vercel.app"
      }
    }
  }
}
```

## Connect to Claude Code

```bash
claude mcp add polititrack -- npx polititrack-mcp
```

## Example prompts

Once connected, try asking your AI assistant:

- "Look up Elon Musk's political donations"
- "Who does ExxonMobil PAC donate to?"
- "Search for donations from tech CEOs in California"
- "Trace the money flow for Koch Industries"
- "Show me Pfizer's donation profile — do they donate more to Republicans or Democrats?"
- "Find individual donors who work at Goldman Sachs"

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLITITRACK_API_URL` | `https://polititrack-api.vercel.app` | Your PolitiTrack API URL |

## Data source

All data comes from the Federal Election Commission (FEC) via the PolitiTrack API. Only itemized contributions >= $200 are available (FEC reporting threshold).

## License

MIT
