/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ copied: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/utils/copy-to-clipboard", () => ({ copyToClipboard: vi.fn() }));

// Extension-qualified: the bare specifier resolves to `prompt-detail.web.tsx`, which `require`s
// this file and hands the .tsx load to Node. tsgo rejects the extension, hence the suppression.
// @ts-expect-error TS5097 the runtime resolver needs the extension here
import { PromptDetailContent } from "./prompt-detail.tsx";

afterEach(cleanup);

const prompt = { seq: 1, timestamp: new Date(0).toISOString(), preview: "truncated preview" };

function renderDetail(onRequestPromptText: (seq: number) => Promise<string | null>) {
  return render(
    <PromptDetailContent
      prompt={prompt}
      index={0}
      total={1}
      onRequestPromptText={onRequestPromptText}
      onJumpToPrompt={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("PromptDetailContent", () => {
  it("reads the prompt once even though the reader changes on every render", async () => {
    const firstRead = vi.fn(async () => "full text");
    const { rerender, getByTestId } = renderDetail(firstRead);

    await act(async () => undefined);
    expect(firstRead).toHaveBeenCalledExactlyOnceWith(1);

    // The chat re-renders constantly while streaming, and each render hands over a new closure.
    const secondRead = vi.fn(async () => "full text");
    await act(async () => {
      rerender(
        <PromptDetailContent
          prompt={prompt}
          index={0}
          total={1}
          onRequestPromptText={secondRead}
          onJumpToPrompt={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    expect(secondRead).not.toHaveBeenCalled();
    expect(getByTestId("chat-outline-prompt-detail-scroll-1").textContent).toBe("full text");
  });

  it("falls back to the preview when the prompt cannot be read", async () => {
    const { getByTestId } = renderDetail(async () => null);

    await act(async () => undefined);

    expect(getByTestId("chat-outline-prompt-detail-scroll-1").textContent).toBe(
      "truncated preview",
    );
  });
});
