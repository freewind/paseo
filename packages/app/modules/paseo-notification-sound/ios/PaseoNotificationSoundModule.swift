import AVFoundation
import ExpoModulesCore

/**
 * Plays the agent-finished chime without interrupting anybody else.
 *
 * The app has one `AVAudioSession`, and the categories the other audio paths leave behind — the TTS
 * and file-playback path sets `.playback` with `.duckOthers`, voice mode and dictation set
 * `.playAndRecord` plus `.voiceChat` — do not mix: anything this app plays through them lowers or
 * stops other apps' audio. `AVAudioPlayer` through the plain default category is `.soloAmbient` and
 * interrupts just the same.
 *
 * So the chime makes the session mix only when the current category cannot mix at all. A recording
 * session is left alone, because changing the category under an active recording stops its input,
 * and `.ambient` is mixing by construction.
 */
public class PaseoNotificationSoundModule: Module {
  private var players: [AVAudioPlayer] = []

  public func definition() -> ModuleDefinition {
    Name("PaseoNotificationSound")

    Function("play") { (uri: String) -> Bool in
      self.playSound(uri: uri)
    }

    OnDestroy {
      self.stopPlayers()
    }
  }

  private func playSound(uri: String) -> Bool {
    guard let url = URL(string: uri) else {
      print("Notification sound is not a URL: \(uri)")
      return false
    }

    prepareSessionForMixing()

    guard let player = try? AVAudioPlayer(contentsOf: url) else {
      print("Could not open the notification sound: \(uri)")
      return false
    }

    // Hold every player until it finishes; AVAudioPlayer stops when it is deallocated.
    players.removeAll { !$0.isPlaying }
    players.append(player)
    player.prepareToPlay()
    return player.play()
  }

  private func prepareSessionForMixing() {
    let session = AVAudioSession.sharedInstance()

    if session.category == .playAndRecord {
      return
    }

    let options = session.categoryOptions
    if session.category == .ambient
      || options.contains(.mixWithOthers)
      || options.contains(.duckOthers) {
      return
    }

    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
    } catch {
      // The chime still plays through whatever category the app holds; never drop it over this.
      print("Could not switch the audio session to mixing: \(error.localizedDescription)")
    }
  }

  private func stopPlayers() {
    players.forEach { $0.stop() }
    players.removeAll()
  }
}
