/**
 * Installed-skill storage + remote marketplace (PLAN §19).
 * Installed skills live in chrome.storage.local; the marketplace is a GitHub
 * repo exposing index.json plus per-skill markdown files.
 */
import * as local from '@/storage/local';
import type { InstalledSkill, SkillIndexEntry } from './types';

const KEY = 'installed_skills';

const DEFAULT_REPO =
  (import.meta.env.VITE_SKILLS_REPO_URL as string | undefined) ??
  'https://raw.githubusercontent.com/abdul-karim-mia/browsecortex/main/skills';

const REPO_KEY = 'skills_repo_url';

// ── Installed skills ──────────────────────────────────────────────

export async function listInstalled(): Promise<InstalledSkill[]> {
  return (await local.get<InstalledSkill[]>(KEY)) ?? [];
}

export async function getInstalled(id: string): Promise<InstalledSkill | undefined> {
  return (await listInstalled()).find((s) => s.id === id);
}

export async function saveInstalled(skill: InstalledSkill): Promise<void> {
  const all = await listInstalled();
  const idx = all.findIndex((s) => s.id === skill.id);
  if (idx >= 0) all[idx] = skill;
  else all.push(skill);
  await local.set(KEY, all);
}

export async function uninstall(id: string): Promise<void> {
  await local.set(
    KEY,
    (await listInstalled()).filter((s) => s.id !== id),
  );
}

// ── Marketplace ───────────────────────────────────────────────────

export async function getRepoUrl(): Promise<string> {
  return (await local.get<string>(REPO_KEY)) ?? DEFAULT_REPO;
}

export async function setRepoUrl(url: string): Promise<void> {
  await local.set(REPO_KEY, url || DEFAULT_REPO);
}

export async function fetchIndex(): Promise<SkillIndexEntry[]> {
  const repo = await getRepoUrl();
  const res = await fetch(`${repo.replace(/\/$/, '')}/index.json`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = (await res.json()) as { skills?: SkillIndexEntry[] } | SkillIndexEntry[];
  return Array.isArray(json) ? json : (json.skills ?? []);
}

/** Fetch a skill's markdown and store it locally (PLAN §19 one-click install). */
export async function install(entry: SkillIndexEntry): Promise<InstalledSkill> {
  const repo = await getRepoUrl();
  const res = await fetch(`${repo.replace(/\/$/, '')}/${entry.path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const content = await res.text();
  const skill: InstalledSkill = { ...entry, content, installedAt: new Date().toISOString() };
  await saveInstalled(skill);
  return skill;
}
