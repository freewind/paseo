import { MessageSquarePlus } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** 菜单项的评论图标；两处入口共用同一个映射，颜色跟着主题走。 */
export const ThemedCommentIcon = withUnistyles(MessageSquarePlus, mutedColorMapping);
