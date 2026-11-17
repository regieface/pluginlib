import Foundation
import CoreMIDI
import Darwin
import ControllerCore

private final class ReceivedBytes: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [UInt8] = []
    private var timestamps: [MIDITimeStamp] = []
    func add(_ bytes: [UInt8], timestamp: MIDITimeStamp) { lock.lock(); stored += bytes; timestamps.append(timestamp); lock.unlock() }
    var value: [UInt8] { lock.lock(); defer { lock.unlock() }; return stored }
    var times: [MIDITimeStamp] { lock.lock(); defer { lock.unlock() }; return timestamps }
}

// Teste les transports système avec une source MIDI virtuelle de test dédiée,
// sans transmettre aux sorties physiques ni ouvrir de fenêtre LiveProfessor.
@MainActor func transportChecks() -> Bool {
    let receiver = MIDIReceiver(sourceName: "PluginLib Test E1 \(ProcessInfo.processInfo.processIdentifier)")
    receiver.start()
    defer { receiver.stop() }
    var client: MIDIClientRef = 0
    var input: MIDIPortRef = 0
    guard MIDIClientCreate("PluginLib Test Observer" as CFString, nil, nil, &client) == noErr else { return false }
    defer { MIDIClientDispose(client) }
    let received = ReceivedBytes()
    guard MIDIInputPortCreateWithBlock(client, "Test" as CFString, &input, { list, _ in
        let offset = MemoryLayout<MIDIPacketList>.offset(of: \MIDIPacketList.packet)!
        var packet = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
        for _ in 0..<list.pointee.numPackets {
            let data = UnsafeRawPointer(packet).advanced(by: MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!).assumingMemoryBound(to: UInt8.self)
            received.add(Array(UnsafeBufferPointer(start: data, count: Int(packet.pointee.length))), timestamp: packet.pointee.timeStamp)
            packet = UnsafePointer(MIDIPacketNext(packet))
        }
    }) == noErr else { return false }
    defer { MIDIPortDispose(input) }
    var endpoint: MIDIEndpointRef = 0
    for index in 0..<MIDIGetNumberOfSources() {
        let candidate = MIDIGetSource(index)
        var name: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(candidate, kMIDIPropertyDisplayName, &name) == noErr,
           let name, (name.takeRetainedValue() as String) == "PluginLib Test E1 \(ProcessInfo.processInfo.processIdentifier)" { endpoint = candidate }
    }
    guard endpoint != 0, MIDIPortConnectSource(input, endpoint, nil) == noErr else { return false }
    let before = mach_absolute_time()
    var expected: [UInt8] = []
    guard let f6 = ControllerModel(demo: true).profiles.first(where: { $0.id == "waves-f6" }) else { return false }
    for bank in 1...6 {
      for number: UInt8 in 0x10...0x17 {
        for delta: UInt8 in [1, 0x41] {
            guard let message = MIDIStream.routedEncoder([0xB0, number, delta], profile: f6, bank: bank), receiver.forward(message) else { return false }
            expected += message
        }
      }
    }
    let after = mach_absolute_time()
    let osc = OSCReceiver()
    defer { osc.stop() }
    var messages: [OSCMessage] = []
    osc.onData = { if let decoded = try? OSC.decode($0) { messages += decoded } }
    do { try osc.start(port: 0) } catch { print("Échec UDP : \(error)"); return false }
    let sender = socket(AF_INET, SOCK_DGRAM, 0)
    guard sender >= 0 else { return false }
    defer { close(sender) }
    var target = sockaddr_in()
    target.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    target.sin_family = sa_family_t(AF_INET)
    target.sin_port = osc.boundPort.bigEndian
    target.sin_addr.s_addr = inet_addr("127.0.0.1")
    let packet: [UInt8] = [47, 116, 101, 115, 116, 0, 0, 0, 44, 102, 0, 0, 63, 64, 0, 0]
    _ = withUnsafePointer(to: &target) { address in
        address.withMemoryRebound(to: sockaddr.self, capacity: 1) { destination in
            packet.withUnsafeBytes { sendto(sender, $0.baseAddress, $0.count, 0, destination, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
    }
    let deadline = Date().addingTimeInterval(2)
    while Date() < deadline && (messages.isEmpty || received.value.count < expected.count) { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    let timestampsValid = received.times.count == 96 && received.times.allSatisfy { $0 > 0 && $0 >= before && $0 <= after }
    let passed = timestampsValid && received.value == expected && messages.first?.address == "/test" && messages.first?.values == [.number(0.75)]
    print(passed ? "Transports : six banques de huit encodeurs, deux sens, horodatages et retour UDP/OSC OK." : "ÉCHEC transports : MIDI \(received.value), dates \(received.times), OSC \(messages)")
    return passed
}

// Ports éphémères dédiés : ce test n’envoie rien à LiveProfessor (9000).
@MainActor func f6OSCCommandChecks() -> Bool {
    let sender = OSCReceiver(), receiver = OSCReceiver()
    defer { sender.stop(); receiver.stop() }
    var received: [OSCMessage] = []
    receiver.onData = { if let messages = try? OSC.decode($0) { received += messages } }
    guard !sender.sendF6(Data()) else { return false }
    do { try sender.start(port: 0); try receiver.start(port: 0) } catch { print("Échec OSC B16 : \(error)"); return false }
    guard sender.boundPort != 9000, receiver.boundPort != 9000 else { return false }
    var bypass = F6BandBypass()
    let address = F6BandBypass.address(3)
    var bytes = Array(address.utf8) + [0]
    while bytes.count % 4 != 0 { bytes.append(0) }
    bytes += [44,102,0,0,63,128,0,0]
    guard let feedback = try? OSC.decode(Data(bytes)) else { return false }
    bypass.receive(feedback)
    _ = bypass.press([0x90,95,0], band: 3, allowed: true)
    guard let command = bypass.press([0x90,95,127], band: 3, allowed: true),
          sender.sendF6(command.packet, destinationPort: receiver.boundPort) else { return false }
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    let passed = received.count == 1 && received.first?.address == address && received.first?.values == [.number(0)]
    print(passed ? "OSC B16 : commande absolue reçue sur port de test dédié, sans envoi à LP." : "ÉCHEC OSC B16")
    return passed
}
