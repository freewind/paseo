import { describe, expect, test, vi } from "vitest";
import { buildHistoryProjectOptions } from "./sessions-screen";

// The screen's import chain pulls @react-navigation/native and the combobox, whose CJS
// dependency chains cannot evaluate under Node. Nothing here renders either one.
vi.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
  Link: () => null,
  NavigationContainer: () => null,
  LinkingContext: { Provider: () => null },
}));
vi.mock("@/components/ui/combobox", () => ({
  Combobox: () => null,
  ComboboxItem: () => null,
}));
// The row action area imports the conversation preview sheet, and that pulls the markdown
// renderer, whose react-native-markdown-display dependency ships JSX inside a .js file.
vi.mock("@/components/markdown/renderer", () => ({
  MarkdownRenderer: () => null,
}));

describe("buildHistoryProjectOptions", () => {
  test("leads with the all-projects option and keys the rest by server-side projectKey", () => {
    expect(
      buildHistoryProjectOptions({
        projects: [
          { viewKey: "v1", projectKey: "remote:github.com/acme/repo", projectName: "Zeta" },
          { viewKey: "v2", projectKey: "/local/alpha", projectName: "Alpha" },
        ],
      }),
    ).toEqual([
      { id: "__all_projects__", label: "All projects" },
      { id: "/local/alpha", label: "Alpha" },
      { id: "remote:github.com/acme/repo", label: "Zeta" },
    ]);
  });

  test("skips projects without a key and deduplicates keys across hosts", () => {
    expect(
      buildHistoryProjectOptions({
        projects: [
          { viewKey: "v1", projectKey: null, projectName: "Keyless" },
          { viewKey: "v2", projectKey: "remote:github.com/acme/repo", projectName: "First name" },
          { viewKey: "v3", projectKey: "remote:github.com/acme/repo", projectName: "Second name" },
        ],
      }),
    ).toEqual([
      { id: "__all_projects__", label: "All projects" },
      { id: "remote:github.com/acme/repo", label: "First name" },
    ]);
  });

  test("returns only the all-projects option when nothing is filterable", () => {
    expect(
      buildHistoryProjectOptions({
        projects: [{ viewKey: "v1", projectKey: null, projectName: "P" }],
      }),
    ).toEqual([{ id: "__all_projects__", label: "All projects" }]);
  });
});
