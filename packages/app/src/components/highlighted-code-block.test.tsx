import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HighlightedCodeBlock } from "./highlighted-code-block";

vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/constants/platform", () => ({ isWeb: true, isNative: false }));
vi.mock("@/constants/layout", () => ({ useIsCompactFormFactor: () => true }));

const INHERITED_STYLES = {};

const fenceTextStyle = {
  backgroundColor: "#f4f4f5",
  padding: 12,
  borderRadius: 6,
  fontFamily: "monospace",
  fontSize: 12,
} as const;

let root: Root | null = null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("navigator", dom.window.navigator);

  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

function renderCode(code: string, language: string | null) {
  act(() => {
    root?.render(
      <HighlightedCodeBlock
        code={code}
        language={language}
        inheritedStyles={INHERITED_STYLES}
        textStyle={fenceTextStyle}
      />,
    );
  });
}

describe("HighlightedCodeBlock", () => {
  it("keeps every line intact so long code scrolls sideways instead of wrapping", () => {
    const longLine = "const veryLongName = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';";
    renderCode(`${longLine}\nconst short = 1;`, "ts");

    expect(document.body.textContent).toContain(longLine);
  });

  it("keeps the trailing blank line out of the rendered code", () => {
    renderCode("const a = 1;\n", "ts");

    expect(document.body.textContent).toBe("const a = 1;");
  });
});

describe("HighlightedCodeBlock without a known language", () => {
  it("still splits the fallback text into per-line rows so nothing wraps", () => {
    const longLine = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    renderCode(`${longLine}\nsecond`, null);

    expect(document.body.textContent).toContain(longLine);
    expect(document.body.textContent).toContain("second");
  });
});
