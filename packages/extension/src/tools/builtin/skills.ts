/**
 * Skill tools (PLAN §19). The agent calls search_skills when a request might
 * match an installed skill, then get_skill to load and follow its instructions.
 */
import type { ToolDefinition } from '../types';
import { fetchIndex, getInstalled, install, listInstalled } from '@/skills/store';
import { substituteVars } from '@/skills/substitute';

export const searchSkills: ToolDefinition = {
  name: 'search_skills',
  description:
    'Search installed skills by keyword or category. Call this when a request ' +
    'might match a saved workflow, then load the best match with get_skill.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      category: { type: 'string' },
    },
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const q = String(args.query ?? '').toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : null;
    const all = await listInstalled();
    const matches = all.filter((s) => {
      if (category && s.category.toLowerCase() !== category) return false;
      if (!q) return true;
      const haystack = `${s.name} ${s.description ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
    return {
      skills: matches.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
      })),
    };
  },
};

export const getSkill: ToolDefinition = {
  name: 'get_skill',
  description:
    'Load a skill\'s full instructions by id. Optionally provide variables to ' +
    'substitute into the skill template. Then follow the instructions returned.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      variables: { type: 'object', description: 'Values for {{placeholders}} in the skill.' },
    },
    required: ['id'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const skill = await getInstalled(String(args.id));
    if (!skill) return { error: `Skill not found: ${args.id}` };
    const vars = (args.variables as Record<string, string>) ?? {};
    return { name: skill.name, instructions: substituteVars(skill.content, vars) };
  },
};

export const listMarketplaceSkills: ToolDefinition = {
  name: 'list_marketplace_skills',
  description:
    'Fetch available skills from the marketplace repo. Returns skills that can ' +
    'be installed with install_skill.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      category: { type: 'string' },
    },
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const q = args.query ? String(args.query).toLowerCase() : '';
    const category = args.category ? String(args.category).toLowerCase() : null;
    const index = await fetchIndex();
    let entries = index;
    if (category) entries = entries.filter((s) => s.category.toLowerCase() === category);
    if (q) {
      entries = entries.filter((s) =>
        `${s.name} ${s.description ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase().includes(q),
      );
    }
    return {
      skills: entries.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        author: s.author,
        version: s.version,
      })),
    };
  },
};

export const installSkill: ToolDefinition = {
  name: 'install_skill',
  description:
    'Install a skill from the marketplace by id. Use list_marketplace_skills ' +
    'first to see what is available.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Skill id from list_marketplace_skills' },
    },
    required: ['id'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const index = await fetchIndex();
    const entry = index.find((s) => s.id === args.id);
    if (!entry) return { error: `Skill not found in marketplace: ${args.id}` };
    await install(entry);
    return { installed: entry.name };
  },
};

export const skillTools = [searchSkills, getSkill, listMarketplaceSkills, installSkill];
