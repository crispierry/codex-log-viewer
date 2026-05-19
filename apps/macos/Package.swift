// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "CodexLogViewerMac",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .executable(name: "CodexLogViewerMac", targets: ["CodexLogViewerMac"])
  ],
  targets: [
    .executableTarget(name: "CodexLogViewerMac")
  ]
)
