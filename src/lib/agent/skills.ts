/**
 * Skill discovery and loading for the AI agent pipeline.
 *
 * Skills are SKILL.md files in .claude/skills/<skill-name>/ directories.
 * At startup, we scan for available skills and build a summary.
 * The agent can then call loadSkill to get the full content.
 */

import { tool } from "ai";
import { z } from "zod";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Discovery — scan skill directories for SKILL.md files
// ---------------------------------------------------------------------------

const SKILL_DIRS = [
  join(process.cwd(), ".claude", "skills"),
];

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) throw new Error("No frontmatter found");

  const lines = match[1].split("\n");
  let name = "";
  let description = "";

  for (const line of lines) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();
  }

  if (!name) throw new Error("No name in frontmatter");
  return { name, description };
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export async function discoverSkills(): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const seenNames = new Set<string>();

  for (const dir of SKILL_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // Directory doesn't exist
    }

    for (const entry of entries) {
      const skillDir = join(dir, entry);
      const skillFile = join(skillDir, "SKILL.md");

      try {
        const dirStat = await stat(skillDir);
        if (!dirStat.isDirectory()) continue;

        const content = await readFile(skillFile, "utf-8");
        const frontmatter = parseFrontmatter(content);

        // Skip the universal framework — it's always in the system prompt
        if (frontmatter.name === "roi-financial-modeling") continue;

        if (seenNames.has(frontmatter.name)) continue;
        seenNames.add(frontmatter.name);

        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: skillDir,
        });
      } catch {
        continue; // Skip invalid skills
      }
    }
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Build skills prompt (injected into system prompt)
// ---------------------------------------------------------------------------

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) return "";

  const skillsList = skills
    .map((s) => `* **${s.name}**: ${s.description}`)
    .join("\n");

  return `## Available Service Skills

After Step 1 (understanding the engagement), use the \`load_skill\` tool to load
the skill matching the service type. This gives you service-specific reasoning
guidance for scoping, maturity assessment, and narrative framing.

${skillsList}
`;
}

// ---------------------------------------------------------------------------
// loadSkill tool (AI SDK tool definition)
// ---------------------------------------------------------------------------

export function createLoadSkillTool(skills: SkillMetadata[]) {
  return tool({
    description:
      "Load a service-specific skill to get specialized reasoning guidance. " +
      "Call this after Step 1 when you know the service type. " +
      "Returns scoping logic, sector lenses, maturity signals, and narrative framing specific to that service.",
    inputSchema: z.object({
      name: z.string().describe("The skill name to load (e.g. 'experience-transformation')"),
    }),
    execute: async ({ name }) => {
      const skill = skills.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      );
      if (!skill) {
        return {
          error: `Skill '${name}' not found. Available: ${skills.map((s) => s.name).join(", ")}`,
        };
      }

      const content = await readFile(join(skill.path, "SKILL.md"), "utf-8");
      const body = stripFrontmatter(content);

      return {
        skillName: skill.name,
        content: body,
      };
    },
  });
}
