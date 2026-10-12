package sh.paseo.notificationsound

import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Plays the agent-finished chime without taking audio focus away from anyone.
 *
 * `expo-audio` requests `AUDIOFOCUS_GAIN` before it plays, so every other player — the user's
 * music, a podcast, another agent's reply being read aloud — gets `AUDIOFOCUS_LOSS` and stays
 * stopped. SoundPool is the API for short effects: it never requests focus and never changes the
 * stream or the mode, so the chime layers on top of whatever is already playing.
 *
 * The JS side resolves the bundled `require()`d asset through `expo-asset` and passes the local
 * file URL, which is the only shape SoundPool can decode from.
 */
class PaseoNotificationSoundModule : Module() {
  private var soundPool: SoundPool? = null
  private val soundIdByUri = HashMap<String, Int>()
  private val uriBySoundId = HashMap<Int, String>()
  private val loadedUris = HashSet<String>()
  private val playWhenLoaded = HashSet<String>()

  override fun definition() = ModuleDefinition {
    Name("PaseoNotificationSound")

    Function("play") { uri: String ->
      playSound(uri)
    }

    OnDestroy {
      soundPool?.release()
      soundPool = null
      soundIdByUri.clear()
      uriBySoundId.clear()
      loadedUris.clear()
      playWhenLoaded.clear()
    }
  }

  private fun playSound(uri: String): Boolean {
    val pool = ensureSoundPool() ?: return false

    val knownSoundId = soundIdByUri[uri]
    if (knownSoundId == null) {
      val soundId = loadSound(pool, uri) ?: return false
      soundIdByUri[uri] = soundId
      uriBySoundId[soundId] = uri
      playWhenLoaded.add(uri)
      return true
    }

    // The first press usually lands while the file is still decoding; play it on load instead of
    // dropping it, or the chime is silent for the whole first turn.
    if (!loadedUris.contains(uri)) {
      playWhenLoaded.add(uri)
      return true
    }

    return playLoadedSound(pool, knownSoundId)
  }

  private fun ensureSoundPool(): SoundPool? {
    soundPool?.let { return it }

    val pool = SoundPool.Builder()
      .setMaxStreams(MAX_STREAMS)
      .setAudioAttributes(
        AudioAttributes.Builder()
          // Media usage keeps the chime on the media volume, where the player it replaced lived.
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      .build()
    pool.setOnLoadCompleteListener { _, soundId, status -> onLoadComplete(soundId, status) }
    soundPool = pool
    return pool
  }

  private fun loadSound(pool: SoundPool, uri: String): Int? {
    val file = File(uri.removePrefix("file://"))
    if (!file.exists()) {
      Log.w(TAG, "Notification sound is not on disk: $uri")
      return null
    }

    val soundId = pool.load(file.absolutePath, PRIORITY)
    if (soundId == 0) {
      Log.w(TAG, "SoundPool could not load the notification sound: $uri")
      return null
    }
    return soundId
  }

  private fun onLoadComplete(soundId: Int, status: Int) {
    val uri = uriBySoundId.remove(soundId) ?: return

    if (status != 0) {
      Log.w(TAG, "SoundPool failed to decode the notification sound: $uri")
      soundIdByUri.remove(uri)
      playWhenLoaded.remove(uri)
      return
    }

    loadedUris.add(uri)
    if (playWhenLoaded.remove(uri)) {
      soundPool?.let { playLoadedSound(it, soundId) }
    }
  }

  private fun playLoadedSound(pool: SoundPool, soundId: Int): Boolean {
    // Volume 1f is relative to the media stream, so the user's volume slider still decides how
    // loud the chime is.
    return pool.play(soundId, 1f, 1f, PRIORITY, 0, 1f) != 0
  }

  private companion object {
    const val TAG = "PaseoNotificationSound"
    const val MAX_STREAMS = 4
    const val PRIORITY = 1
  }
}
