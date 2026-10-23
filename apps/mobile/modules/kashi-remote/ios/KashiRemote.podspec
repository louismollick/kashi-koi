Pod::Spec.new do |s|
  s.name = 'KashiRemote'
  s.version = '1.0.0'
  s.summary = 'Next and previous track remote commands'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Kashi-Koi'
  s.homepage = 'https://github.com/louismollick/kashi-koi'
  s.platforms = { :ios => '26.0' }
  s.source = { :git => s.homepage }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
