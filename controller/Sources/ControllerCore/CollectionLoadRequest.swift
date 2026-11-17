import Foundation

public enum CollectionLoadRequestError: Error, LocalizedError {
    case invalidFile, unsupportedVersion, unverifiedProfile
    public var errorDescription: String? {
        switch self {
        case .invalidFile: return "Fichier de demande Controller invalide ou illisible."
        case .unsupportedVersion: return "Version de demande Controller non prise en charge."
        case .unverifiedProfile: return "Le profil ou la variante n’est pas vérifié."
        }
    }
}

/// Déclaration locale exportée par collectionStatus, sans inventaire ni preuve de licence.
public struct CollectionLoadRequest: Decodable {
    public let schemaVersion: Int
    public let pluginId: String
    public let licenseStatus: String
    public let variant: ProfileVariantRequest

    public static func load(file: URL, root: URL) throws -> ResolvedProfileConfiguration {
        let request: Self
        do {
            let data = try Data(contentsOf: file)
            guard data.count <= 16_384 else { throw CollectionLoadRequestError.invalidFile }
            request = try JSONDecoder().decode(Self.self, from: data)
        } catch { throw CollectionLoadRequestError.invalidFile }
        guard request.schemaVersion == 1 else { throw CollectionLoadRequestError.unsupportedVersion }
        let fields = [request.pluginId, request.variant.format, request.variant.channelLayout,
                      request.variant.application, request.variant.pluginName]
        guard fields.allSatisfy({ value in
            guard let value else { return false }
            return !value.isEmpty && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
        }), request.variant.testedVersion.map({ !$0.isEmpty && $0 == $0.trimmingCharacters(in: .whitespacesAndNewlines) }) ?? true else {
            throw CollectionLoadRequestError.invalidFile
        }
        let result = try CollectionProfileLoader.load(pluginId: request.pluginId, licenseStatus: request.licenseStatus,
                                                     root: root, variant: request.variant)
        guard result.status == .verified else { throw CollectionLoadRequestError.unverifiedProfile }
        return result
    }
}
