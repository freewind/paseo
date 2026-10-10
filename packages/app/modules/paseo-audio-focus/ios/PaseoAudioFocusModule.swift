import ExpoModulesCore
import AVFoundation

private let audioInterruptedEventName = "onAudioFocusLost"

private weak var activeModule: PaseoAudioFocusModule?

/**
 * Reports when another app takes over audio while Paseo is reading a reply aloud.
 *
 * `AVSpeechSynthesizer` keeps reading through an audio-session interruption, so the app has to
 * watch the session itself and stop. `.began` covers calls and Siri; the silence hint covers a
 * system audio source that ducks instead of interrupting.
 */
public class PaseoAudioFocusModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("PaseoAudioFocus")

    Events(audioInterruptedEventName)

    OnCreate {
      activeModule = self
    }

    OnDestroy {
      self.removeObservers()
      if activeModule === self {
        activeModule = nil
      }
    }

    Function("startFocus") {
      self.startObserving()
    }

    Function("stopFocus") {
      self.removeObservers()
    }
  }

  fileprivate func startObserving() {
    removeObservers()

    let center = NotificationCenter.default
    let session = AVAudioSession.sharedInstance()

    observers.append(
      center.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: session,
        queue: .main
      ) { notification in
        guard
          let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          AVAudioSession.InterruptionType(rawValue: raw) == .began
        else {
          return
        }
        self.emitAudioInterrupted()
      }
    )

    observers.append(
      center.addObserver(
        forName: AVAudioSession.silenceSecondaryAudioHintNotification,
        object: session,
        queue: .main
      ) { notification in
        guard
          let raw = notification.userInfo?[AVAudioSessionSilenceSecondaryAudioHintTypeKey]
            as? UInt,
          AVAudioSession.SilenceSecondaryAudioHintType(rawValue: raw) == .begin
        else {
          return
        }
        self.emitAudioInterrupted()
      }
    )
  }

  fileprivate func removeObservers() {
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
    }
    observers = []
  }

  fileprivate func emitAudioInterrupted() {
    sendEvent(audioInterruptedEventName, ["reason": "interrupted"])
  }
}