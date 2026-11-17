import Foundation

// Contrats et valeurs partagés par les transports natifs MIDI/OSC.
public enum ParameterValue: Equatable {
    case number(Double), text(String), boolean(Bool)
    public var display: String {
        switch self {
        case .number(let v): return v.isFinite ? String(format: "%.5g", v) : "—"
        case .text(let v): return v
        case .boolean(let v): return v ? "Actif" : "Inactif"
        }
    }
    // La position d’un anneau nécessite un domaine connu : pas de supposition 0...1.
    public func fraction(in range: ClosedRange<Double>?) -> Double? {
        guard case .number(let value) = self, value.isFinite, let range,
              range.lowerBound.isFinite, range.upperBound.isFinite, range.upperBound > range.lowerBound else { return nil }
        return min(1, max(0, (value - range.lowerBound) / (range.upperBound - range.lowerBound)))
    }
}
public struct FeedbackEvent {
    public let profileID: String
    public let address: String
    public let value: ParameterValue
    public init(profileID: String, address: String, value: ParameterValue) {
        self.profileID = profileID; self.address = address; self.value = value
    }
}
public protocol ParameterFeedbackSource: AnyObject {
    var onFeedback: ((FeedbackEvent) -> Void)? { get set }
    func start() throws
    func stop()
}
public protocol MIDIControlSource: AnyObject {
    // Ces octets devront être décodés selon le mode configuré du X-Touch Mini.
    var onMessage: (([UInt8]) -> Void)? { get set }
    func start() throws
    func stop()
}
// « confirmed » signifie confirmé au moment du retour OSC, jamais relu en continu.
public enum FeedbackFreshness: String { case unknown, confirmed, stale }
public struct FeedbackState {
    public private(set) var values: [String: ParameterValue] = [:]
    private var receivedAt: [String: TimeInterval] = [:]
    private var invalidated = Set<String>()
    // Délai de présentation conservateur, pas un timeout ni un heartbeat UDP.
    public static let recentInterval: TimeInterval = 5
    public init() {}
    public mutating func activateProfile() { self = FeedbackState() }
    public mutating func markStale() { invalidated.formUnion(values.keys) }
    public func freshness(for address: String, now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> FeedbackFreshness {
        guard values[address] != nil, let received = receivedAt[address] else { return .unknown }
        let age = now - received
        return !invalidated.contains(address) && age >= 0 && age < Self.recentInterval ? .confirmed : .stale
    }
    public mutating func receive(_ event: FeedbackEvent, activeProfile: Profile?, now: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        guard let p = activeProfile, event.profileID == p.id,
              p.allControls.contains(where: { $0.feedbackAddress == event.address }) else { return }
        if case .number(let number) = event.value, !number.isFinite { return }
        guard now.isFinite else { return }
        values[event.address] = event.value
        receivedAt[event.address] = now
        invalidated.remove(event.address)
    }
}

// Les adresses de retour identifient le profil destinataire, indépendamment de
// la fenêtre au premier plan. Le changement de vue ne détruit pas les retours.
public struct FeedbackBank {
    private var states: [String: FeedbackState] = [:]
    public init() {}
    public func state(for profile: Profile?) -> FeedbackState {
        guard let profile else { return FeedbackState() }
        return states[profile.id] ?? FeedbackState()
    }
    public mutating func reset() { states.removeAll() }
    public mutating func markStale(profileID: String? = nil) {
        for id in Array(states.keys) where profileID == nil || profileID == id { states[id]?.markStale() }
    }
    // Notification documentée, à distinguer des valeurs des contrôles mappés.
    // Ne suppose ni que le port global est configuré, ni que tous les paramètres suivront.
    @discardableResult public mutating func observeSnapshotRecall(address: String) -> Bool {
        guard address == "/GlobalSnapshots/Recalled" else { return false }
        markStale()
        return true
    }
    public mutating func receive(messages: [OSCMessage], profiles: [Profile], now: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        // Un rappel peut se trouver après les valeurs dans un bundle immédiat.
        if messages.contains(where: { $0.address == "/GlobalSnapshots/Recalled" }) {
            observeSnapshotRecall(address: "/GlobalSnapshots/Recalled")
        }
        for message in messages where message.values.count == 1 {
            receive(address: message.address, value: message.values[0], profiles: profiles, now: now)
        }
    }
    @discardableResult public mutating func receive(_ event: FeedbackEvent, profiles: [Profile], now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        guard let destination = profiles.first(where: { $0.id == event.profileID }),
              destination.allControls.contains(where: { $0.feedbackAddress == event.address }) else { return false }
        var state = states[destination.id] ?? FeedbackState()
        state.receive(event, activeProfile: destination, now: now)
        states[destination.id] = state
        return true
    }
    @discardableResult public mutating func receive(address: String, value: ParameterValue, profiles: [Profile], now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        let destinations = profiles.filter { $0.allControls.contains { $0.feedbackAddress == address } }
        // Une adresse partagée par plusieurs profils ne permet pas de choisir
        // un destinataire : conserver les valeurs précédentes sans deviner.
        guard destinations.count == 1, let destination = destinations.first else { return false }
        return receive(FeedbackEvent(profileID: destination.id, address: address, value: value), profiles: profiles, now: now)
    }
}
