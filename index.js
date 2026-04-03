#!/usr/bin/env node

/**
 * PolitiTrack MCP Server
 *
 * Exposes political donation data to any MCP-compatible AI assistant.
 * Works with Claude Desktop, ChatGPT, Cursor, VS Code, and more.
 *
 * Tools:
 *   - search_donor: Find donors by name (individuals, PACs, corporations)
 *   - donor_profile: Full profile with party split, top recipients, recent donations
 *   - search_donations: Search contributions with filters
 *   - search_people: Search individual donors (like OpenSecrets donor lookup)
 *   - person_profile: Full individual donor profile across election cycles
 *   - money_flow: Trace money from donor → politician → committee → legislation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.POLITITRACK_API_URL || "https://polititrack-api.vercel.app";

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "PolitiTrack-MCP/1.0" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

function formatMoney(amount) {
  return `$${Math.round(amount).toLocaleString()}`;
}

// ── Create server ──────────────────────────────────────

const server = new McpServer({
  name: "PolitiTrack",
  version: "1.0.0",
  description: "Search political donations, donors, and lobbying data. Covers FEC campaign contributions, individual donors, PACs, and politicians.",
});

// ── Tool: search_donor ─────────────────────────────────

server.tool(
  "search_donor",
  "Search for political donors by name. Finds individuals, PACs, corporations, and committees. Returns name, type, industry, state, and total contributions.",
  {
    name: z.string().describe("Donor name to search (e.g. 'Elon Musk', 'ExxonMobil', 'Koch Industries')"),
    limit: z.number().optional().default(10).describe("Max results to return"),
  },
  async ({ name, limit }) => {
    try {
      const data = await apiFetch("/api/v1/donors/search", { q: name, limit });
      const results = Array.isArray(data) ? data : data.results || [];

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No donors found matching "${name}". Try a different spelling or search term.` }] };
      }

      let text = `Found ${results.length} donor(s) matching "${name}":\n\n`;
      for (const d of results) {
        const total = d.total_contributed || d.total || 0;
        text += `• **${d.name}**\n`;
        text += `  Type: ${d.type || "Unknown"} | Industry: ${d.industry || d.occupation || d.employer || "N/A"} | State: ${d.state || "N/A"}\n`;
        text += `  Total contributed: ${formatMoney(total)}\n\n`;
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error searching donors: ${e.message}` }], isError: true };
    }
  }
);

// ── Tool: search_people ────────────────────────────────

server.tool(
  "search_people",
  "Search individual donors (real people, not PACs) by name, employer, or occupation. Pulls live data from FEC. Equivalent to OpenSecrets donor lookup. Only shows contributions >= $200 (FEC itemization threshold).",
  {
    name: z.string().optional().describe("Person's name (e.g. 'Elon Musk')"),
    employer: z.string().optional().describe("Employer name (e.g. 'Tesla')"),
    occupation: z.string().optional().describe("Occupation (e.g. 'CEO')"),
    state: z.string().optional().describe("2-letter state code (e.g. 'CA')"),
    cycle: z.number().optional().describe("Election cycle year (e.g. 2024)"),
    limit: z.number().optional().default(20).describe("Max results"),
  },
  async ({ name, employer, occupation, state, cycle, limit }) => {
    try {
      const data = await apiFetch("/api/v1/people/search", { name, employer, occupation, state, cycle, limit });
      const results = data.results || [];

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No individual donors found. Try a different name or remove filters.` }] };
      }

      let text = `Found ${data.total || results.length} individual contribution(s):\n\n`;
      for (const r of results) {
        text += `• **${r.contributor_name}** → ${r.recipient} (${r.recipient_party || "?"})\n`;
        text += `  Amount: ${formatMoney(r.amount)} | Date: ${r.date || "N/A"}\n`;
        text += `  Employer: ${r.employer || "N/A"} | Occupation: ${r.occupation || "N/A"} | ${r.state || ""}\n\n`;
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ── Tool: person_profile ───────────────────────────────

server.tool(
  "person_profile",
  "Get a full political donation profile for an individual donor. Shows total contributions, breakdown by party (Republican vs Democrat), breakdown by election cycle, top recipients, and recent donations. Equivalent to an OpenSecrets donor profile page.",
  {
    name: z.string().describe("Person's full name (e.g. 'Elon Musk')"),
    cycles: z.string().optional().default("2024,2022,2020").describe("Comma-separated election cycles to include"),
  },
  async ({ name, cycles }) => {
    try {
      const data = await apiFetch(`/api/v1/people/${encodeURIComponent(name)}/profile`, { cycles });

      let text = `# ${data.donor?.name || name} — Political Donation Profile\n\n`;
      text += `**Type:** Individual\n`;
      text += `**Employer:** ${data.donor?.employer || "N/A"}\n`;
      text += `**Occupation:** ${data.donor?.occupation || "N/A"}\n`;
      text += `**Location:** ${data.donor?.city || ""}, ${data.donor?.state || ""}\n`;
      text += `**Total contributed:** ${formatMoney(data.total_contributed || 0)} (${data.total_contributions || 0} contributions)\n`;
      text += `**Cycles covered:** ${(data.cycles_covered || []).join(", ")}\n\n`;

      // Party breakdown
      if (data.by_party && Object.keys(data.by_party).length > 0) {
        text += `## Party breakdown\n`;
        for (const [party, info] of Object.entries(data.by_party)) {
          const partyName = party === "REP" || party === "R" ? "Republican" : party === "DEM" || party === "D" ? "Democrat" : party;
          text += `• ${partyName}: ${formatMoney(info.total)} (${info.count} donations)\n`;
        }
        text += `\n`;
      }

      // By cycle
      if (data.by_cycle && Object.keys(data.by_cycle).length > 0) {
        text += `## By election cycle\n`;
        for (const [cycle, amount] of Object.entries(data.by_cycle)) {
          text += `• ${cycle}: ${formatMoney(amount)}\n`;
        }
        text += `\n`;
      }

      // Top recipients
      if (data.recipients && data.recipients.length > 0) {
        text += `## Top recipients\n`;
        for (const r of data.recipients.slice(0, 15)) {
          const party = r.party ? ` (${r.party})` : "";
          const office = r.office ? ` — ${r.office}` : "";
          text += `• ${r.name}${party}${office}: ${formatMoney(r.total)} (${r.count} donations)\n`;
        }
        text += `\n`;
      }

      // Recent
      if (data.recent_contributions && data.recent_contributions.length > 0) {
        text += `## Recent contributions\n`;
        for (const c of data.recent_contributions.slice(0, 10)) {
          text += `• ${c.date || "N/A"} — ${formatMoney(c.amount)} to ${c.recipient} (${c.party || "?"})\n`;
        }
      }

      text += `\n---\n*Data source: Federal Election Commission (FEC). Only itemized contributions >= $200 are shown.*`;

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error getting profile for "${name}": ${e.message}` }], isError: true };
    }
  }
);

// ── Tool: search_donations ─────────────────────────────

server.tool(
  "search_donations",
  "Search political donations/contributions with filters. Find who donated to whom, filter by amount, donor name, or election cycle.",
  {
    donor: z.string().optional().describe("Donor name to filter by"),
    recipient: z.string().optional().describe("Recipient committee ID to filter by"),
    min_amount: z.number().optional().describe("Minimum donation amount in dollars"),
    cycle: z.number().optional().describe("Election cycle (e.g. 2024)"),
    limit: z.number().optional().default(20).describe("Max results"),
  },
  async ({ donor, recipient, min_amount, cycle, limit }) => {
    try {
      const data = await apiFetch("/api/v1/donations", { donor, recipient, min_amount, cycle, limit });
      const donations = data.donations || [];

      if (donations.length === 0) {
        return { content: [{ type: "text", text: "No donations found matching your criteria." }] };
      }

      let text = `Found ${data.total || donations.length} donation(s):\n\n`;
      for (const d of donations) {
        text += `• **${d.donor?.name || "Unknown"}** → ${d.recipient?.name || "Unknown"} (${d.recipient?.party || "?"})\n`;
        text += `  Amount: ${formatMoney(d.amount)} | Date: ${d.date || "N/A"}\n\n`;
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ── Tool: donor_profile ────────────────────────────────

server.tool(
  "donor_profile",
  "Get a full profile for any donor (PAC, corporation, or individual). Includes party breakdown, yearly spending, top recipients, lobbying activity, and federal contracts. For individual people, use person_profile instead.",
  {
    name: z.string().describe("Donor name (e.g. 'ExxonMobil PAC', 'Koch Industries')"),
  },
  async ({ name }) => {
    try {
      // Try person profile first
      const data = await apiFetch(`/api/v1/people/${encodeURIComponent(name)}/profile`, { cycles: "2024,2022,2020" });

      let text = `# ${data.donor?.name || name}\n\n`;
      text += `Total: ${formatMoney(data.total_contributed || 0)} across ${data.total_contributions || 0} contributions\n\n`;

      if (data.by_party) {
        text += `## Party split\n`;
        for (const [p, info] of Object.entries(data.by_party)) {
          text += `• ${p}: ${formatMoney(info.total)} (${info.count})\n`;
        }
        text += `\n`;
      }

      if (data.recipients) {
        text += `## Top recipients\n`;
        for (const r of data.recipients.slice(0, 10)) {
          text += `• ${r.name} (${r.party || "?"}): ${formatMoney(r.total)}\n`;
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Could not find profile for "${name}": ${e.message}` }], isError: true };
    }
  }
);

// ── Tool: money_flow ───────────────────────────────────

server.tool(
  "money_flow",
  "Trace the money trail for a donor — shows the flow from Donor → Donations → Politicians → Committees. Helps answer questions like 'Where does ExxonMobil's money go?' or 'Who funds the Energy Committee?'",
  {
    donor_name: z.string().describe("Name of the donor to trace"),
  },
  async ({ donor_name }) => {
    try {
      const data = await apiFetch(`/api/v1/people/${encodeURIComponent(donor_name)}/profile`, { cycles: "2024,2022,2020" });

      let text = `# Money Flow: ${data.donor?.name || donor_name}\n\n`;
      text += `## Step 1: Donor\n`;
      text += `${data.donor?.name || donor_name}\n`;
      text += `Employer: ${data.donor?.employer || "N/A"} | Occupation: ${data.donor?.occupation || "N/A"}\n`;
      text += `Location: ${data.donor?.city || ""}, ${data.donor?.state || ""}\n\n`;

      text += `## Step 2: Total contributions\n`;
      text += `${formatMoney(data.total_contributed || 0)} across ${data.total_contributions || 0} contributions\n\n`;

      text += `## Step 3: Party distribution\n`;
      if (data.by_party) {
        const total = Object.values(data.by_party).reduce((s, v) => s + v.total, 0) || 1;
        for (const [p, info] of Object.entries(data.by_party)) {
          const pct = Math.round((info.total / total) * 100);
          const partyName = p === "R" || p === "REP" ? "Republican" : p === "D" || p === "DEM" ? "Democrat" : p;
          text += `• ${partyName}: ${formatMoney(info.total)} (${pct}%)\n`;
        }
      }
      text += `\n`;

      text += `## Step 4: Where the money goes (top recipients)\n`;
      if (data.recipients) {
        for (const r of data.recipients.slice(0, 10)) {
          const party = r.party ? ` (${r.party})` : "";
          const office = r.office ? ` — ${r.office}` : "";
          const state = r.state ? `, ${r.state}` : "";
          text += `• ${r.name}${party}${office}${state}: ${formatMoney(r.total)}\n`;
        }
      }
      text += `\n`;

      text += `## Step 5: Donation timeline\n`;
      if (data.by_cycle) {
        for (const [cycle, amount] of Object.entries(data.by_cycle).sort()) {
          text += `• ${cycle} cycle: ${formatMoney(amount)}\n`;
        }
      }

      text += `\n---\n*Source: FEC itemized individual contributions. Upgrade to PolitiTrack Pro for AI-powered lobbying and legislative correlation analysis.*`;

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Could not trace money flow for "${donor_name}": ${e.message}` }], isError: true };
    }
  }
);

// ── Start server ───────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
