import { describe, it, expect } from 'vitest';
import { mcpToolName, parseMcpToolName } from '@/mcp/types';
import { isMcpTool } from '@/mcp/integration';

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
