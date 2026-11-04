import type { EditorTarget, EditorTargetLaunchInput } from "../target.js";

const COMMANDS = ["openidea"] as const;

function pathsFor(input: EditorTargetLaunchInput): readonly string[] {
  // OpenIDEA 只能接路径，拿不到行列位置，所以这里丢掉 input.line / input.column。
  // 同目录的 intellij-idea、aqua、android-studio 都会传 --line / --column，差别来自工具能力，不是漏传。
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
    // OpenIDEA 只提供 macOS 应用包，所以先看 .app，`openidea` 命令只是傅底。
    // 同目录 cursor.ts 的顺序相反（先 CLI），不要按那里的写法改。
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
