import Foundation

// Assemble aussi les messages répartis entre paquets CoreMIDI, sans confondre
// une horloge temps réel ou le contenu d’un SysEx avec un changement de contrôle.
public struct MIDIStream {
    public struct EncoderMovement: Equatable {
        public let id: Int
        public let delta: Int
    }
    private var status: UInt8?
    private var data: [UInt8] = []
    private var sysex = false
    public init() {}
    public mutating func receive(_ bytes: [UInt8]) -> [[UInt8]] {
        var messages: [[UInt8]] = []
        for byte in bytes {
            if byte >= 0xF8 { continue }
            if byte >= 0x80 {
                data.removeAll()
                if byte == 0xF0 { sysex = true; status = nil; continue }
                sysex = false
                status = byte < 0xF0 ? byte : nil
                continue
            }
            guard !sysex, let status else { continue }
            data.append(byte)
            let size = [UInt8(0xC0), 0xD0].contains(status & 0xF0) ? 1 : 2
            if data.count == size { messages.append([status] + data); data.removeAll() }
        }
        return messages
    }
    public static func encoderMovement(_ message: [UInt8]) -> EncoderMovement? {
        guard message.count == 3, message[0] == 0xB0, (0x10...0x17).contains(message[1]), message[2] < 128 else { return nil }
        let magnitude = Int(message[2] & 0x3F)
        guard magnitude > 0 else { return nil }
        return EncoderMovement(id: Int(message[1] - 0x10) + 1, delta: message[2] & 0x40 == 0 ? magnitude : -magnitude)
    }
    public static func firstEncoderDelta(_ message: [UInt8]) -> Int? {
        guard let movement = encoderMovement(message), movement.id == 1 else { return nil }
        return movement.delta
    }
    public static func mappedEncoder(_ message: [UInt8], profile: Profile?) -> EncoderMovement? {
        guard let movement = encoderMovement(message), let profile,
              let control = profile.encoders.first(where: { $0.id == movement.id }),
              let binding = control.midi, binding.message == .controlChange,
              (1...16).contains(binding.channel), (0...127).contains(binding.number), binding.encoding == .relativeSignMagnitude else { return nil }
        return movement
    }
    public static func routedEncoder(_ message: [UInt8], profile: Profile?, bank: Int) -> [UInt8]? {
        guard let movement = encoderMovement(message), let profile,
              let binding = profile.encoders(for: bank).first(where: { $0.id == movement.id })?.midi,
              binding.message == .controlChange, binding.encoding == .relativeSignMagnitude,
              (1...16).contains(binding.channel), (0...127).contains(binding.number) else { return nil }
        return [0xB0 | UInt8(binding.channel - 1), UInt8(binding.number), message[2]]
    }
    public static func selectedBank(_ message: [UInt8], profile: Profile?) -> Int? {
        guard message.count == 3, message[0] & 0xF0 == 0x90, message[1] < 128,
              message[2] > 0, message[2] < 128, let profile else { return nil }
        return profile.buttons.first { control in
            guard let binding = control.midi else { return false }
            return binding.message == .note && binding.channel == Int(message[0] & 0x0F) + 1 && binding.number == Int(message[1])
        }?.selectBank
    }
}

// Diagnostic passif : aucune interprétation des pressions, aucun envoi MIDI.
public struct MIDICapture {
    public struct Event: Codable, Equatable {
        public let uptime: Double
        public let bytes: [UInt8]
    }
    public private(set) var events: [Event] = []
    public private(set) var total = 0
    public init() {}
    public mutating func record(_ message: [UInt8], uptime: Double) {
        total += 1
        events.append(Event(uptime: uptime, bytes: message))
        if events.count > 256 { events.removeFirst(events.count - 256) }
    }
}
