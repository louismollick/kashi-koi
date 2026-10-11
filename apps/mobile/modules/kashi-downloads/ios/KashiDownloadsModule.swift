import BackgroundTasks
import ExpoModulesCore
import Foundation

public class KashiDownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KashiDownloads")

    Events("onExpired")

    Function("isSupported") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    Function("isActive") { () -> Bool in
      if #available(iOS 26.0, *) { return TaskHolder.shared.isActive }
      return false
    }

    // Submits the task, or only raises its total when one is already running.
    // Must be called from the foreground in response to a user tap.
    // Resolves false when unsupported or when the system refuses the request.
    AsyncFunction("begin") { (title: String, subtitle: String, total: Int) -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return TaskHolder.shared.begin(title: title, subtitle: subtitle, total: Int64(total)) { [weak self] reason in
        self?.sendEvent("onExpired", ["reason": reason])
      }
    }

    Function("setProgress") { (completed: Int, total: Int, subtitle: String?) in
      guard #available(iOS 26.0, *) else { return }
      TaskHolder.shared.setProgress(completed: Int64(completed), total: Int64(total), subtitle: subtitle)
    }

    Function("end") { (success: Bool) in
      guard #available(iOS 26.0, *) else { return }
      TaskHolder.shared.end(success: success)
    }

    AsyncFunction("excludeFromBackup") { (uri: String) in
      guard var url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "KashiDownloads", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected a file URL"])
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
    }
  }
}

@available(iOS 26.0, *)
private final class TaskHolder {
  static let shared = TaskHolder()

  private let lock = NSLock()
  private var task: BGContinuedProcessingTask?
  /// The identifier of the request submitted last; its launch handler is the
  /// only one allowed to attach.
  private var submittedIdentifier: String?
  private var pendingSubmit = false
  private var onExpired: ((String) -> Void)?
  private var title = ""
  private var total: Int64 = 0

  /// Each task gets its own identifier under the `<bundle id>.downloads.*`
  /// wildcard in BGTaskSchedulerPermittedIdentifiers, as Apple asks for a name
  /// unique to the job. Every identifier is registered exactly once: the system
  /// kills the app on a second registration of the same identifier.
  private func newIdentifier() -> String {
    return (Bundle.main.bundleIdentifier ?? "com.kashikoi") + ".downloads." + UUID().uuidString
  }

  var isActive: Bool {
    lock.lock(); defer { lock.unlock() }
    return task != nil || pendingSubmit
  }

  func begin(title: String, subtitle: String, total: Int64, onExpired: @escaping (String) -> Void) -> Bool {
    lock.lock()
    self.onExpired = onExpired
    if let task = task {
      self.total = max(self.total, total)
      task.progress.totalUnitCount = self.total
      lock.unlock()
      return true
    }
    if pendingSubmit {
      self.total = max(self.total, total)
      lock.unlock()
      return true
    }
    self.title = title
    self.total = total
    let identifier = newIdentifier()
    submittedIdentifier = identifier
    pendingSubmit = true
    lock.unlock()

    let ok = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { [weak self] task in
      guard let task = task as? BGContinuedProcessingTask else {
        task.setTaskCompleted(success: false)
        return
      }
      guard let self = self else {
        task.setTaskCompleted(success: false)
        return
      }
      self.started(task)
    }
    if !ok {
      lock.lock(); pendingSubmit = false; lock.unlock()
      return false
    }

    let request = BGContinuedProcessingTaskRequest(identifier: identifier, title: title, subtitle: subtitle)
    request.strategy = .fail
    do {
      try BGTaskScheduler.shared.submit(request)
      return true
    } catch {
      // BGTaskScheduler.Error: .unavailable (Background App Refresh off),
      // .immediateRunIneligible (.fail strategy, no room now), .notPermitted.
      lock.lock(); pendingSubmit = false; lock.unlock()
      return false
    }
  }

  private func started(_ task: BGContinuedProcessingTask) {
    lock.lock()
    // end() ran between submit and launch, or a newer request superseded this
    // one: nothing wants this task any more.
    guard pendingSubmit, task.identifier == submittedIdentifier else {
      lock.unlock()
      task.setTaskCompleted(success: true)
      return
    }
    self.task = task
    pendingSubmit = false
    task.progress.totalUnitCount = max(total, 1)
    lock.unlock()

    // Complete before telling JS to stop its queue when the task expires.
    task.expirationHandler = { [weak self] in
      guard let self = self else { return }
      self.lock.lock()
      let current = self.task
      self.task = nil
      let callback = self.onExpired
      self.lock.unlock()
      current?.setTaskCompleted(success: false)
      callback?("expired")
    }
  }

  func setProgress(completed: Int64, total: Int64, subtitle: String?) {
    lock.lock()
    self.total = total
    guard let task = task else { lock.unlock(); return }
    task.progress.totalUnitCount = max(total, 1)
    task.progress.completedUnitCount = min(completed, max(total, 1))
    let title = self.title
    lock.unlock()
    if let subtitle = subtitle { task.updateTitle(title, subtitle: subtitle) }
  }

  func end(success: Bool) {
    lock.lock()
    let current = task
    task = nil
    pendingSubmit = false
    lock.unlock()
    guard let current = current else { return }
    if success { current.progress.completedUnitCount = current.progress.totalUnitCount }
    current.setTaskCompleted(success: success)
  }
}
