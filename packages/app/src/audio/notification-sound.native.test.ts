import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireOptionalNativeModule: vi.fn(),
  fromModule: vi.fn(),
  asset: { localUri: null as string | null, downloadAsync: vi.fn() },
}));

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: mock.requireOptionalNativeModule,
}));

vi.mock("expo-asset", () => ({
  Asset: { fromModule: mock.fromModule },
}));

// The bundler rewrites these `require`s into asset ids, which no test runner can resolve.
vi.mock("./turn-complete-sound-assets", () => ({
  TURN_COMPLETE_SOUND_SOURCES: { default: 1, chime: 2, bell: 3, pop: 4, ding: 5 },
}));

interface NativeSoundModule {
  play(uri: string): boolean;
}

/**
 * The module reads the native module once, at import time, so the stub has to be in place before
 * the import — and each case needs its own import.
 */
async function loadNotificationSound(nativeModule: NativeSoundModule | null) {
  vi.resetModules();
  mock.requireOptionalNativeModule.mockReturnValue(nativeModule);
  mock.fromModule.mockClear();
  mock.fromModule.mockReturnValue(mock.asset);
  mock.asset.localUri = "file:///cache/ExponentAsset-chime.wav";
  mock.asset.downloadAsync.mockReset().mockResolvedValue(undefined);
  return import("./notification-sound.native");
}

describe("playNotificationSound", () => {
  beforeEach(() => {
    mock.requireOptionalNativeModule.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("stays silent without the native module, so a stale dev client is not a crash", async () => {
    const { playNotificationSound } = await loadNotificationSound(null);

    playNotificationSound("chime");

    expect(mock.requireOptionalNativeModule).toHaveBeenCalledWith("PaseoNotificationSound");
    expect(mock.fromModule).not.toHaveBeenCalled();
  });

  it("hands the native module the local file of the chosen sound", async () => {
    const nativeModule = { play: vi.fn(() => true) };
    const { playNotificationSound } = await loadNotificationSound(nativeModule);

    playNotificationSound("chime");

    await vi.waitFor(() => {
      expect(nativeModule.play).toHaveBeenCalledWith("file:///cache/ExponentAsset-chime.wav");
    });
    expect(mock.fromModule).toHaveBeenCalledWith(2);
  });

  it("falls back to the default sound for an id it does not know", async () => {
    const nativeModule = { play: vi.fn(() => true) };
    const { playNotificationSound } = await loadNotificationSound(nativeModule);

    playNotificationSound("gong");

    await vi.waitFor(() => {
      expect(nativeModule.play).toHaveBeenCalled();
    });
    expect(mock.fromModule).toHaveBeenCalledWith(1);
  });

  it("warns instead of throwing when the asset has no local file", async () => {
    const nativeModule = { play: vi.fn(() => true) };
    const { playNotificationSound } = await loadNotificationSound(nativeModule);
    mock.asset.localUri = null;

    playNotificationSound("chime");

    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalled();
    });
    expect(nativeModule.play).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when the native module refuses to play", async () => {
    const nativeModule = {
      play: vi.fn(() => {
        throw new Error("SoundPool is gone");
      }),
    };
    const { playNotificationSound } = await loadNotificationSound(nativeModule);

    playNotificationSound("chime");

    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        "[NotificationSound] Failed to play sound",
        expect.any(Error),
      );
    });
  });
});
