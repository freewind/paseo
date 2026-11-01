import { persistAttachmentFromBytes } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import type { ImageAttachment } from "@getpaseo/protocol/messages";

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * 把备忘的内联 base64 图片还原成 composer 附件元数据。字节走标准附件存储，
 * 预览、删除、GC 保留都与 composer 一致：草稿附件里的 id 就能让它活着。

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

/** 把备忘文字追加到草稿，不改写已有内容：不 trim、保留换行。 */
export function appendMemoText(current: string, memoText: string): string {
  if (current.trim().length === 0) {
    return memoText;
  }
  return current.endsWith("\n") ? `${current}${memoText}` : `${current}\n${memoText}`;
}
