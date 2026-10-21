import { persistAttachmentFromBytes } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import type { AgentMemo, ImageAttachment } from "@getpaseo/protocol/messages";

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Rehydrates a memo's inline base64 images as composer attachment metadata. The bytes go
 * through the standard attachment store, so preview, removal and garbage-collection
 * retention are the existing composer ones: an id in the draft's attachments keeps it alive.
 */
export async function memoImagesToAttachments(
  images: readonly ImageAttachment[] | undefined,
): Promise<AttachmentMetadata[]> {
  if (!images || images.length === 0) {
    return [];
  }
  const persisted = await Promise.all(
    images.map(async (image) => {
      try {
        return await persistAttachmentFromBytes({
          bytes: base64ToUint8Array(image.data),
          mimeType: image.mimeType,
        });
      } catch {
        return null;
      }
    }),
  );
  return persisted.filter((metadata): metadata is AttachmentMetadata => metadata !== null);
}

export function memoAppendText(memo: AgentMemo): string {
  return memo.text;
}

/** Appends `memoText` without rewriting the existing draft: trims nothing, keeps newlines. */
export function appendMemoText(current: string, memoText: string): string {
  if (current.trim().length === 0) {
    return memoText;
  }
  return current.endsWith("\n") ? `${current}${memoText}` : `${current}\n${memoText}`;
}
