import AppKit
import SwiftUI
import ControllerCore

final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var panel: FloatingPanel!
    var model: ControllerModel!
    var item: NSStatusItem!
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let smoke = CommandLine.arguments.contains("--smoke-test")
        model = ControllerModel(demo: CommandLine.arguments.contains("--demo") || smoke)
        panel = FloatingPanel(contentRect: NSRect(x: 100, y: 100, width: 880, height: 210), styleMask: [.titled, .closable, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "PluginLib Controller"
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = .windowBackgroundColor
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.contentView = NSHostingView(rootView: ControllerView(model: model))
        let restored = !smoke && panel.setFrameUsingName("PluginLibController.panel")
        if !smoke { panel.setFrameAutosaveName("PluginLibController.panel") }
        model.onModeChange = { [weak self] compact in self?.resize(compact: compact) }
        model.onPlace = { [weak self] index in self?.place(on: index) }
        resize(compact: model.compact, resetSize: !restored)
        if !smoke && !UserDefaults.standard.bool(forKey: "controller.placed") { place(on: max(0, NSScreen.screens.count - 1)); UserDefaults.standard.set(true, forKey: "controller.placed") }
        recoverOffscreenWindow()
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "PLC"
        let menu = NSMenu()
        menu.addItem(withTitle: "Afficher le Controller", action: #selector(showPanel), keyEquivalent: "")
        menu.addItem(withTitle: "Quitter", action: #selector(quit), keyEquivalent: "q")
        menu.items.forEach { $0.target = self }; item.menu = menu
        panel.orderFrontRegardless()
        model.start()
        if smoke { DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.smokeTest() } }
    }
    func resize(compact: Bool, resetSize: Bool = true) {
        panel.contentMinSize = NSSize(width: compact ? 640 : 760, height: compact ? 190 : 370)
        var frame = panel.frame
        if resetSize {
            frame.size.height = compact ? 235 : 435
            frame.size.width = max(frame.width, compact ? 760 : 880)
        }
        panel.setFrame(frame, display: true)
        recoverOffscreenWindow()
    }
    func place(on index: Int) {
        guard NSScreen.screens.indices.contains(index) else { return }
        let visible = NSScreen.screens[index].visibleFrame
        var frame = panel.frame
        frame.size.width = min(frame.width, visible.width)
        frame.size.height = min(frame.height, visible.height)
        frame.origin = NSPoint(x: visible.midX - frame.width / 2, y: visible.minY + 12)
        panel.setFrame(frame, display: true)
    }
    func recoverOffscreenWindow() {
        guard let screen = NSScreen.screens.first(where: { $0.visibleFrame.intersects(panel.frame) }) else { place(on: 0); return }
        var frame = panel.frame; let area = screen.visibleFrame
        frame.size.width = min(frame.width, area.width); frame.size.height = min(frame.height, area.height)
        frame.origin.x = max(area.minX, min(frame.minX, area.maxX - frame.width))
        frame.origin.y = max(area.minY, min(frame.minY, area.maxY - frame.height))
        panel.setFrame(frame, display: true)
    }
    func smokeCheck(_ condition: Bool, _ description: String) {
        guard condition else { print("ÉCHEC fenêtre native : " + description); fflush(stdout); exit(1) }
    }
    func smokeTest() {
        smokeCheck(model.pollCount >= 3, "rafraîchissement périodique : \(model.pollCount) lectures au lieu d’au moins 3")
        smokeCheck(panel.isVisible && panel.level.rawValue > NSWindow.Level.floating.rawValue, "visibilité / niveau flottant : \(panel.isVisible), \(panel.level.rawValue)")
        smokeCheck(!panel.hidesOnDeactivate && panel.styleMask.contains(.nonactivatingPanel), "non activation")
        smokeCheck(panel.styleMask.contains(.resizable), "redimensionnement")
        smokeCheck(model.profiles.count == 2 && model.profile != nil, "chargement profils : \(model.profileError ?? "sans erreur")")
        if let index = model.profiles.firstIndex(where: { $0.id == "waves-f6" }) {
            model.selectDemo(index)
            let control = model.profiles[index].encoders[0]
            model.acceptFeedback(FeedbackEvent(profileID: "waves-f6", address: "/pluginlib/waves-f6/e1", value: .number(0.66571)))
            smokeCheck(model.value(control) == "+6,0 dB", "retour OSC F6 formaté avec unité")
            if let other = model.profiles.indices.first(where: { $0 != index }) {
                model.selectDemo(other)
                model.acceptFeedback(FeedbackEvent(profileID: "waves-f6", address: "/pluginlib/waves-f6/e1", value: .number(0.33429)))
                smokeCheck(model.value(model.profiles[other].encoders[0]) == "—", "isolation des valeurs entre plugins")
                model.selectDemo(index)
                smokeCheck(model.value(control) == "-6,0 dB", "valeur OSC reçue en arrière-plan conservée au retour sur F6")
                model.selectDemo(index)
                smokeCheck(model.value(control) == "-6,0 dB", "réaffichage du même profil conserve sa valeur")
                model.selectBank(2)
                smokeCheck(model.activeEncoders.first?.name == "Band 2 Gain" && model.activeAccentColor == "#B6D84B", "noms et couleur de Band 2")
                model.acceptFeedback(FeedbackEvent(profileID: "waves-f6", address: "/pluginlib/waves-f6/band2/e1", value: .number(0.66571)))
                smokeCheck(model.value(model.activeEncoders[0]) == "+6,0 dB", "valeur propre à Band 2")
                model.selectBank(1)
                smokeCheck(model.activeEncoders.first?.name == "Band 1 Gain" && model.value(model.activeEncoders[0]) == "-6,0 dB", "retour Band 1 sans mélange de valeurs")
                model.selectBank(2); model.selectDemo(other); model.selectDemo(index)
                smokeCheck(model.selectedBank == 2 && model.value(model.activeEncoders[0]) == "+6,0 dB", "banque et valeur conservées après changement de plugin")
            }
        }
        let preference = UserDefaults.standard.object(forKey: "controller.compact")
        model.setCompact(false)
        smokeCheck(!model.compact && panel.contentMinSize.height == 370, "mode complet : \(panel.contentMinSize)")
        model.setCompact(true)
        smokeCheck(model.compact && panel.contentMinSize.height == 190, "mode compact : \(panel.contentMinSize)")
        if let preference { UserDefaults.standard.set(preference, forKey: "controller.compact") }
        else { UserDefaults.standard.removeObject(forKey: "controller.compact") }
        if let screen = NSScreen.screens.first { place(on: 0); smokeCheck(panel.frame.minY >= screen.visibleFrame.minY, "placement écran") }
        panel.orderOut(nil); model.stop()
        let previousPollCount = model.pollCount
        _ = applicationShouldHandleReopen(NSApp, hasVisibleWindows: false)
        smokeCheck(panel.isVisible && model.pollCount > previousPollCount, "réouverture après masquage et reprise de la détection")
        print("Fenêtre native : rafraîchissement, deux modes, unités dB, retour sur F6 avec valeur OSC conservée, placement et réouverture OK.")
        fflush(stdout)
        NSApp.terminate(nil)
    }
    @objc func showPanel() { recoverOffscreenWindow(); panel.orderFrontRegardless(); model.start() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showPanel()
        return false
    }
    @objc func quit() { NSApp.terminate(nil) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { panel.orderOut(nil); model.stop(); return false }
    func applicationWillTerminate(_ notification: Notification) { model.stop() }
}
MainActor.assumeIsolated {
let app = NSApplication.shared
if CommandLine.arguments.contains("--visual-click-check") { visualSelectionCheck(); exit(1) }
if CommandLine.arguments.contains("--activation-check") {
    let passed = ControllerModel(demo: false).checkActivationLifecycle()
    print(passed ? "Activation : profil et banque mémorisés lors des pertes transitoires, routage suspendu, anciens sondages ignorés, retour OSC et purge à l’arrêt OK." : "ÉCHEC cycle d’activation / retour OSC")
    exit(passed ? 0 : 1)
}
if CommandLine.arguments.contains("--f6-osc-command-check") { exit(f6OSCCommandChecks() ? 0 : 1) }
if CommandLine.arguments.contains("--transport-checks") { exit(transportChecks() ? 0 : 1) }
if CommandLine.arguments.contains("--midi-probe") {
    let receiver = MIDIReceiver()
    receiver.onStatus = { print($0) }
    receiver.onBytes = { print($0.map { String(format: "%02X", $0) }.joined(separator: " ")) }
    receiver.start()
    RunLoop.current.run(until: Date().addingTimeInterval(2))
    receiver.stop()
    exit(0)
}
if CommandLine.arguments.contains("--probe-ax-values") {
    let host = NSRunningApplication.runningApplications(withBundleIdentifier: AccessibilityProbe.hostID).first?.processIdentifier
    print(AccessibilityProbe().inspectF6Values(frontmostPID: NSWorkspace.shared.frontmostApplication?.processIdentifier, hostPID: host))
    exit(0)
}
if CommandLine.arguments.contains("--probe") {
    let host = NSRunningApplication.runningApplications(withBundleIdentifier: AccessibilityProbe.hostID).first?.processIdentifier
    let result = AccessibilityProbe().read(frontmostPID: NSWorkspace.shared.frontmostApplication?.processIdentifier, hostPID: host)
    print(result.status)
    print("Première fenêtre AX : \(result.orderedTitles.first ?? "—")")
    exit(0)
}
let delegate = AppDelegate()
app.delegate = delegate
app.run()

}
