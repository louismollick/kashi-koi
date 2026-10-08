Pod::Spec.new do |s|
  s.name = 'KashiJapanese'
  s.version = '1.0.0'
  s.summary = 'On-device Japanese translation and furigana'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Kashi-Koi'
  s.homepage = 'https://github.com/louismollick/kashi-koi'
  s.platforms = { :ios => '26.0' }
  s.source = { :git => s.homepage }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Translation', 'SwiftUI', 'CoreFoundation'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
