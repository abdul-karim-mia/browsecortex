import { describe, it, expect } from 'vitest';
import { mcpToolName, parseMcpToolName } from '@/mcp/types';
import { getMcpApiTools, isMcpTool } from '@/mcp/integration';
import { saveServer, removeServer } from '@/mcp/client';
import { detectAuthMethod } from '@/mcp/directory-types';
import type { McpServerDefinition } from '@/mcp/directory-types';

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
    expect(mcpToolName('github', 'create_issue')).toBe('mcp:github:create_issue');
  });

  it('parses a namespaced name, preserving tool names with separators', () => {
    expect(parseMcpToolName('mcp:fs:read_file')).toEqual({ server: 'fs', tool: 'read_file' });
  });

  it('returns null for non-MCP names', () => {
    expect(parseMcpToolName('click_element')).toBeNull();
  });

  it('isMcpTool detects the prefix', () => {
    expect(isMcpTool('mcp:github:x')).toBe(true);
    expect(isMcpTool('open_tab')).toBe(false);
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

describe('getMcpApiTools', () => {
  it('namespaces enabled tools and excludes disabled ones', async () => {
    await saveServer({
      id: 'gh',
      name: 'github',
      label: 'GitHub',
      url: 'https://e/mcp',
      enabled: true,
      tools: [{ name: 'create_issue' }, { name: 'delete_repo' }],
      disabledTools: ['delete_repo'],
    });
    try {
      const tools = (await getMcpApiTools()).map((t) => t.function.name);
      expect(tools).toContain('mcp:github:create_issue');
      expect(tools).not.toContain('mcp:github:delete_repo');
    } finally {
      await removeServer('gh');
    }
  });
});
