import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/settings";

/** 一项都没有时页面也保留，免得设置项临时清空就把整页藏掉。 */
export function FreewindSection() {
  const { t } = useTranslation();
  return <SettingsSection title={t("freewind.title")}>{null}</SettingsSection>;
}
