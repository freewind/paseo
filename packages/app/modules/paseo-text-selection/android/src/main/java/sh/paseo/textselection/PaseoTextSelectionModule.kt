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
 * 读出用户选中的文字，供评论菜单引用。
 *
 * JS 拿不到选区：Markdown 块是 `ReactTextView`，选区范围只存在于原生侧。JS 侧是同步
 * 调用，所以这里阻塞主线程完成读取，而不是返回一个 promise。
 */
class PaseoTextSelectionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PaseoTextSelection")

    Function("getSelectedText") {
      return@Function readSelectedText()
    }
  }

  /**
   * 视图层级只在主线程可读，而同步 `Function` 跑在 JS 线程上，所以这次读取跳到主线程并等
   * 它完成。超时只是兼容手段：主线程被堵住不能让 JS 调用挂死，拿不到就回退到整块。
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

    // `EditText` 也是 `TextView`，而 RN 的多行 TextInput 是 `ReactEditText`，没有这个
    // 判断，composer 里一个陈旧的选区会先于正文回答。Markdown 块是普通的 `ReactTextView`。
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
