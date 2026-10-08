import ExpoModulesCore
import CoreFoundation
import SwiftUI
import Translation
import UIKit

private let japanese = Locale.Language(identifier: "ja")
private let english = Locale.Language(identifier: "en")

/** Own one installed-language session; the download view uses a separate UI session. */
public class KashiJapaneseModule: Module {
  private var session: TranslationSession?
  private var download: UIHostingController<DownloadView>?

  public func definition() -> ModuleDefinition {
    Name("KashiJapanese")
    AsyncFunction("translationStatus") { () async -> String in
      await self.status()
    }
    AsyncFunction("prepareTranslation") { () async throws -> String in
      #if targetEnvironment(simulator)
      return "installed"
      #else
      return await self.prepare()
      #endif
    }
    AsyncFunction("translate") { (texts: [String]) async throws -> [String] in
      #if targetEnvironment(simulator)
      return texts.map { "EN: " + $0 }
      #else
      return try await self.translate(texts)
      #endif
    }
    AsyncFunction("tokenize") { (texts: [String]) -> [[[String: String]]] in
      texts.map(self.tokenize)
    }
  }

  private func status() async -> String {
    #if targetEnvironment(simulator)
    return "installed"
    #else
    switch await LanguageAvailability().status(from: japanese, to: english) {
    case .installed: return "installed"
    case .supported: return "supported"
    default: return "unsupported"
    }
    #endif
  }

  @MainActor private func translate(_ texts: [String]) async throws -> [String] {
    if session == nil { session = TranslationSession(installedSource: japanese, target: english) }
    let requests = texts.enumerated().map { TranslationSession.Request(sourceText: $0.element, clientIdentifier: String($0.offset)) }
    let responses = try await session!.translations(from: requests)
    let byIndex = Dictionary(uniqueKeysWithValues: responses.compactMap { response in
      response.clientIdentifier.map { ($0, response.targetText) }
    })
    return try requests.map { request in
      guard let text = byIndex[request.clientIdentifier!] else {
        throw NSError(domain: "KashiJapanese", code: 2, userInfo: [NSLocalizedDescriptionKey: "Incomplete translation batch"])
      }
      return text
    }
  }

  @MainActor private func prepare() async -> String {
    guard download == nil, let presenter = appContext?.utilities?.currentViewController(),
          presenter.presentedViewController == nil, presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingPresented, !presenter.isBeingDismissed else { return await status() }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      var completed = false
      let finish: @MainActor () -> Void = { [weak self] in
        guard !completed else { return }
        completed = true
        let host = self?.download
        self?.download = nil
        host?.dismiss(animated: false)
        continuation.resume()
      }
      let host = UIHostingController(rootView: DownloadView(finished: finish))
      host.modalPresentationStyle = .overFullScreen
      host.view.backgroundColor = .clear
      download = host
      presenter.present(host, animated: false) {
        if host.presentingViewController == nil { finish() }
      }
      if presenter.presentedViewController !== host { finish() }
    }
    return await status()
  }

  /** Keep punctuation and whitespace so token surfaces reconstruct the exact input. */
  private func tokenize(_ text: String) -> [[String: String]] {
    let source = text as NSString
    let tokenizer = CFStringTokenizerCreate(nil, text as CFString, CFRange(location: 0, length: source.length), kCFStringTokenizerUnitWord, Locale(identifier: "ja") as CFLocale)
    var result: [[String: String]] = [], offset = 0
    while CFStringTokenizerAdvanceToNextToken(tokenizer).rawValue != 0 {
      let range = CFStringTokenizerGetCurrentTokenRange(tokenizer)
      if range.location > offset { result.append(["surface": source.substring(with: NSRange(location: offset, length: range.location - offset))]) }
      let surface = source.substring(with: NSRange(location: range.location, length: range.length))
      var token = ["surface": surface]
      if surface.range(of: "[\\p{Han}々〆]", options: .regularExpression) != nil,
         let latin = CFStringTokenizerCopyCurrentTokenAttribute(tokenizer, kCFStringTokenizerAttributeLatinTranscription) as? String {
        let reading = NSMutableString(string: latin)
        CFStringTransform(reading, nil, kCFStringTransformLatinHiragana, false)
        token["reading"] = reading as String
      }
      result.append(token)
      offset = range.location + range.length
    }
    if offset < source.length { result.append(["surface": source.substring(from: offset)]) }
    return result
  }
}

/** Complete on translation finish or host disappearance; both may fire for one prompt. */
private struct DownloadView: View {
  let finished: @MainActor () -> Void
  var body: some View {
    Color.clear.translationTask(TranslationSession.Configuration(source: japanese, target: english)) { session in
      do { try await session.prepareTranslation() } catch { /* Recheck availability after dismissal or failure. */ }
      finished()
    }.onDisappear(perform: finished)
  }
}
