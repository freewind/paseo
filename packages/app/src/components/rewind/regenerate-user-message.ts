import type { ComposerAttachment } from "@/attachments/types";
import {
  dispatchComposerAgentMessage,
  type ComposerSendClient,
  type MessageSubmissionWriter,
} from "@/composer/actions";
import { resolveComposerAttachmentSubmitFormat } from "@/composer/attachments/submit";
import type { ActiveTurnBehavior, AgentAttachment } from "@getpaseo/protocol/messages";
import type { AttachmentMetadata } from "@/attachments/types";
import { encodeImages } from "@/utils/encode-images";

export interface RegenerateUserMessageInput {
  text: string;
  attachments?: AgentAttachment[];
  images?: AttachmentMetadata[];
}

export interface RegenerateAgentMessageDeps {
  client: ComposerSendClient | null;
  serverId: string;
  agentId: string | null;
  /** Whether the host advertises `forgeSearch`; decides the attachment wire format. */
  supportsForgeAttachments?: boolean;
  /** Composer's send behavior for an open turn; rewind guarantees the turn is closed. */
  activeTurnBehavior?: ActiveTurnBehavior;
}

function attachmentsFromParts(input: RegenerateUserMessageInput): ComposerAttachment[] {
  const parts: ComposerAttachment[] = [];
  for (const image of input.images ?? []) {
    parts.push({ kind: "image", metadata: image });
  }
  for (const attachment of input.attachments ?? []) {
    // A canonical echo carries `AgentAttachment`; uploaded-file entries round-trip through
    // the uploaded_file shape, and other agent attachment kinds map back to their part.
    if (attachment.type === "uploaded_file") {
      parts.push({ kind: "file", attachment });
    }
  }
  return parts;
}

/**
 * Resend a user message verbatim after a rewind removed it and everything after it.
 *
 * The caller must rewind first and only call here on success: a failed rewind never
 * sends, so the transcript can never end up with the message both present and about
 * to repeat. The resend goes through the standard composer dispatch, so image encoding
 * and attachment splitting behave exactly like a typed send.
 */
export async function regenerateUserMessage(
  deps: RegenerateAgentMessageDeps,
  input: RegenerateUserMessageInput,
): Promise<void> {
  if (!deps.agentId) {
    throw new Error("regenerate: agent unavailable");
  }
  if (!deps.client) {
    throw new Error("regenerate: daemon client unavailable");
  }
  await dispatchComposerAgentMessage({
    client: deps.client,
    agentId: deps.agentId,
    text: input.text,
    attachments: attachmentsFromParts(input),
    attachmentSubmitFormat: resolveComposerAttachmentSubmitFormat({
      supportsForgeAttachments: deps.supportsForgeAttachments === true,
    }),
    encodeImages,
    submission: createNoopSubmissionWriter(),
    activeTurnBehavior: deps.activeTurnBehavior,
  });
}

/**
 * The user message this path resends is the one the rewind just removed, so the
 * optimistic "pending" bubble the composer draws would double the row for a moment.
 * Without tracking, the canonical echo replaces nothing and reconciliation is direct.
 */
function createNoopSubmissionWriter(): MessageSubmissionWriter {
  return {
    begin: () => undefined,
    accept: () => undefined,
    reject: () => "rejected" as const,
  };
}
