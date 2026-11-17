import Foundation

// Contrat observé F6 (m) AU : B16 note 95 canal 1, 0 désactivé / 1 activé.
public struct F6BandBypass {
    public struct Command: Equatable {
        public let band: Int
        public let enabled: Bool
        public var address: String { F6BandBypass.address(band) }
        public var packet: Data {
            func string(_ s: String) -> [UInt8] {
                var b = Array(s.utf8) + [0]
                while b.count % 4 != 0 { b.append(0) }
                return b
            }
            let bits = Float(enabled ? 1 : 0).bitPattern
            return Data(string(address) + string(",f") + [UInt8(bits >> 24), UInt8((bits >> 16) & 255), UInt8((bits >> 8) & 255), UInt8(bits & 255)])
        }
    }
    private struct State { let enabled: Bool; let time: TimeInterval; var stale = false }
    private var states: [Int: State] = [:]
    private var pending: [Int: Bool] = [:]
    // Après démarrage/reconnexion, un relâchement est requis pour armer B16.
    private var held = true
    public init() {}
    public static func address(_ band: Int) -> String { "/pluginlib/diagnostic/f6/band\(band)/onoff" }
    public static func isButton(_ message: [UInt8]) -> Bool {
        message.count == 3 && message[1] == 95 && (message[0] == 0x90 || message[0] == 0x80)
    }
    public mutating func invalidate(reconnect: Bool = false) {
        for band in Array(states.keys) { states[band]?.stale = true }
        pending.removeAll()
        if reconnect { held = true }
    }
    public mutating func clear() { states.removeAll(); pending.removeAll(); held = true }
    public mutating func receive(_ messages: [OSCMessage], now: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        if messages.contains(where: { $0.address == "/GlobalSnapshots/Recalled" }) { invalidate() }
        for message in messages {
            guard let band = (1...6).first(where: { Self.address($0) == message.address }) else { continue }
            guard message.values.count == 1, case .number(let value) = message.values[0], value == 0 || value == 1, now.isFinite else {
                states[band]?.stale = true
                continue
            }
            states[band] = State(enabled: value == 1, time: now)
            if pending[band] == (value == 1) { pending.removeValue(forKey: band) }
        }
    }
    public func label(band: Int, now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> String {
        guard let state = states[band] else { return "État inconnu" }
        if pending[band] != nil { return "Commande émise · attente OSC" }
        guard !state.stale, now >= state.time, now - state.time < FeedbackState.recentInterval else { return "État périmé" }
        return state.enabled ? "Activée" : "Désactivée"
    }
    public mutating func press(_ message: [UInt8], band: Int, allowed: Bool, now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Command? {
        guard Self.isButton(message) else { return nil }
        if message[0] == 0x80 || message[2] == 0 { held = false; return nil }
        guard message == [0x90, 95, 127] else { held = true; return nil }
        let wasHeld = held; held = true
        guard !wasHeld, allowed, (1...6).contains(band), pending[band] == nil,
              let state = states[band], !state.stale, now >= state.time,
              now - state.time < FeedbackState.recentInterval else { return nil }
        pending[band] = !state.enabled
        return Command(band: band, enabled: !state.enabled)
    }
}
