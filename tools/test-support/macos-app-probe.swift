import AppKit
import CoreGraphics
import Foundation

// Inspect/quit only the exact process started by the installation smoke.
guard CommandLine.arguments.count == 4,
      let pid = Int32(CommandLine.arguments[2]),
      let app = NSRunningApplication(processIdentifier: pid),
      app.executableURL?.resolvingSymlinksInPath().path == URL(fileURLWithPath: CommandLine.arguments[3]).resolvingSymlinksInPath().path else {
    fputs("The owned application process is unavailable or has a different executable.\n", stderr)
    exit(1)
}

if CommandLine.arguments[1] == "quit" {
    exit(app.terminate() ? 0 : 1)
}

let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
let hasWindow = windows.contains { window in
    (window[kCGWindowOwnerPID as String] as? Int32) == pid
        && (window[kCGWindowLayer as String] as? Int) == 0
}
let status: [String: Any] = [
    "finishedLaunching": app.isFinishedLaunching,
    "hasWindow": hasWindow,
    "bundleIdentifier": app.bundleIdentifier ?? "",
]
let data = try JSONSerialization.data(withJSONObject: status, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
