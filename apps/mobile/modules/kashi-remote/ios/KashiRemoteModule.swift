import ExpoModulesCore
import MediaPlayer

/// Next and previous track from the lock screen, Control Center, AirPods and CarPlay. expo-audio owns play, pause
/// and seek and never touches these two commands, so enabling them here survives its lock screen updates.
public class KashiRemoteModule: Module {
  private var targets: [Any] = []

  public func definition() -> ModuleDefinition {
    Name("KashiRemote")

    Events("onNext", "onPrevious")

    Function("enable") {
      DispatchQueue.main.async { self.enable() }
    }

    Function("disable") {
      DispatchQueue.main.async { self.disable() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.disable() }
    }
  }

  private func enable() {
    guard targets.isEmpty else { return }
    let center = MPRemoteCommandCenter.shared()
    targets = [
      center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onNext")
        return .success
      },
      center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPrevious")
        return .success
      },
    ]
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
  }

  private func disable() {
    let center = MPRemoteCommandCenter.shared()
    if targets.count == 2 {
      center.nextTrackCommand.removeTarget(targets[0])
      center.previousTrackCommand.removeTarget(targets[1])
    }
    targets = []
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
  }
}
