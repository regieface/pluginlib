import AppKit
import ApplicationServices
import ControllerCore

enum VisualSelectionError: Error, LocalizedError {
    case unavailable(String)
    var errorDescription: String? { if case .unavailable(let text) = self { return text }; return nil }
}
typealias F6ClickPlan = WindowClickTarget
enum F6VisualSelection {
    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var raw: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &raw) == .success else { return nil }
        return raw
    }
    static func geometry(pid: pid_t, title: String) throws -> CGRect {
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.15)
        guard let window = (attribute(app, kAXWindowsAttribute) as? [AXUIElement])?.first else {
            throw VisualSelectionError.unavailable("Fenêtre F6 indisponible")
        }
        AXUIElementSetMessagingTimeout(window, 0.15)
        guard attribute(window, kAXMinimizedAttribute) as? Bool != true,
              attribute(window, kAXTitleAttribute) as? String == title,
              let position = attribute(window, kAXPositionAttribute), CFGetTypeID(position) == AXValueGetTypeID(),
              let size = attribute(window, kAXSizeAttribute), CFGetTypeID(size) == AXValueGetTypeID() else {
            throw VisualSelectionError.unavailable("F6 doit être au premier plan")
        }
        var origin = CGPoint.zero, dimensions = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &origin), AXValueGetValue(size as! AXValue, .cgSize, &dimensions) else {
            throw VisualSelectionError.unavailable("Coordonnées F6 indisponibles")
        }
        let frame = CGRect(origin: origin, size: dimensions)
        return frame
    }
    static func plan(pid: pid_t, band: Int, layout: BandSelectorLayout,
                     calibrations: [BandSelectorCalibration] = []) throws -> F6ClickPlan {
        let frame = try geometry(pid: pid, title: layout.windowTitle)
        // La référence historique est une mesure de fenêtre entière, pas de contenu.
        // Ne jamais extrapoler les marges LiveProfessor à partir de cette référence.
        let point = layout.measuredPoint(band: band, in: frame, calibrations: calibrations)
        guard let point else {
            throw VisualSelectionError.unavailable("F6 AX \(frame) : taille non calibrée ; calibrer les six sélecteurs (MIDI inchangé)")
        }
        return F6ClickPlan(pid: pid, title: layout.windowTitle, frame: frame, point: point)
    }
    static func diagnostic(_ plan: F6ClickPlan) -> String {
        "AX écran, origine haut gauche : fenêtre=\(plan.frame), point=\(plan.point), offset=(\(plan.point.x - plan.frame.minX), \(plan.point.y - plan.frame.minY))"
    }
    @MainActor static func validate(_ plan: F6ClickPlan) throws {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == plan.pid else {
            throw VisualSelectionError.unavailable("Synchronisation suspendue hors de LiveProfessor")
        }
        // Relire l’identité AX juste avant l’envoi : une autre fenêtre LP de
        // même taille ne doit pas être acceptée sur la seule géométrie CG.
        let app = AXUIElementCreateApplication(plan.pid)
        AXUIElementSetMessagingTimeout(app, 0.15)
        guard let window = (attribute(app, kAXWindowsAttribute) as? [AXUIElement])?.first else {
            throw VisualSelectionError.unavailable("Fenêtre cible indisponible")
        }
        AXUIElementSetMessagingTimeout(window, 0.15)
        guard attribute(window, kAXTitleAttribute) as? String == plan.title,
              attribute(window, kAXMinimizedAttribute) as? Bool != true else {
            throw VisualSelectionError.unavailable("La fenêtre cible a changé ou est masquée")
        }
        let freshFrame = try geometry(pid: plan.pid, title: plan.title)
        guard plan.matches(pid: plan.pid, title: plan.title, frame: freshFrame, visible: true) else {
            throw VisualSelectionError.unavailable("Géométrie AX modifiée pendant la préparation")
        }
        guard CGPreflightPostEventAccess() else { throw VisualSelectionError.unavailable("Accès aux clics macOS requis") }
        let modifiers: CGEventFlags = [.maskShift, .maskControl, .maskAlternate, .maskCommand]
        guard CGEventSource.flagsState(.combinedSessionState).intersection(modifiers).isEmpty,
              !CGEventSource.buttonState(.combinedSessionState, button: .left),
              !CGEventSource.buttonState(.combinedSessionState, button: .right) else {
            throw VisualSelectionError.unavailable("Sélection visuelle en pause pendant l’utilisation de la souris ou des modificateurs")
        }
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let hit = windows.first { window in
            guard (window[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let raw = window[kCGWindowBounds as String] as? NSDictionary,
                  let frame = CGRect(dictionaryRepresentation: raw) else { return false }
            return frame.contains(plan.point)
        }
        guard let hit, hit[kCGWindowOwnerPID as String] as? Int32 == plan.pid,
              let raw = hit[kCGWindowBounds as String] as? NSDictionary,
              let frame = CGRect(dictionaryRepresentation: raw),
              plan.matches(pid: plan.pid, title: plan.title, frame: frame, visible: true) else {
            throw VisualSelectionError.unavailable("Sélecteur F6 recouvert ou fenêtre déplacée pendant la préparation")
        }
    }
    @MainActor static func click(_ plan: F6ClickPlan) throws {
        try validate(plan)
        guard let original = CGEvent(source: nil)?.location,
              let source = CGEventSource(stateID: .privateState),
              let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: plan.point, mouseButton: .left),
              let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: plan.point, mouseButton: .left) else {
            throw VisualSelectionError.unavailable("Événement de sélection indisponible")
        }
        for event in [down, up] {
            event.flags = []
            // F6 utilise le double clic pour activer/désactiver une bande.
            event.setIntegerValueField(.mouseEventClickState, value: 1)
            event.post(tap: .cghidEventTap)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            guard !CGEventSource.buttonState(.combinedSessionState, button: .left),
                  let point = CGEvent(source: nil)?.location,
                  hypot(point.x - plan.point.x, point.y - plan.point.y) < 2 else { return }
            CGWarpMouseCursorPosition(original)
        }
    }
}
