import Foundation

public struct Control: Codable, Identifiable, Equatable {
    public var id: Int
    public var name: String
    public var feedbackAddress: String?
    public var midi: MIDIBinding?
    public var valueScale: ValueScale?
    public var hostParameter: String?
    public var color: String?
    public var selectBank: Int?
    public init(id: Int, name: String, feedbackAddress: String? = nil, midi: MIDIBinding? = nil, valueScale: ValueScale? = nil, hostParameter: String? = nil) {
        self.id = id; self.name = name; self.feedbackAddress = feedbackAddress; self.midi = midi
        self.valueScale = valueScale
        self.hostParameter = hostParameter
    }
}
public struct ControlBank: Codable, Identifiable, Equatable {
    public var id: Int
    public var name: String
    public var accentColor: String
    public var encoders: [Control]
}
public struct MIDIBinding: Codable, Equatable {
    public enum Message: String, Codable { case controlChange, note }
    public enum Encoding: String, Codable { case absolute, relativeTwosComplement, relativeBinaryOffset, relativeSignMagnitude }
    public var message: Message
    public var channel: Int // 1...16
    public var number: Int // 0...127
    public var encoding: Encoding
    public init(message: Message, channel: Int, number: Int, encoding: Encoding) {
        self.message = message; self.channel = channel; self.number = number; self.encoding = encoding
    }
}
public struct Profile: Codable, Identifiable, Equatable {
    public var id: String
    public var name: String
    public var windowTitles: [String]
    public var encoders: [Control]
    public var buttons: [Control]
    public var accentColor: String?
    public var banks: [ControlBank]?
    public var bandSelectorLayout: BandSelectorLayout?
    public func encoders(for bank: Int) -> [Control] {
        guard let banks else { return encoders }
        return banks.first(where: { $0.id == bank })?.encoders ?? []
    }
    public var allControls: [Control] { encoders + buttons + (banks ?? []).flatMap(\.encoders) }
    public func validate() throws {
        if let layout = bandSelectorLayout, !layout.isValid || !windowTitles.contains(layout.windowTitle) { throw ProfileError.invalid("\(id): repérage visuel des bandes invalide.") }
        if let color = accentColor, ProfileColor(hex: color) == nil {
            throw ProfileError.invalid("\(id): couleur du profil invalide (#RRGGBB attendu).")
        }
        guard !id.isEmpty, !name.isEmpty, !windowTitles.isEmpty,
              windowTitles.allSatisfy({ !$0.trimmingCharacters(in: .whitespaces).isEmpty }),
              encoders.count == 8, buttons.count == 16,
              Set(encoders.map(\.id)) == Set(1...8), Set(buttons.map(\.id)) == Set(1...16) else {
            throw ProfileError.invalid("\(id): il faut 8 encodeurs et 16 boutons, avec des identifiants uniques et des titres explicites.")
        }
        func validateControls(_ controls: [Control]) throws {
          var bindings = Set<String>()
          var addresses = Set<String>()
          for c in controls {
            if let color = c.color, ProfileColor(hex: color) == nil {
                throw ProfileError.invalid("\(id): couleur invalide pour \(c.name).")
            }
            if let scale = c.valueScale, !scale.isValid {
                throw ProfileError.invalid("\(id): échelle de valeur invalide pour \(c.name).")
            }
            if let m = c.midi, !(1...16).contains(m.channel) || !(0...127).contains(m.number) {
                throw ProfileError.invalid("\(id): canal ou numéro MIDI invalide.")
            }
            if let m = c.midi, !bindings.insert("\(m.message.rawValue):\(m.channel):\(m.number)").inserted {
                throw ProfileError.invalid("\(id): message MIDI affecté à plusieurs commandes.")
            }
            if let address = c.feedbackAddress, !address.hasPrefix("/") {
                throw ProfileError.invalid("\(id): une adresse OSC commence par /.")
            }
            if let address = c.feedbackAddress, !addresses.insert(address).inserted {
                throw ProfileError.invalid("\(id): adresse OSC affectée à plusieurs commandes.")
            }
          }
        }
        try validateControls(encoders + buttons)
        if let banks {
            guard !banks.isEmpty, banks.count <= 16, Set(banks.map(\.id)).count == banks.count else { throw ProfileError.invalid("\(id): banques invalides.") }
            guard banks.first?.encoders == encoders else { throw ProfileError.invalid("\(id): la banque initiale doit correspondre aux encodeurs par défaut.") }
            for bank in banks {
                guard bank.id > 0, !bank.name.isEmpty, ProfileColor(hex: bank.accentColor) != nil,
                      bank.encoders.count == 8, Set(bank.encoders.map(\.id)) == Set(1...8) else { throw ProfileError.invalid("\(id): banque \(bank.id) invalide.") }
                try validateControls(bank.encoders + buttons)
            }
            var routes: [String: String] = [:]
            var feedbackTargets: [String: Control] = [:]
            for control in banks.flatMap(\.encoders) {
                if let address = control.feedbackAddress {
                    if let previous = feedbackTargets[address], previous != control {
                        throw ProfileError.invalid("\(id): retour OSC partagé par des commandes différentes.")
                    }
                    feedbackTargets[address] = control
                }
                guard let binding = control.midi else { continue }
                let key = "\(binding.message.rawValue):\(binding.channel):\(binding.number)"
                let target = "\(control.hostParameter ?? control.name):\(control.feedbackAddress ?? "")"
                if let previous = routes[key], previous != target {
                    throw ProfileError.invalid("\(id): deux banques partagent un message MIDI pour des paramètres différents.")
                }
                routes[key] = target
            }
        }
        for button in buttons {
            if let target = button.selectBank, banks?.contains(where: { $0.id == target }) != true {
                throw ProfileError.invalid("\(id): sélection d’une banque inexistante.")
            }
        }
    }
}
public enum ProfileError: Error, LocalizedError {
    case invalid(String)
    public var errorDescription: String? { if case .invalid(let text) = self { return text }; return nil }
}
public enum Profiles {
    public static func normalizedTitle(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").lowercased()
    }
    public static func load(file: URL) throws -> Profile {
        let profile = try JSONDecoder().decode(Profile.self, from: Data(contentsOf: file))
        try profile.validate()
        return profile
    }
    public static func load(directory: URL) throws -> [Profile] {
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension.lowercased() == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        var result: [Profile] = [], ids = Set<String>(), titles = Set<String>()
        for file in files {
            let profile = try load(file: file)
            guard ids.insert(profile.id).inserted else { throw ProfileError.invalid("Profil dupliqué : \(profile.id)") }
            for title in profile.windowTitles {
                guard titles.insert(normalizedTitle(title)).inserted else { throw ProfileError.invalid("Titre ambigu : \(title)") }
            }
            result.append(profile)
        }
        guard !result.isEmpty else { throw ProfileError.invalid("Aucun profil JSON trouvé.") }
        return result
    }
    public static func match(title: String, profiles: [Profile]) -> Profile? {
        let key = normalizedTitle(title)
        return profiles.first { $0.windowTitles.contains { normalizedTitle($0) == key } }
    }
}

// Ne jamais chercher un ancien plugin derrière la fenêtre de premier plan.
public struct WindowSelection: Equatable {
    public let title: String?
    public let profile: Profile?
    public static func select(orderedTitles: [String], profiles: [Profile]) -> WindowSelection {
        let title = orderedTitles.first
        return WindowSelection(title: title, profile: title.flatMap { Profiles.match(title: $0, profiles: profiles) })
    }
}
