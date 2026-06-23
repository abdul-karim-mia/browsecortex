import { describe, it, expect } from 'vitest';
import { mcpToolName, parseMcpToolName } from '@/mcp/types';
import { saveServer, removeServer } from '@/mcp/client';
import { detectAuthMethod } from '@/mcp/directory-types';
import type { McpServerDefinition } from '@/mcp/directory-types';
import {
  listMcpServers,
  toggleMcpServer,
  listMcpTools,
} from '@/tools/builtin/mcp';

const baseDef: McpServerDefinition = {
  id: 'x',
  name: 'X',
  description: '',
  category: 'data',
  tier: 'featured',
  version: '1.0',
  author: 'admin',
  url: 'https://e.example/mcp',
  transport: 'streamable_http',
  auth: 'none',
  tools: ['a'],
};

describe('MCP tool naming', () => {
  it('builds a namespaced name', () => {
    expect(mcpToolName('github', 'create_issue')).toBe('mcp__github__create_issue');
  });

  it('parses a namespaced name, preserving tool names with separators', () => {
    expect(parseMcpToolName('mcp__fs__read_file')).toEqual({ server: 'fs', tool: 'read_file' });
  });

  it('returns null for non-MCP names', () => {
    expect(parseMcpToolName('click_element')).toBeNull();
  });
});

describe('detectAuthMethod', () => {
  it('honours an explicit auth value', () => {
    expect(detectAuthMethod({ ...baseDef, auth: 'oauth' })).toBe('oauth');
  });

  it('infers oauth from oauthConfig when auth is "auto"', () => {
    const def = {
      ...baseDef,
      auth: 'auto' as unknown as McpServerDefinition['auth'],
      oauthConfig: { authUrl: 'a', tokenUrl: 't' },
    };
    expect(detectAuthMethod(def)).toBe('oauth');
  });

  it('infers api_key from apiKeyConfig', () => {
    const def = {
      ...baseDef,
      auth: 'auto' as unknown as McpServerDefinition['auth'],
      apiKeyConfig: { label: 'Key' },
    };
    expect(detectAuthMethod(def)).toBe('api_key');
  });
});

describe('MCP Tools execution', () => {
  it('list_mcp_servers lists connected servers', async () => {
    const testServer = {
      id: 'test-srv',
      name: 'test-server',
      label: 'Test Server',
      url: 'https://e/mcp',
      enabled: true,
      tools: [{ name: 'test_tool' }],
    };
    await saveServer(testServer);
    try {
      const res = (await listMcpServers.execute({}, {} as any)) as { servers: any[] };
      expect(res.servers).toBeDefined();
      const s = res.servers.find((srv: any) => srv.id === 'test-srv');
      expect(s).toBeDefined();
      expect(s.enabled).toBe(true);
      expect(s.toolCount).toBe(1);
    } finally {
      await removeServer('test-srv');
    }
  });

  it('list_mcp_tools lists tools of enabled servers', async () => {
    const testServer = {
      id: 'test-srv-tools',
      name: 'test-server-tools',
      label: 'Test Server Tools',
      url: 'https://e/mcp',
      enabled: true,
      tools: [{ name: 'custom_tool', description: 'desc', inputSchema: { type: 'object' } }],
    };
    await saveServer(testServer);
    try {
      const res = (await listMcpTools.execute({}, {} as any)) as { tools: any[] };
      expect(res.tools).toBeDefined();
      const t = res.tools.find((tool: any) => tool.name === 'custom_tool');
      expect(t).toBeDefined();
      expect(t.server).toBe('test-server-tools');
    } finally {
      await removeServer('test-srv-tools');
    }
  });

  it('toggle_mcp_server toggles enabled state and disconnects', async () => {
    const testServer = {
      id: 'test-srv-toggle',
      name: 'test-server-toggle',
      url: 'https://e/mcp',
      enabled: true,
      tools: [],
    };
    await saveServer(testServer);
    try {
      // Disable
      let res = (await toggleMcpServer.execute(
        { id: 'test-srv-toggle', action: 'disable' },
        {} as any,
      )) as { success?: boolean };
      expect(res.success).toBe(true);

      // Enable
      res = (await toggleMcpServer.execute(
        { id: 'test-srv-toggle', action: 'enable' },
        {} as any,
      )) as { success?: boolean };
      expect(res.success).toBe(true);

      // Disconnect
      res = (await toggleMcpServer.execute(
        { id: 'test-srv-toggle', action: 'disconnect' },
        {} as any,
      )) as { success?: boolean };
      expect(res.success).toBe(true);
    } finally {
      await removeServer('test-srv-toggle');
    }
  });
});
