/** Skills system types (PLAN §19). */

/** An entry in a skill repo's index.json. */
export interface SkillIndexEntry {
  id: string;
  name: string;
  path: string;
  category: string;
  author: string;
  version: string;
  icon?: string;
  tags?: string[];
  description?: string;
}

/** A skill installed locally (index metadata + fetched markdown content). */
export interface InstalledSkill extends SkillIndexEntry {
  content: string;
  installedAt: string;
  /** True for skills authored in the local editor rather than fetched. */
  custom?: boolean;
}
