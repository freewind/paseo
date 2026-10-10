package sh.paseo.audiofocus

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reports when another app takes over audio while Paseo is reading a reply aloud.
 *
 * Android has no notification for "somebody else started playing"; the only signal is the audio
 * focus request Paseo itself holds. Holding it with `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` is what
 * makes a third-party dictation keyboard or another player interrupt us — and the loss callback is
 * the moment reading must stop instead of talking over the user.
 */
class PaseoAudioFocusModule : Module() {
  private val audioManager
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private var request: AudioFocusRequest? = null
  private var legacyRequest: AudioManager.OnAudioFocusChangeListener? = null

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { change ->
    val lost =
      change == AudioManager.AUDIOFOCUS_LOSS ||
        change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
        change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK
    if (!lost) return@OnAudioFocusChangeListener
    releaseFocus()
    sendEvent(AUDIO_INTERRUPTED_EVENT, mapOf("reason" to change.toString()))
  }

  override fun definition() = ModuleDefinition {
    Name("PaseoAudioFocus")

    Events(AUDIO_INTERRUPTED_EVENT)

    Function("startFocus") {
      val manager = audioManager ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val focusRequest =
          AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            )
            .setOnAudioFocusChangeListener(focusChangeListener)
            .setWillPauseWhenDucked(true)
            .build()
        request = focusRequest
        manager.requestAudioFocus(focusRequest)
      } else {
        @Suppress("DEPRECATION")
        legacyRequest = focusChangeListener
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(
          focusChangeListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
        )
      }
    }

    Function("stopFocus") {
      releaseFocus()
    }

    OnDestroy {
      releaseFocus()
    }
  }

  private fun releaseFocus() {
    val manager = audioManager ?: return
    request?.let { focusRequest ->
      manager.abandonAudioFocusRequest(focusRequest)
      request = null
    }
    legacyRequest?.let { listener ->
      @Suppress("DEPRECATION") manager.abandonAudioFocus(listener)
      legacyRequest = null
    }
  }

  private companion object {
    const val AUDIO_INTERRUPTED_EVENT = "onAudioFocusLost"
  }
}