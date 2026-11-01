/**
 * 四类元数据生成提示词的内置默认值。
 *
 * 放在协议包里是因为只有服务端与 app 都依赖它：服务端拼提示词、设置页把它当占位符展示。
 * 同版本下两边读同一份常量，占位符不会漂移；客户端与 daemon 版本不同步时，占位符可能还是旧文案。
 *
 * paseo.json 的 `metadataGeneration` 键在 `paseo-config-schema.ts` 里独立定义（有意不合并，
 * 配置文件格式因此不变）。这里只管「默认文案」与「key 联合类型」，新增第五类提示词时两处都要改。
 */
export const METADATA_PROMPT_KEYS = [
  "title",
  "branchName",
  "commitMessage",
  "pullRequest",
] as const;

export type MetadataPromptKey = (typeof METADATA_PROMPT_KEYS)[number];

export const METADATA_PROMPT_DEFAULTS: Record<MetadataPromptKey, string> = {
  title: [
    "An actionable task label: requested operation + concrete target + strongest distinguishing anchor (sentence case, max 80 characters).",
    "Preserve explicit identifiers such as PR or issue numbers, file paths, packages, components, commands, and quoted names when they distinguish the task.",
    "Aim for about 4 words, but never drop a part needed to understand or distinguish the task.",
    'Example: "Refactor PR #2638 Playwright specs".',
  ].join("\n"),
  branchName:
    "A short task-shaped slug preserving the operation, target, and explicit identifier when present.",
  commitMessage: "Concise, imperative mood, no trailing period.",
  pullRequest: "Clear, descriptive title; body explaining what changed and why.",
};
