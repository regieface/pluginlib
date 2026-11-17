import Foundation

public struct OSCMessage: Equatable {
    public let address: String
    public let values: [ParameterValue]
}
public enum OSCError: Error { case invalid, unsupported }
public enum OSC {
    public static func decode(_ data: Data) throws -> [OSCMessage] {
        try decode(Array(data), depth: 0)
    }
    private static func decode(_ bytes: [UInt8], depth: Int) throws -> [OSCMessage] {
        guard depth < 8, !bytes.isEmpty, bytes.count <= 65504, bytes.count % 4 == 0 else { throw OSCError.invalid }
        var index = 0
        func integer(_ size: Int) throws -> UInt64 {
            guard index + size <= bytes.count else { throw OSCError.invalid }
            defer { index += size }
            return bytes[index..<index + size].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        }
        func string() throws -> String {
            guard index < bytes.count, let end = bytes[index...].firstIndex(of: 0),
                  let text = String(bytes: bytes[index..<end], encoding: .utf8) else { throw OSCError.invalid }
            let next = (end + 4) & ~3
            guard next <= bytes.count, bytes[end..<next].allSatisfy({ $0 == 0 }) else { throw OSCError.invalid }
            index = next
            return text
        }
        let address = try string()
        if address == "#bundle" {
            // Cette première version accepte uniquement les retours immédiats.
            guard try integer(8) == 1 else { throw OSCError.unsupported }
            var result: [OSCMessage] = []
            while index < bytes.count {
                let size = Int(try integer(4))
                guard size > 0, size <= bytes.count - index else { throw OSCError.invalid }
                result += try decode(Array(bytes[index..<index + size]), depth: depth + 1)
                index += size
            }
            return result
        }
        guard address.hasPrefix("/") else { throw OSCError.invalid }
        let tags = try string()
        guard tags.hasPrefix(",") else { throw OSCError.invalid }
        var values: [ParameterValue] = []
        for tag in tags.dropFirst() {
            switch tag {
            case "i": values.append(.number(Double(Int32(bitPattern: UInt32(try integer(4))))))
            case "f":
                let value = Float(bitPattern: UInt32(try integer(4)))
                guard value.isFinite else { throw OSCError.invalid }
                values.append(.number(Double(value)))
            case "d":
                let value = Double(bitPattern: try integer(8))
                guard value.isFinite else { throw OSCError.invalid }
                values.append(.number(value))
            case "s": values.append(.text(try string()))
            case "T": values.append(.boolean(true))
            case "F": values.append(.boolean(false))
            default: throw OSCError.unsupported
            }
        }
        guard index == bytes.count else { throw OSCError.invalid }
        return [OSCMessage(address: address, values: values)]
    }
}
