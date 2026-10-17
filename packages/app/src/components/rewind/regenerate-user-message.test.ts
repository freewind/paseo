import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(async () => undefined),
}));

vi.mock("@/composer/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composer/actions")>();
  return {
    ...actual,
    dispatchComposerAgentMessage: dispatchMock,
  };
});

import { regenerateUserMessage } from "./regenerate-user-message";

describe("regenerateUserMessage", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
  });

  it("dispatches the message verbatim through the standard composer path", async () => {
    await regenerateUserMessage(
      {
        client: {} as Parameters<typeof regenerateUserMessage>[0]["client"],
        serverId: "server-1",
        agentId: "agent-1",
        supportsForgeAttachments: false,
      },
      { text: "帮我看看报错" },
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        text: "帮我看看报错",
        attachments: [],
      }),
    );
  });

  it("refuses to send when the agent is gone", async () => {
    await expect(
      regenerateUserMessage(
        {
          client: {} as Parameters<typeof regenerateUserMessage>[0]["client"],
          serverId: "server-1",
          agentId: null,
        },
        { text: "hello" },
      ),
    ).rejects.toThrow("agent unavailable");
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("refuses to send when the daemon client is unavailable", async () => {
    await expect(
      regenerateUserMessage(
        { client: null, serverId: "server-1", agentId: "agent-1" },
        { text: "hello" },
      ),
    ).rejects.toThrow("daemon client unavailable");
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("maps canonical images and uploaded files back to composer parts", async () => {
    const metadata = { id: "img-1" } as never;
    await regenerateUserMessage(
      {
        client: {} as Parameters<typeof regenerateUserMessage>[0]["client"],
        serverId: "server-1",
        agentId: "agent-1",
      },
      {
        text: "with attachments",
        images: [metadata],
        attachments: [
          {
            type: "uploaded_file",
            id: "f1",
            fileName: "a.txt",
            mimeType: "text/plain",
            size: 3,
            path: "/tmp/a.txt",
          },
        ] as never,
      },
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { kind: "image", metadata },
          {
            kind: "file",
            attachment: {
              type: "uploaded_file",
              id: "f1",
              fileName: "a.txt",
              mimeType: "text/plain",
              size: 3,
              path: "/tmp/a.txt",
            },
          },
        ],
      }),
    );
  });
});
