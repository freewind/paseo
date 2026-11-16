import { useCallback, useRef } from "react";
import * as Speech from "expo-speech";
import { useToast } from "@/contexts/toast-context";
import { i18n } from "@/i18n/i18next";

interface SpeakTextInput {
  text: string;
  voiceId?: string | null;
  rate?: number;
}

interface TtsVoice {
  identifier: string;
  name: string;
  language: string;
}

/** 语音列表在进程生命周期内不变，所以第一个非空结果会被复用。 */
let cachedVoices: TtsVoice[] | null = null;
let voicesLookup: Promise<TtsVoice[]> | null = null;

/**
 * 在 web 上 `getAvailableVoicesAsync()` 只在*下一次* `voiceschanged` 事件时才完成：Electron
 *（macOS）第一次读返回空列表，之后才触发那一次事件，所以
 * 在事件已经触发之后发起的查询永远不会完成。给等待加上限，设置页才能继续
 * 渲染，卡住的查询也不会让用户选好的语音一声不响。
 */
const VOICES_TIMEOUT_MS = 2000;

/**
 * 按 Unicode 标点切段，保留 3.5、#8 和连续标点等不应拆开的内容。
 */
function splitSpeechText(text: string, limit: number): string[] {
  const punctuatedChunks = text.match(/[^]*?\p{P}+(?![\p{P}\d])|[^]+/gu) ?? [];
  const chunks: string[] = [];

  for (const chunk of punctuatedChunks) {
    if (chunk.length <= limit) {
      chunks.push(chunk);
      continue;
    }
    for (let offset = 0; offset < chunk.length; offset += limit) {
      chunks.push(chunk.slice(offset, offset + limit));
    }
  }

  return chunks;
}

function stopSpeech(): void {
  void Speech.stop().catch(() => {});
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), VOICES_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).then(
    (value) => {
      clearTimeout(timer);
      return value;
    },
    () => {
      clearTimeout(timer);
      return fallback;
    },
  );
}

function lookupVoices(): Promise<TtsVoice[]> {
  if (!voicesLookup) {
    voicesLookup = Speech.getAvailableVoicesAsync().then(
      (voices) => {
        const mapped = voices.map((voice) => ({
          identifier: voice.identifier,
          name: voice.name,
          language: voice.language,
        }));
        // 空列表既不缓存也不记忆：语音可能稍后才发布，
        // 下一个调用方应该重试，而不是被钉在空结果上。
        if (mapped.length > 0) cachedVoices = mapped;
        else voicesLookup = null;
        return mapped;
      },
      () => {
        voicesLookup = null;
        return cachedVoices ?? [];
      },
    );
  }
  return voicesLookup;
}

export function useTts(): {
  speak: (input: SpeakTextInput) => void;
  stop: () => void;
  getVoices: () => Promise<TtsVoice[]>;
} {
  const toast = useToast();
  const generationRef = useRef(0);
  const speak = useCallback(
    ({ text, voiceId, rate }: SpeakTextInput) => {
      if (!text) return;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      // expo-speech 只有一路输出：先停掉，新回复就会替换正在读的内容，
      // 而不是排在它后面。
      stopSpeech();
      const chunks = splitSpeechText(text, Speech.maxSpeechInputLength);
      const options = {
        // 用户选定的语音在所有平台都优先；只有用默认语音时才回落到当前应用语言
        // 对应的语音。
        ...(voiceId ? { voice: voiceId } : { language: i18n.resolvedLanguage ?? "en" }),
        rate: rate ?? 1,
      };

      const speakChunk = (index: number): void => {
        if (generation !== generationRef.current) return;
        const chunk = chunks[index];
        if (chunk === undefined) return;
        Speech.speak(chunk, {
          ...options,
          onDone: () => speakChunk(index + 1),
          onError: (error) => {
            if (generation !== generationRef.current) return;
            generationRef.current += 1;
            stopSpeech();
            console.warn("[TTS] Failed to speak text", error);
            toast.error(i18n.t("common.errors.error"));
          },
        });
      };

      speakChunk(0);
    },
    [toast],
  );

  const stop = useCallback(() => {
    generationRef.current += 1;
    stopSpeech();
  }, []);

  const getVoices = useCallback(async () => {
    if (cachedVoices) return cachedVoices;
    const voices = await withTimeout(lookupVoices(), cachedVoices ?? []);
    return voices.length > 0 ? voices : (cachedVoices ?? []);
  }, []);

  return { speak, stop, getVoices };
}
