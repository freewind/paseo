import { z } from "zod";

/** 一条常用回复：id 由客户端生成，daemon 只按数组顺序持久化。 */
export const QuickReplySchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type QuickReply = z.infer<typeof QuickReplySchema>;
