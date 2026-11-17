import Foundation
import CoreMIDI
import Darwin

// Aucun message envoyé au matériel. La source virtuelle ne reçoit que les
// messages explicitement transmis par le modèle, après vérification du profil.
@MainActor final class MIDIReceiver {
    var onStatus: ((String) -> Void)?
    var onBytes: (([UInt8]) -> Void)?
    private var client: MIDIClientRef = 0
    private var port: MIDIPortRef = 0
    private var virtualSource: MIDIEndpointRef = 0
    private(set) var bridgeAvailable = false
    private var sources: Set<MIDIEndpointRef> = []
    private var generation = UUID()
    private let sourceName: String
    init(sourceName: String = "PluginLib Controller E1") { self.sourceName = sourceName }

    func start() {
        guard client == 0 else { return }
        let result = MIDIClientCreateWithBlock("PluginLib Controller · réception" as CFString, &client) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        guard result == noErr else { onStatus?("MIDI indisponible (\(result))"); return }
        let generation = self.generation
        let inputResult = MIDIInputPortCreateWithBlock(client, "X-Touch Mini · entrée" as CFString, &port) { [weak self] list, _ in
            var bytes: [UInt8] = []
            let offset = MemoryLayout<MIDIPacketList>.offset(of: \MIDIPacketList.packet)!
            var packet = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
            for _ in 0..<list.pointee.numPackets {
                let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!
                let data = UnsafeRawPointer(packet).advanced(by: dataOffset).assumingMemoryBound(to: UInt8.self)
                bytes += Array(UnsafeBufferPointer(start: data, count: Int(packet.pointee.length)))
                packet = UnsafePointer(MIDIPacketNext(packet))
            }
            guard !bytes.isEmpty else { return }
            let received = bytes
            Task { @MainActor in
                guard let self, self.generation == generation else { return }
                self.onBytes?(received)
            }
        }
        guard inputResult == noErr else { stop(); onStatus?("Entrée MIDI indisponible (\(inputResult))"); return }
        bridgeAvailable = MIDISourceCreate(client, sourceName as CFString, &virtualSource) == noErr
        if bridgeAvailable { MIDIObjectSetStringProperty(virtualSource, kMIDIPropertyDisplayName, sourceName as CFString) }
        if bridgeAvailable, sourceName == "PluginLib Controller E1" {
            let key = "controller.midiSourceID"
            if let saved = UserDefaults.standard.object(forKey: key) as? NSNumber {
                if MIDIObjectSetIntegerProperty(virtualSource, kMIDIPropertyUniqueID, saved.int32Value) != noErr {
                    MIDIEndpointDispose(virtualSource); virtualSource = 0; bridgeAvailable = false
                }
            } else {
                var identifier: Int32 = 0
                if MIDIObjectGetIntegerProperty(virtualSource, kMIDIPropertyUniqueID, &identifier) == noErr {
                    UserDefaults.standard.set(Int(identifier), forKey: key)
                }
            }
        }
        refresh()
    }

    private func refresh() {
        guard port != 0 else { return }
        var available: Set<MIDIEndpointRef> = []
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            var value: Unmanaged<CFString>?
            guard MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &value) == noErr, let value else { continue }
            let name = (value.takeRetainedValue() as String).uppercased().filter { $0.isLetter || $0.isNumber }
            if name.contains("XTOUCHMINI") { available.insert(source) }
        }
        for source in sources.subtracting(available) { MIDIPortDisconnectSource(port, source) }
        sources.formIntersection(available)
        var error: OSStatus = noErr
        for source in available.subtracting(sources) {
            let result = MIDIPortConnectSource(port, source, nil)
            if result == noErr { sources.insert(source) } else { error = result }
        }
        if !sources.isEmpty { onStatus?("X-Touch Mini · MC · réception seule") }
        else if error != noErr { onStatus?("Connexion MIDI refusée (\(error))") }
        else { onStatus?("X-Touch Mini absent") }
    }

    func stop() {
        generation = UUID()
        bridgeAvailable = false
        if virtualSource != 0 { MIDIEndpointDispose(virtualSource); virtualSource = 0 }
        if port != 0 { MIDIPortDispose(port); port = 0 }
        sources.removeAll()
        if client != 0 { MIDIClientDispose(client); client = 0 }
    }
    func forward(_ message: [UInt8]) -> Bool {
        guard virtualSource != 0, message.count == 3 else { return false }
        var list = MIDIPacketList()
        return withUnsafeMutablePointer(to: &list) { pointer in
            let packet = MIDIPacketListInit(pointer)
            return message.withUnsafeBufferPointer { bytes in
                // MIDIReceived exige une date CoreMIDI valide : contrairement
                // à MIDISend, zéro ne signifie pas « maintenant » pour cette API.
                _ = MIDIPacketListAdd(pointer, MemoryLayout<MIDIPacketList>.size, packet, mach_absolute_time(), bytes.count, bytes.baseAddress!)
                return MIDIReceived(virtualSource, pointer) == noErr
            }
        }
    }
}
