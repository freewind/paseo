import { z } from "zod";

export const QuickReplySchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type QuickReply = z.infer<typeof QuickReplySchema>;
