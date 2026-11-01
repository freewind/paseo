import { readPaseoConfig } from "./paseo-config-file.js";
import { type PaseoMetadataGeneration } from "@getpaseo/protocol/paseo-config-schema";

import type { MetadataPromptKey } from "@getpaseo/protocol/metadata-prompts";

export type MetadataConfigKey = MetadataPromptKey;

export interface RepoRootResolver {
  resolveRepoRoot: (cwd: string) => Promise<string>;
}

// A style section carries the default guidance for one artifact. The project
// owner replaces it wholesale via paseo.json metadataGeneration.<configKey>.instructions
// — their text is used instead of the default, never appended alongside it, so the
// two never conflict. The contract block (what to produce, the JSON shape, and any
// correctness/safety rules) lives outside the sections and is never overridable.
export interface MetadataStyleSection {
  configKey: MetadataConfigKey;
  default: string;
  label?: string;
}

export interface BuildMetadataPromptOptions {
  cwd: string;
  contract: string;
  styles: MetadataStyleSection[];
  after: string;
  trailing?: string;
  workspaceGitService?: RepoRootResolver;
  /** 全局设置里的覆盖值：优先于内置默认，但输给仓库里的 paseo.json。 */
  daemonOverrides?: Partial<Record<MetadataConfigKey, string>>;
}

export async function buildMetadataPrompt(options: BuildMetadataPromptOptions): Promise<string> {
  const overrides = await readProjectMetadataOverrides(options);
  const styleBlocks = options.styles.map((section) =>
    renderStyleSection(
      section,
      overrides?.[section.configKey]?.instructions,
      options.daemonOverrides?.[section.configKey],
    ),
  );
  const head = [options.contract, ...styleBlocks, options.after].join("\n\n");
  return options.trailing ? `${head}\n\n${options.trailing}` : head;
}

function renderStyleSection(
  section: MetadataStyleSection,
  projectOverride: string | undefined,
  daemonOverride: string | undefined,
): string {
  let body = section.default;
  if (isNonEmptyString(projectOverride)) {
    body = projectOverride.trim();
  } else if (isNonEmptyString(daemonOverride)) {
    body = daemonOverride.trim();
  }
  return section.label ? `${section.label}:\n${body}` : body;
}

async function readProjectMetadataOverrides(
  options: Pick<BuildMetadataPromptOptions, "cwd" | "workspaceGitService">,
): Promise<PaseoMetadataGeneration | undefined> {
  if (!options.workspaceGitService) {
    return undefined;
  }
  try {
    const repoRoot = await options.workspaceGitService.resolveRepoRoot(options.cwd);
    const result = await readPaseoConfig(repoRoot);
    return result.ok ? result.config?.metadataGeneration : undefined;
  } catch {
    return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
