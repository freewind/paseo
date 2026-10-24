import { useSettings } from "@/hooks/use-settings";
import type { ChatOutlineVariant } from "./rail";

/**
 * Freewind mode replaces the upstream outline with the left text rail. Off keeps the
 * upstream form: dots, plus the worded list when the reader asked for it.
 */
export function useChatOutlineVariant(): ChatOutlineVariant {
  const freewindMode = useSettings((settings) => settings.freewindMode);
  const textLabels = useSettings((settings) => settings.chatOutlineTextLabels);
  if (freewindMode) return "freewind";
  return textLabels ? "text" : "dots";
}
