import AppKit
// Original system-font titles. The 160px top/bottom bands keep native footage at 83% of frame height.
let args = CommandLine.arguments
let destination = args[1]
try FileManager.default.createDirectory(atPath: destination, withIntermediateDirectories: true)
func save(_ name: String, draw: () -> Void) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1080, pixelsHigh: 1920, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    draw()
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination + "/" + name + ".png"))
}
func text(_ value: String, _ x: CGFloat, _ top: CGFloat, _ size: CGFloat, _ color: NSColor, _ weight: NSFont.Weight) {
    let font = NSFont.systemFont(ofSize: size, weight: weight)
    (value as NSString).draw(at: NSPoint(x: x, y: 1920-top-size*1.25), withAttributes: [.font: font, .foregroundColor: color])
}
let ink = NSColor(calibratedRed: 0.94, green: 0.98, blue: 1, alpha: 1)
let cyan = NSColor(calibratedRed: 0.42, green: 0.85, blue: 1, alpha: 1)
save("background") {
    NSGradient(starting: NSColor(calibratedRed: 0.025, green: 0.05, blue: 0.09, alpha: 1), ending: NSColor(calibratedRed: 0.07, green: 0.15, blue: 0.2, alpha: 1))!.draw(in: NSRect(x: 0, y: 0, width: 1080, height: 1920), angle: 70)
}
for (name, kicker, title, subtitle, titleSize) in [
    ("welcome", "FPGA DEVELOPMENT ENVIRONMENT", "ALLORA FPGA", "From logic to life.", CGFloat(66)),
    ("simulate", "REAL RTL · LIVE HARDWARE", "SIMULATE", "Switch → signal → light", CGFloat(66)),
    ("waveform", "LIVE SIGNAL HISTORY", "SEE THE RESPONSE", "Every edge. Every output.", CGFloat(57)),
    ("build", "OPEN-SOURCE TOOLCHAIN", "BUILD", "RTL → synthesized hardware", CGFloat(66)),
    ("end", "ALLORA FPGA", "SIMULATE. BUILD.", "Program on your board.", CGFloat(62)),
    ("dff-editor", "ICEBREAKER · SYSTEMVERILOG", "WRITE THE DFF", "One register. Async reset.", CGFloat(66)),
    ("dff-synthesis", "REAL YOSYS OUTPUT", "SYNTHESIZE", "Inspect the generated logic.", CGFloat(66)),
    ("dff-pins", "ICEBREAKER · SG48", "MAP THE PINS", "Clock · reset · D · Q", CGFloat(66)),
    ("dff-bitstream", "YOSYS · NEXTPNR · ICEPACK", "BUILD BITSTREAM", "Ready for the programmer.", CGFloat(60)),
    ("dff-program", "ICEPROG · ICEBREAKER", "PROGRAM", "Connect the board to flash.", CGFloat(66))
] {
    save(name) {
        text(kicker, 48, 21, 23, cyan, .bold)
        text(title, 44, 55, titleSize, ink, .heavy)
        text(subtitle, 48, 1810, 35, ink, .bold)
        NSColor(calibratedRed: 0.37, green: 0.79, blue: 0.96, alpha: 0.8).setFill()
        NSRect(x: 48, y: 1920-1784, width: 984, height: 2).fill()
    }
}
