/**
 * MCP Management and Execution Tools.
 * Exposes tools to list, search, connect, configure, and call Model Context Protocol (MCP) servers.
 */
import type { ToolDefinition } from '../types';
import { callTool, fetchTools, listServers, removeServer, saveServer } from '@/mcp/client';
import { getIndex, getServerDefinition } from '@/mcp/directory';
import { connectApiKey, connectNone } from '@/mcp/connect';
import { detectAuthMethod } from '@/mcp/directory-types';
import type { McpServer } from '@/mcp/types';

export const listMcpServers: ToolDefinition = {
  name: 'list_mcp_servers',
  description:
    'List all currently connected/saved Model Context Protocol (MCP) servers, ' +
    'their enabled/disabled state, URLs, and tool counts.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const servers = await listServers();
    return {
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        label: s.label ?? s.name,
        url: s.url,
        enabled: s.enabled,
        toolCount: s.tools.length,
        disabledTools: s.disabledTools ?? [],
        connectedAt: s.connectedAt,
      })),
    };
  },
};

export const searchMcpDirectory: ToolDefinition = {
  name: 'search_mcp_directory',
  description:
    'Search the official BrowseCortex MCP directory by query or category to discover new servers.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keyword to search in server names or descriptions' },
      category: { type: 'string', description: 'Optional category filter' },
    },
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const q = String(args.query ?? '').toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : null;
    const index = await getIndex();
    const matches = index.filter((e) => {
      if (category && e.category.toLowerCase() !== category) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
    return {
      entries: matches.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        tier: e.tier,
      })),
    };
  },
};

export const connectMcpServer: ToolDefinition = {
  name: 'connect_mcp_server',
  description:
    'Connect a new MCP server. You can specify a directory server by `id`, or a custom server by `name` and `url`.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Directory server ID (e.g. from search_mcp_directory)' },
      name: { type: 'string', description: 'Custom server name (if not in directory)' },
      url: { type: 'string', description: 'SSE URL of the MCP server' },
      authToken: { type: 'string', description: 'Optional authorization token / API key' },
    },
  },
  destructive: true,
  timeout: 'mcp',
  async execute(args) {
    const id = args.id ? String(args.id) : null;
    const name = args.name ? String(args.name) : null;
    const url = args.url ? String(args.url) : null;
    const token = args.authToken ? String(args.authToken) : null;

    if (id) {
      const index = await getIndex();
      const entry = index.find((e) => e.id === id);
      if (!entry) return { error: `Server with ID '${id}' not found in directory.` };
      const def = await getServerDefinition(entry);
      const auth = detectAuthMethod(def);

      if (auth === 'oauth') {
        return {
          error:
            `Server '${def.name}' requires OAuth authentication. ` +
            'Please connect it manually via the BrowseCortex Settings UI under the MCP tab.',
        };
      }

      if (auth === 'api_key') {
        if (!token) return { error: `Authentication token is required for server '${def.name}'.` };
        const server = await connectApiKey(def, token.trim());
        return { connected: server.label ?? server.name, tools: server.tools.map((t) => t.name) };
      } else {
        const server = await connectNone(def, url?.trim() || undefined);
        return { connected: server.label ?? server.name, tools: server.tools.map((t) => t.name) };
      }
    }

    if (!name || !url) {
      return { error: "Either 'id' or both 'name' and 'url' must be provided to connect a server." };
    }

    // Connect custom server
    const server: McpServer = {
      id: crypto.randomUUID(),
      name: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: name.trim(),
      url: url.trim(),
      authToken: token?.trim() || undefined,
      enabled: true,
      tools: [],
      auth: token?.trim() ? 'api_key' : 'none',
      connectedAt: new Date().toISOString(),
    };

    const tools = await fetchTools(server);
    await saveServer({ ...server, tools });
    return { connected: server.label, tools: tools.map((t) => t.name) };
  },
};

export const toggleMcpServer: ToolDefinition = {
  name: 'toggle_mcp_server',
  description: 'Enable, disable, or completely disconnect (delete) a connected MCP server by its ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The ID of the connected server' },
      action: {
        type: 'string',
        enum: ['enable', 'disable', 'disconnect'],
        description: 'Action to perform',
      },
    },
    required: ['id', 'action'],
  },
  destructive: true,
  timeout: 'instant',
  async execute(args) {
    const id = String(args.id);
    const action = String(args.action);
    const all = await listServers();
    const server = all.find((s) => s.id === id);
    if (!server) return { error: `Connected server with ID '${id}' not found.` };

    if (action === 'disconnect') {
      await removeServer(id);
      return { success: true, message: `Disconnected server '${server.label ?? server.name}'` };
    } else if (action === 'enable') {
      await saveServer({ ...server, enabled: true });
      return { success: true, message: `Enabled server '${server.label ?? server.name}'` };
    } else if (action === 'disable') {
      await saveServer({ ...server, enabled: false });
      return { success: true, message: `Disabled server '${server.label ?? server.name}'` };
    }

    return { error: `Invalid action '${action}'.` };
  },
};

export const listMcpTools: ToolDefinition = {
  name: 'list_mcp_tools',
  description:
    'List all tools, descriptions, and parameter schemas available on all connected and enabled MCP servers.',
  parameters: {
    type: 'object',
    properties: {
      server: {
        type: 'string',
        description: 'Optional server name/id to filter tools by a specific server',
      },
    },
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const filterServer = args.server ? String(args.server).toLowerCase() : null;
    const servers = await listServers();
    const out: Array<{
      server: string;
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }> = [];

    for (const server of servers) {
      if (!server.enabled) continue;
      if (
        filterServer &&
        server.name.toLowerCase() !== filterServer &&
        (server.label ?? '').toLowerCase() !== filterServer
      ) {
        continue;
      }
      const disabled = new Set(server.disabledTools ?? []);
      for (const tool of server.tools) {
        if (disabled.has(tool.name)) continue;
        out.push({
          server: server.name,
          name: tool.name,
          description: tool.description,
          parameters: (tool.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
          },
        });
      }
    }

    return { tools: out };
  },
};

export const callMcpTool: ToolDefinition = {
  name: 'call_mcp_tool',
  description:
    'Call a tool on an external MCP server. Use list_mcp_tools first to see available tools.',
  parameters: {
    type: 'object',
    properties: {
      server: { type: 'string', description: 'The name/id of the target MCP server' },
      tool: { type: 'string', description: 'The name of the tool to run on that server' },
      arguments: { type: 'object', description: 'Arguments to pass to the tool' },
    },
    required: ['server', 'tool', 'arguments'],
  },
  destructive: false,
  timeout: 'mcp',
  async execute(args) {
    const serverName = String(args.server);
    const toolName = String(args.tool);
    const toolArgs = (args.arguments as Record<string, unknown>) ?? {};

    const servers = await listServers();
    const server = servers.find(
      (s) =>
        s.name.toLowerCase() === serverName.toLowerCase() ||
        (s.label ?? '').toLowerCase() === serverName.toLowerCase(),
    );
    if (!server) return { error: `MCP server '${serverName}' not found.` };
    if (!server.enabled) return { error: `MCP server '${serverName}' is disabled.` };

    const disabled = server.disabledTools ?? [];
    if (disabled.includes(toolName))
      return { error: `MCP tool '${toolName}' is disabled on server '${serverName}'.` };

    try {
      const result = await callTool(server, toolName, toolArgs);
      return { result };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const mcpTools = [
  listMcpServers,
  searchMcpDirectory,
  connectMcpServer,
  toggleMcpServer,
  listMcpTools,
  callMcpTool,
];
