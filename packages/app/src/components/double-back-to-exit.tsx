import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, Platform } from "react-native";
import { useToast } from "@/contexts/toast-context";

const DOUBLE_BACK_WINDOW_MS = 2000;

/**
 * 仅 Android。挂在根布局上，任何能消费返回键的东西都先执行：
 * React Native 先调最近注册的处理器，而它们都在这个组件之后订阅。
 *
 * 计时器只有一份，所以只能在根布局挂这一次。按页面各挂一份的话，在一个页面按第一次、
 * 切到另一个页面再按就不再算第二次：用户只有在同一个页面连按两次才退得出去。
 *
 * 不做关闭开关（不引入设置项）：它只是把栈底的误触挡一下，没有需要关掉它的场景。
 */
export function DoubleBackToExit() {
  const { t } = useTranslation();
  const toast = useToast();
  const lastPressAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Date.now() - lastPressAtRef.current < DOUBLE_BACK_WINDOW_MS) {
        lastPressAtRef.current = 0;
        return false;
      }
      lastPressAtRef.current = Date.now();
      toast.show(t("shell.doubleBackToExit"), {
        durationMs: DOUBLE_BACK_WINDOW_MS,
        nativeAndroid: true,
      });
      return true;
    });
    return () => subscription.remove();
  }, [t, toast]);

  return null;
}
