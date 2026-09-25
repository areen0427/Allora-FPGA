import Foundation
import AppKit
import ScreenCaptureKit
import AVFoundation

@available(macOS 15.0, *)
final class Recorder: NSObject, SCRecordingOutputDelegate {
    var started = false
    var finished = false
    var failure: Error?
    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        started = true
        print("RECORDING")
        fflush(stdout)
    }
    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) { finished = true }
    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) { failure = error }
}

@main struct Capture {
    @MainActor static func main() async {
        _ = NSApplication.shared
        do {
            guard #available(macOS 15.0, *) else { throw fail("Capture requires macOS 15 or newer") }
            let args = CommandLine.arguments
            guard args.count >= 2 else { throw fail("Usage: capture --check | <exact-window-title> <output.mp4> <stop-file>") }
            guard CGPreflightScreenCaptureAccess() else {
                _ = CGRequestScreenCaptureAccess()
                throw fail("SCREEN_RECORDING_PERMISSION_REQUIRED: In System Settings > Privacy & Security > Screen & System Audio Recording, enable the launching app (Codex when launched here, Terminal when launched there), or Allora Capture if macOS lists the helper. Quit and reopen that app, then rerun. No Accessibility permission is needed.")
            }
            if args[1] == "--check" { print("Screen recording permission granted"); return }
            guard args.count == 4 else { throw fail("Expected title, output and stop-file") }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
            let matches = content.windows.filter { $0.title == args[1] && $0.windowLayer == 0 }
            guard matches.count == 1, let window = matches.first else {
                throw fail("Expected one window named \(args[1]); found \(matches.count)")
            }
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let config = SCStreamConfiguration()
            config.width = Int(window.frame.width * 2) / 2 * 2
            config.height = Int(window.frame.height * 2) / 2 * 2
            config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
            config.queueDepth = 6
            config.showsCursor = false
            config.capturesAudio = false
            config.ignoreShadowsSingleWindow = true
            config.shouldBeOpaque = true
            let recorder = Recorder()
            let outputConfig = SCRecordingOutputConfiguration()
            outputConfig.outputURL = URL(fileURLWithPath: args[2])
            outputConfig.videoCodecType = .h264
            outputConfig.outputFileType = .mp4
            let output = SCRecordingOutput(configuration: outputConfig, delegate: recorder)
            let stream = SCStream(filter: filter, configuration: config, delegate: nil)
            try stream.addRecordingOutput(output)
            try await stream.startCapture()
            let deadline = Date().addingTimeInterval(180)
            while !FileManager.default.fileExists(atPath: args[3]) {
                if let error = recorder.failure { throw error }
                if Date() > deadline { throw fail("Capture watchdog reached 180 seconds") }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            try await stream.stopCapture()
            let finishDeadline = Date().addingTimeInterval(15)
            while !recorder.finished {
                if let error = recorder.failure { throw error }
                if Date() > finishDeadline { throw fail("Recording did not finalize") }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            print("SAVED \(args[2])")
        } catch {
            FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
    static func fail(_ text: String) -> NSError { NSError(domain: "AlloraCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}
