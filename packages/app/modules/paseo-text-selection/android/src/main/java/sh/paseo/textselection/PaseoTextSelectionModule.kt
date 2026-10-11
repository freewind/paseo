package sh.paseo.textselection

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private const val MAIN_THREAD_TIMEOUT_MS = 500L

/**
 * Reads the text the user has selected so the comment menu can quote it.
 *
 * JS cannot see a selection: the Markdown blocks are `ReactTextView`s, so the range only exists
 * on the native side. The JS side is synchronous, so this blocks on the main thread instead of
 * exposing a promise.
 */
class PaseoTextSelectionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PaseoTextSelection")

    Function("getSelectedText") {
      return@Function readSelectedText()
    }
  }

  /**
   * The view hierarchy is main-thread only while a sync `Function` runs on the JS thread, so the
   * read hops onto the main thread and waits for it. The timeout is a safety net: a blocked main
   * thread must not hang the JS call, and a null answer falls back to the whole block.
   */
  private fun readSelectedText(): String? {
    var selected: String? = null
    val latch = CountDownLatch(1)
    Handler(Looper.getMainLooper()).post {
      try {
        selected = selectedTextInHierarchy(appContext.currentActivity?.window?.decorView)
      } finally {
        latch.countDown()
      }
    }
    latch.await(MAIN_THREAD_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    return selected
  }

  private fun selectedTextInHierarchy(view: View?): String? {
    if (view == null) {
      return null
    }

    // `EditText` is a `TextView` too, and RN's multiline TextInput is a `ReactEditText`, so
    // without this check a stale selection in the composer would answer before the transcript.
    // The Markdown blocks are plain `ReactTextView`s.
    if (view is TextView && view !is EditText) {
      val start = view.selectionStart
      val end = view.selectionEnd
      if (start >= 0 && end > start) {
        return view.text.subSequence(start, end).toString()
      }
    }

    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        val selected = selectedTextInHierarchy(view.getChildAt(index))
        if (selected != null) {
          return selected
        }
      }
    }

    return null
  }
}
