// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BranchTimelineMac",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "BranchTimelineMac", targets: ["BranchTimelineMac"])],
    targets: [
        .target(name: "TimelineCore", resources: [.process("Resources")]),
        .executableTarget(name: "BranchTimelineMac", dependencies: ["TimelineCore"]),
        .executableTarget(name: "CoreChecks", dependencies: ["TimelineCore"], path: "Tests/TimelineCoreTests")
    ]
)
