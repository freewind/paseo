import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { METADATA_PROMPT_KEYS } from "@getpaseo/protocol/metadata-prompts";
import { writePrivateFileAtomic } from "./private-files.js";

const MetadataInstructionsSchema = z
  .object({
    instructions: z.string().optional(),
  })
  .strict();

const FreewindConfigSchema = z
  .object({
    metadataGeneration: z
      .object({
        title: MetadataInstructionsSchema.optional(),
        branchName: MetadataInstructionsSchema.optional(),
        commitMessage: MetadataInstructionsSchema.optional(),
        pullRequest: MetadataInstructionsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type FreewindMetadataGeneration = z.infer<typeof FreewindConfigSchema>["metadataGeneration"];

export function getFreewindConfigPath(paseoHome: string): string {
  return path.join(paseoHome, "freewind.config.json");
}

export function readFreewindMetadataGenerationSync(paseoHome: string): FreewindMetadataGeneration {
  const filePath = getFreewindConfigPath(paseoHome);
  // daemon 启动时只读一次，和 loadPersistedConfig 的同步入口同性质。
  if (!existsSync(filePath)) return undefined;
  return FreewindConfigSchema.parse(JSON.parse(readFileSync(filePath, "utf8"))).metadataGeneration;
}

export async function readFreewindMetadataGeneration(
  paseoHome: string,
): Promise<FreewindMetadataGeneration> {
  const filePath = getFreewindConfigPath(paseoHome);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return FreewindConfigSchema.parse(JSON.parse(raw)).metadataGeneration;
}

export async function writeFreewindMetadataGeneration(
  paseoHome: string,
  metadataGeneration: FreewindMetadataGeneration,
): Promise<void> {
  await writePrivateFileAtomic(
    getFreewindConfigPath(paseoHome),
    `${JSON.stringify({ metadataGeneration }, null, 2)}\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 只保留四条已知提示词，避免配置里的其它字段进入专用文件。 */
export function pickMetadataPromptEntries(metadataGeneration: unknown): FreewindMetadataGeneration {
  if (!isRecord(metadataGeneration)) return undefined;
  const picked: NonNullable<FreewindMetadataGeneration> = {};
  for (const key of METADATA_PROMPT_KEYS) {
    const entry = metadataGeneration[key];
    if (isRecord(entry) && typeof entry.instructions === "string") {
      picked[key] = { instructions: entry.instructions };
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

export function stripMetadataPromptEntries<T extends { metadataGeneration?: unknown }>(
  config: T,
): T {
  const metadataGeneration = config.metadataGeneration;
  if (!isRecord(metadataGeneration)) return config;
  const next = { ...metadataGeneration };
  let changed = false;
  for (const key of METADATA_PROMPT_KEYS) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  if (!changed) return config;
  return { ...config, metadataGeneration: next } as T;
}

export function mergeFreewindMetadataGeneration(
  metadataGeneration: unknown,
  freewind: FreewindMetadataGeneration,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(stripMetadataPromptEntries({ metadataGeneration }).metadataGeneration as
      | Record<string, unknown>
      | undefined),
  };
  if (freewind) Object.assign(base, freewind);
  return base;
}
