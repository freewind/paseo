import ExpoModulesCore
import UIKit

public class PaseoTextSelectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaseoTextSelection")

    Function("getSelectedText") { () -> String? in
      return PaseoTextSelectionModule.selectedText()
    }
  }

  /**
   * The selected text of the first text view that has one, or nil when nothing is selected.
   *
   * Called from JS, so this is the JS thread: the view hierarchy itself is main-thread only.
   * The main-thread check is not decoration — a sync dispatch onto the queue we are already on
   * deadlocks instead of failing.
   */
  private static func selectedText() -> String? {
    if Thread.isMainThread {
      return readSelectedText()
    }
    return DispatchQueue.main.sync { readSelectedText() }
  }

  private static func readSelectedText() -> String? {
    // Every connected scene, not just the key window: a menu rendered in its own window or in a
    // modal presentation is a different window, and the selection can live in either one.
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else {
        continue
      }
      for window in windowScene.windows {
        if let selected = selectedText(in: window) {
          return selected
        }
      }
    }
    return nil
  }

  private static func selectedText(in view: UIView) -> String? {
    if let textView = view as? UITextView,
      !textView.isSecureTextEntry,
      let range = textView.selectedTextRange,
      !range.isEmpty
    {
      return textView.text(in: range)
    }

    // The Markdown blocks render through `react-native-uitextview`, which puts a plain
    // `UITextView` inside its own view, so the text view is never the top-level window view.
    for subview in view.subviews {
      if let selected = selectedText(in: subview) {
        return selected
      }
    }
    return nil
  }
}
