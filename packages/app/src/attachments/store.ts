import { isElectronRuntime } from "@/desktop/host";
import type { AttachmentStore } from "@/attachments/types";
import { createIndexedDbAttachmentStore } from "@/attachments/web/indexeddb-attachment-store";
import { isWeb } from "@/constants/platform";

let attachmentStorePromise: Promise<AttachmentStore> | null = null;

async function createAttachmentStore(): Promise<AttachmentStore> {
  if (isWeb) {
    if (isElectronRuntime()) {
      const { createDesktopAttachmentStore } =
        await import("../desktop/attachments/desktop-attachment-store");
      const { createDesktopAttachmentBridge } =
        await import("../desktop/attachments/desktop-attachment-bridge");
      return createDesktopAttachmentStore(createDesktopAttachmentBridge());
    }

    // 静态导入：web 端这个 store 必须随主 bundle 一起加载。用动态 import 时它会
    // 被拆成单独的 chunk，主 bundle 与 chunk 分两次编译、模块 ID 不保证对齐，
    // 一旦对不上就抛 unknown module（在 web 上只剩一个 null），附件功能直接崩掉。
    return createIndexedDbAttachmentStore();
  }

  const { createNativeFileAttachmentStore } = await import("./native/native-file-attachment-store");
  return createNativeFileAttachmentStore();
}

export async function getAttachmentStore(): Promise<AttachmentStore> {
  if (!attachmentStorePromise) {
    attachmentStorePromise = createAttachmentStore();
  }
  return await attachmentStorePromise;
}

/** Test-only hook to inject a deterministic store implementation. */
export function __setAttachmentStoreForTests(store: AttachmentStore | null): void {
  attachmentStorePromise = store ? Promise.resolve(store) : null;
}
