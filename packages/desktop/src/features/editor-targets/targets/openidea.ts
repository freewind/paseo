import type { EditorTarget, EditorTargetLaunchInput } from "../target.js";

const COMMANDS = ["openidea"] as const;

function pathsFor(input: EditorTargetLaunchInput): readonly string[] {
  return input.filePath ? [input.workspacePath, input.filePath] : [input.workspacePath];
}

export const openideaTarget: EditorTarget = {
  id: "openidea",
  async describe(runtime) {
    return {
      id: this.id,
      label: "OpenIDEA",
      kind: "editor",
      icon: await runtime.loadIcon("openidea.png"),
    };
  },
  async isInstalled(runtime) {
    return runtime.hasMacApplication("OpenIDEA") || runtime.resolveCommand(COMMANDS) !== null;
  },
  async launch(input, runtime) {
    const paths = pathsFor(input);
    if (runtime.hasMacApplication("OpenIDEA")) {
      await runtime.openMacApplication({ applicationName: "OpenIDEA", paths });
      return;
    }
    const command = runtime.resolveCommand(COMMANDS);
    if (!command) throw new Error("OpenIDEA is not installed");
    await runtime.spawnDetached({ command, args: [...paths] });
  },
};
