import AppKit
import ApplicationServices

struct ProbeResult {
    var status: String
    var orderedTitles: [String] = []
    var hostIsFrontmost = false
    var reason = "unspecified"
    var hostPID: pid_t?
    var frontmostPID: pid_t?
    var windowsAX: Int32?
    var titleAX: Int32?
    var focusedTitle = ""
    var focusedAX: Int32?
    var minimized = false
    var sampledAt: TimeInterval = 0
}
final class AccessibilityProbe: Sendable {
    static let hostID = "com.audiostrom.LiveProfessor2"
    static func trusted(prompt: Bool = false) -> Bool {
        if !prompt { return AXIsProcessTrusted() }
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }
    // Appelé sur une file utilitaire, jamais depuis un thread audio de l’hôte.
    func read(frontmostPID: pid_t?, hostPID: pid_t?) -> ProbeResult {
        var result = ProbeResult(status: "Lecture AX", hostPID: hostPID, frontmostPID: frontmostPID)
        func finish(_ reason: String, _ status: String) -> ProbeResult {
            var finished = result
            finished.reason = reason; finished.status = status
            finished.sampledAt = ProcessInfo.processInfo.systemUptime
            return finished
        }
        guard let pid = hostPID else { return finish("hostAbsent", "LiveProfessor n’est pas lancé") }
        guard frontmostPID == pid else { return finish("hostNotFrontmost", "En attente de LiveProfessor au premier plan") }
        result.hostIsFrontmost = true
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.2)
        var raw: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw)
        result.windowsAX = error.rawValue
        guard error == .success, let windows = raw as? [AXUIElement] else {
            return finish("windowsReadFailed", "Lecture AXWindows refusée/invalide (AX \(error.rawValue))")
        }
        // Diagnostic seulement : ne jamais choisir une ancienne fenêtre reconnue
        // derrière la première. Le focus est tracé pour expliquer les désaccords.
        var focused: CFTypeRef?
        let focusError = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focused)
        result.focusedAX = focusError.rawValue
        if focusError == .success, let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() {
            let element = focused as! AXUIElement
            AXUIElementSetMessagingTimeout(element, 0.15)
            var title: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &title) == .success {
                result.focusedTitle = title as? String ?? ""
            }
        }
        guard let window = windows.first else { return finish("windowsEmpty", "AXWindows vide") }
        AXUIElementSetMessagingTimeout(window, 0.15)
        var title: CFTypeRef?
        let titleError = AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title)
        result.titleAX = titleError.rawValue
        guard titleError == .success, let text = title as? String else {
            return finish("titleReadFailed", "Lecture du premier titre AX impossible (AX \(titleError.rawValue))")
        }
        result.orderedTitles = [text]
        var minimized: CFTypeRef?
        if AXUIElementCopyAttributeValue(window, kAXMinimizedAttribute as CFString, &minimized) == .success {
            result.minimized = minimized as? Bool ?? false
        }
        if result.minimized { return finish("windowMinimized", "Fenêtre AX minimisée") }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return finish("titleEmpty", "Premier titre AX vide")
        }
        return finish("windowRead", "Lecture AXWindows · première fenêtre")
    }
    // Diagnostic explicite uniquement : aucune action AX, aucun transport.
    // Les limites et erreurs restent visibles pour ne pas conclure sur un arbre partiel.
    func inspectF6Values(frontmostPID: pid_t?, hostPID: pid_t?) -> String {
        let result = read(frontmostPID: frontmostPID, hostPID: hostPID)
        var lines = ["AX F6 read-only · trusted=\(Self.trusted()) · hostPID=\(hostPID ?? -1)",
                     "reason=\(result.reason) · windowsAX=\(result.windowsAX ?? -1) · title=\(result.orderedTitles.first ?? "—")"]
        guard result.reason == "windowRead", result.orderedTitles.first == "F6 (m)UI", let pid = hostPID else {
            return (lines + ["Relevé impossible : cible mono non confirmée ; aucune conclusion sur ses valeurs."]).joined(separator: "\n")
        }
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.2)
        var raw: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw)
        guard error == .success, let window = (raw as? [AXUIElement])?.first else {
            return (lines + ["Nouvelle lecture AXWindows impossible : \(error.rawValue)"]).joined(separator: "\n")
        }
        var title: CFTypeRef?
        guard AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title) == .success,
              title as? String == "F6 (m)UI" else {
            return (lines + ["Cible changée pendant le relevé."]).joined(separator: "\n")
        }
        var seen: [AXUIElement] = []
        let deadline = ProcessInfo.processInfo.systemUptime + 10
        func visit(_ element: AXUIElement, depth: Int) {
            guard !seen.contains(where: { CFEqual($0, element) }) else { return }
            guard depth <= 20, seen.count < 500, ProcessInfo.processInfo.systemUptime < deadline else {
                lines.append("TRONQUÉ : limite de profondeur, nombre ou durée ; résultat incomplet")
                return
            }
            seen.append(element)
            AXUIElementSetMessagingTimeout(element, 0.15)
            let prefix = String(repeating: "  ", count: depth)
            var names: CFArray?
            let namesError = AXUIElementCopyAttributeNames(element, &names)
            lines.append("\(prefix)node \(seen.count) attributesAX=\(namesError.rawValue) names=\(names as? [String] ?? [])")
            for name in ["AXRole", "AXSubrole", "AXTitle", "AXDescription", "AXHelp", "AXIdentifier", "AXValue", "AXValueDescription", "AXMinValue", "AXMaxValue"] {
                var value: CFTypeRef?
                let status = AXUIElementCopyAttributeValue(element, name as CFString, &value)
                lines.append("\(prefix)\(name) [\(status.rawValue)] = \(value.map { String(describing: $0) } ?? "—")")
            }
            for name in ["AXChildren", "AXContents", "AXVisibleChildren"] {
                var children: CFTypeRef?
                let status = AXUIElementCopyAttributeValue(element, name as CFString, &children)
                let elements = children as? [AXUIElement] ?? []
                lines.append("\(prefix)\(name) [\(status.rawValue)] count=\(elements.count)")
                for child in elements { visit(child, depth: depth + 1) }
            }
        }
        visit(window, depth: 0)
        lines.append("Aucune valeur n’est inférée depuis une position ou un dernier retour OSC. Comparer manuellement les attributs aux affichages F6 ; absence/erreur ne vaut pas zéro.")
        return lines.joined(separator: "\n")
    }

}
