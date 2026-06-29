// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

// MARK: - SPM Dependencies
// This Package.swift lists external dependencies for the project.
// In an Xcode project, add these via File → Add Package Dependencies.

let package = Package(
    name: "RaveCloneDependencies",
    platforms: [
        .iOS(.v17),
    ],
    products: [],
    dependencies: [
        // Starscream — WebSocket client (native Swift)
        .package(url: "https://github.com/daltoniam/Starscream.git", from: "4.0.4"),

        // GoogleWebRTC — WebRTC for iOS (voice chat, peer-to-peer audio)
        .package(url: "https://github.com/webrtc-sdk/GoogleWebRTC.git", from: "114.0.0"),

        // Kingfisher — Image caching & async loading (better than raw AsyncImage)
        .package(url: "https://github.com/onevcat/Kingfisher.git", from: "7.0.0"),

        // Firebase iOS SDK (Auth, Firestore, Messaging)
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "10.0.0"),
    ],
    targets: [
        // No SPM targets — this package only manages dependencies.
        // The actual app target is configured in the .xcodeproj.
    ]
)
