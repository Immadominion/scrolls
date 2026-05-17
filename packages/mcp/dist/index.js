#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ScrollsClient } from "@scrolls/sdk";
var network = process.env.SCROLLS_NETWORK ?? "testnet";
var client = new ScrollsClient({
  network,
  suiPrivateKey: process.env.SUI_PRIVATE_KEY,
  scrollsPackage: process.env.SCROLLS_PACKAGE,
  walrusPublisher: process.env.SCROLLS_PUBLISHER,
  walrusAggregator: process.env.SCROLLS_AGGREGATOR,
  suiRpc: process.env.SCROLLS_SUI_RPC,
  appUrl: process.env.SCROLLS_APP_URL
});
var server = new McpServer({
  name: "scrolls",
  version: "0.1.0"
});
var FieldSpec = z.object({
  type: z.enum([
    "short_text",
    "long_text",
    "rich_text",
    "dropdown",
    "multi_select",
    "star_rating",
    "file_upload",
    "video_upload",
    "url",
    "confirm_checkbox"
  ]),
  label: z.string(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  maxStars: z.number().optional(),
  maxFileSizeMB: z.number().optional(),
  acceptedTypes: z.array(z.string()).optional()
});
server.registerTool(
  "scrolls_create_form",
  {
    description: "Publish a new form to Walrus (and register it on Sui if a signer is configured). Returns the form id, share URL, and \u2014 for private forms \u2014 the freshly generated decryption key (the caller MUST persist it).",
    inputSchema: {
      title: z.string().describe("Form title shown to respondents."),
      description: z.string().optional(),
      isPrivate: z.boolean().optional().describe(
        "If true, responses are end-to-end encrypted. A new ECDH P-256 keypair is generated and returned."
      ),
      fields: z.array(FieldSpec).min(1)
    }
  },
  async (args) => {
    const result = await client.createForm({
      title: args.title,
      description: args.description,
      settings: args.isPrivate ? { isPrivate: true } : void 0,
      fields: args.fields
    });
    return jsonResult(result);
  }
);
server.registerTool(
  "scrolls_list_forms",
  {
    description: "List forms published on-chain by an address (defaults to the configured signer).",
    inputSchema: {
      address: z.string().optional().describe("Sui address (0x\u2026). Defaults to the configured signer.")
    }
  },
  async (args) => {
    const forms = await client.listForms(args.address);
    return jsonResult(
      forms.map((f) => ({
        ...f,
        shareUrl: client.shareUrl(f.pointerId)
      }))
    );
  }
);
server.registerTool(
  "scrolls_get_form",
  {
    description: "Fetch the latest form config by id (Sui pointer id or Walrus blob id).",
    inputSchema: { formId: z.string() }
  },
  async (args) => {
    const form = await client.getForm(args.formId);
    return jsonResult({ ...form, shareUrl: client.shareUrl(args.formId) });
  }
);
server.registerTool(
  "scrolls_list_submissions",
  {
    description: "List submissions for a form. If the form is private, supply privateKeyJwk to decrypt them. Without the key, encrypted entries are returned as stubs.",
    inputSchema: {
      formId: z.string().describe("Must be a Sui pointer id (0x\u2026)."),
      privateKeyJwk: z.any().optional(),
      limit: z.number().int().positive().optional()
    }
  },
  async (args) => {
    const subs = await client.listSubmissions(args.formId, {
      privateKeyJwk: args.privateKeyJwk,
      limit: args.limit
    });
    return jsonResult(subs);
  }
);
server.registerTool(
  "scrolls_export_submissions",
  {
    description: "Export submissions as a CSV string.",
    inputSchema: {
      formId: z.string(),
      privateKeyJwk: z.any().optional()
    }
  },
  async (args) => {
    const csv = await client.exportCsv(args.formId, {
      privateKeyJwk: args.privateKeyJwk
    });
    return { content: [{ type: "text", text: csv }] };
  }
);
server.registerTool(
  "scrolls_submit_response",
  {
    description: "Submit a response to a form. `responses` may be an array of {fieldId, value} or a plain object keyed by fieldId.",
    inputSchema: {
      formId: z.string(),
      responses: z.union([
        z.array(
          z.object({
            fieldId: z.string(),
            value: z.any()
          })
        ),
        z.record(z.string(), z.any())
      ])
    }
  },
  async (args) => {
    const responses = Array.isArray(args.responses) ? args.responses : Object.entries(args.responses).map(([fieldId, value]) => ({
      fieldId,
      value
    }));
    const result = await client.submit(args.formId, responses);
    return jsonResult(result);
  }
);
function jsonResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[scrolls-mcp] ready on stdio (network=${network})`);
}
main().catch((err) => {
  console.error("[scrolls-mcp] fatal:", err);
  process.exit(1);
});
