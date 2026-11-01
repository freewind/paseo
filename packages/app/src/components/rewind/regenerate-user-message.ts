import type { ComposerAttachment, AttachmentMetadata } from "@/attachments/types";
import {
  dispatchComposerAgentMessage,
  type ComposerSendClient,
  type MessageSubmissionWriter,
} from "@/composer/actions";
import { resolveComposerAttachmentSubmitFormat } from "@/composer/attachments/submit";
import type { ActiveTurnBehavior, AgentAttachment } from "@getpaseo/protocol/messages";
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
  /** 宿主是否声明支持 forge 附件；决定附件的传输格式。 */
  supportsForgeAttachments?: boolean;
  /** 打开回合时的发送行为；回退保证调用这里时回合已关闭。 */
  activeTurnBehavior?: ActiveTurnBehavior;
}

function attachmentsFromParts(input: RegenerateUserMessageInput): ComposerAttachment[] {
  const parts: ComposerAttachment[] = [];
  for (const image of input.images ?? []) {
    parts.push({ kind: "image", metadata: image });
  }
  for (const attachment of input.attachments ?? []) {
    // 转录里回显的是规范化后的 AgentAttachment；上传文件这一种能原样映射回 composer 的部分。
    if (attachment.type === "uploaded_file") {
      parts.push({ kind: "file", attachment });
    }
  }
  return parts;
}

/**
 * 回退把一条用户消息连带其后内容删掉之后，原样重发这条消息。
 *
 * 调用方必须先回退，且只在回退成功后调这里：回退失败就不发送，转录里不会出现「消息还在又要
 * 再发一遍」。重发走 composer 的标准发送路径，所以图片编码与附件拆分与手动发送完全一致。
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
 * 重发的是刚被回退删掉的那条消息，composer 那套「先画一条待发送气泡」的追踪会短暂画出重复
 * 的一行。这里不登记追踪，规范化回显直接替换，界面不会看到两份。
 */
function createNoopSubmissionWriter(): MessageSubmissionWriter {
  return {
    begin: () => undefined,
    accept: () => undefined,
    reject: () => "rejected" as const,
  };
}
