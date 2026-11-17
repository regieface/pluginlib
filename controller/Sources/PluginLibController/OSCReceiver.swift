import Foundation
import Darwin

// UDP exclusivement sur la boucle locale : aucun accès Internet nécessaire.
@MainActor final class OSCReceiver {
    var onData: ((Data) -> Void)?
    private var source: DispatchSourceRead?
    private(set) var boundPort: UInt16 = 0
    private var generation = UUID()
    private let queue = DispatchQueue(label: "PluginLibController.osc", qos: .utility)
    func start(port: UInt16) throws {
        stop()
        let fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else { throw POSIXError(.EIO) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard result == 0 else { let code = errno; close(fd); throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO) }
        guard fcntl(fd, F_SETFL, O_NONBLOCK) == 0 else { close(fd); throw POSIXError(.EIO) }
        var local = sockaddr_in()
        var size = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &local) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &size) }
        }
        boundPort = UInt16(bigEndian: local.sin_port)
        let generation = self.generation
        let read = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        read.setEventHandler { [weak self] in
            var buffer = [UInt8](repeating: 0, count: 65536)
            for _ in 0..<32 {
                let count = recv(fd, &buffer, buffer.count, 0)
                guard count > 0 else { break }
                let data = Data(buffer.prefix(count))
                Task { @MainActor in
                    guard let self, self.generation == generation else { return }
                    self.onData?(data)
                }
            }
        }
        read.setCancelHandler { close(fd) }
        source = read
        read.resume()
    }
    // Destination de la copie F6 validée : boucle locale uniquement, port LP 9000.
    func sendF6(_ data: Data, destinationPort: UInt16 = 9000) -> Bool {
        guard boundPort != 0, boundPort != destinationPort, destinationPort != 0 else { return false }
        let fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = destinationPort.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        return data.withUnsafeBytes { bytes in
            withUnsafePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    sendto(fd, bytes.baseAddress, bytes.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == bytes.count
                }
            }
        }
    }
    func stop() { generation = UUID(); boundPort = 0; source?.cancel(); source = nil }
}
