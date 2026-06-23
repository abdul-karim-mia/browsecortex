/**
 * Utility tools (PLAN §11).
 */
import type { ToolDefinition } from '../types';

export const getCurrentDatetime: ToolDefinition = {
  name: 'get_current_datetime',
  description: 'Get the current date and time (ISO string and local format).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const now = new Date();
    return { iso: now.toISOString(), local: now.toString() };
  },
};

export const wait: ToolDefinition = {
  name: 'wait',
  description: 'Pause for a number of seconds before continuing.',
  parameters: {
    type: 'object',
    properties: { seconds: { type: 'number', description: 'Seconds to wait (max 30).' } },
    required: ['seconds'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args) {
    const seconds = Math.min(Math.max(Number(args.seconds) || 0, 0), 30);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return { waited: seconds };
  },
};

export const fetchUrl: ToolDefinition = {
  name: 'fetch_url',
  description: 'Make an HTTP request (GET, POST, etc.) from the extension background context (bypasses CORS).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The absolute URL to request.' },
      method: {
        type: 'string',
        description: 'HTTP method (e.g. GET, POST, PUT, DELETE). Default GET.',
      },
      headers: { type: 'object', description: 'Optional request headers.' },
      body: { type: 'string', description: 'Optional request body.' },
    },
    required: ['url'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'navigation',
  async execute(args) {
    const url = String(args.url);
    const method = args.method ? String(args.method).toUpperCase() : 'GET';
    const headers = (args.headers as Record<string, string>) || {};
    const body = args.body ? String(args.body) : undefined;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get('content-type') || '';
      let responseBody: unknown;

      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        const text = await response.text();
        const truncated = text.length > 50000;
        responseBody = truncated ? text.slice(0, 50000) : text;
        if (truncated) {
          return {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            note: `[...truncated, ${text.length} chars total]`,
          };
        }
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (e) {
      return { error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const utilityTools = [getCurrentDatetime, wait, fetchUrl];
