import { readPaseoConfigJson } from "./paseo-config-file.js";
import {
  PaseoConfigSchema,
  type PaseoMetadataGeneration,
} from "@getpaseo/protocol/paseo-config-schema";

export type MetadataConfigKey = "title" | "branchName" | "commitMessage" | "pullRequest";

export interface RepoRootResolver {
  resolveRepoRoot: (cwd: string) => Promise<string>;
}

// A style section carries the default guidance for one artifact. The project
// owner replaces it wholesale via paseo.json metadataGeneration.<configKey>.instructions
// — their text is used instead of the default, never appended alongside it, so the
// two never conflict. The daemon-level override (daemonOverrides, written from the
// global settings page) wins over the default but loses to paseo.json, so a
// checked-in repo config always beats a machine-local setting. The contract block
// (what to produce, the JSON shape, and any correctness/safety rules) lives outside
// the sections and is never overridable.
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
    const json = readPaseoConfigJson(repoRoot);
    return PaseoConfigSchema.parse(json).metadataGeneration;
  } catch {
    return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
