import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOptionalNativeModule } = vi.hoisted(() => ({
  requireOptionalNativeModule: vi.fn(),
}));

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule,
}));

interface NativeTextSelectionModule {
  getSelectedText(): string | null;
}

/**
 * The module reads the native module once, at import time, so the stub has to be in place before
 * the import — and each case needs its own import.
 */
async function loadSelection(nativeModule: NativeTextSelectionModule | null) {
  vi.resetModules();
  requireOptionalNativeModule.mockReturnValue(nativeModule);
  return import("./selection.ios");
}

describe("readAssistantCommentSelection on iOS", () => {
  beforeEach(() => {
    requireOptionalNativeModule.mockReset();
  });

  it("returns null without the native module, so an older binary falls back to the block", async () => {
    const { readAssistantCommentSelection } = await loadSelection(null);

    expect(requireOptionalNativeModule).toHaveBeenCalledWith("PaseoTextSelection");
    expect(readAssistantCommentSelection()).toBeNull();
  });

  it("returns null when the native side reports only whitespace", async () => {
    const { readAssistantCommentSelection } = await loadSelection({
      getSelectedText: () => "  \n ",
    });

    expect(readAssistantCommentSelection()).toBeNull();
  });

  it("returns the selected text", async () => {
    const { readAssistantCommentSelection } = await loadSelection({
      getSelectedText: () => "selected",
    });

    expect(readAssistantCommentSelection()).toBe("selected");
  });
});
