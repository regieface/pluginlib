import AppKit

@MainActor private final class VisualClickTarget: NSObject {
    var count = 0
    var clickCount = 0
    @objc func click(_ sender: Any?) {
        count += 1
        clickCount = NSApp.currentEvent?.clickCount ?? 0
    }
}

// Utilise uniquement une fenêtre auxiliaire propre au processus de test.
@MainActor func visualSelectionCheck() {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let target = VisualClickTarget()
    let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 260, height: 130), styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "PluginLib · test du clic simple"
    window.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 20)
    let button = NSButton(title: "Sélecteur de test", target: target, action: #selector(VisualClickTarget.click(_:)))
    button.frame = NSRect(x: 40, y: 40, width: 160, height: 35)
    window.contentView!.addSubview(button)
    window.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        let cocoa = window.convertPoint(toScreen: button.convert(NSPoint(x: 80, y: 17), to: nil))
        let top = NSScreen.screens[0].frame.maxY
        let point = CGPoint(x: cocoa.x, y: top - cocoa.y)
        let frame = CGRect(x: window.frame.minX, y: top - window.frame.maxY, width: window.frame.width, height: window.frame.height)
        do { try F6VisualSelection.click(F6ClickPlan(pid: getpid(), title: window.title, frame: frame, point: point)) }
        catch { print("ÉCHEC clic visuel : \(error.localizedDescription)"); fflush(stdout); exit(1) }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        let passed = target.count == 1 && target.clickCount == 1
        print(passed ? "Sélection visuelle : clic simple reçu par le bouton de test, sans double clic, OK." : "ÉCHEC sélection visuelle : \(target.count) actions, clickCount \(target.clickCount)")
        fflush(stdout); exit(passed ? 0 : 1)
    }
    app.run()
}
