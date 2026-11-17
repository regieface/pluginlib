// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "PluginLibController", platforms: [.macOS(.v13)], products: [
    .executable(name: "PluginLibController", targets: ["PluginLibController"])
], targets: [
    .target(name: "ControllerCore"),
    .executableTarget(name: "PluginLibController", dependencies: ["ControllerCore"]),
    .executableTarget(name: "ControllerChecks", dependencies: ["ControllerCore"])
])
