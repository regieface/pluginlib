import Foundation

/// Liaison locale uniquement : aucune possession ni configuration de contrôle n'est recopiée.
public struct ProfileManifest: Decodable {
    public enum Status: String, Decodable { case draft, verified }
    public struct Host: Decodable, Equatable {
        public let application: String
        public let pluginName: String
        public let testedVersion: String?
    }
    public struct Variant: Decodable, Equatable {
        public let format: String
        public let channelLayout: String
        public let host: Host
        public let metadataPath: String?
        public let status: Status
    }
    public struct Unresolved: Decodable {
        public let field: String
        public let reason: String
    }
    public struct Entry: Decodable {
        public let profileId: String
        public let profilePath: String
        public let status: Status
        public let variants: [Variant]
        public let unresolved: [Unresolved]
    }
    public struct Link: Decodable {
        public let pluginId: String
        public let profiles: [Entry]
    }
    public let schemaVersion: Int
    public let links: [Link]
}

public enum ProfileResolutionError: Error, Equatable {
    case outsideCollection
    case manifestUnavailable
    case invalidReference
    case profileAbsent
    case variantUnavailable
    case ambiguousVariant
}

/// Ces champs proviennent de l'appelant/de l'hôte, jamais du nom commercial.
public struct ProfileVariantRequest: Decodable {
    public var format: String?
    public var channelLayout: String?
    public var application: String?
    public var pluginName: String?
    public var testedVersion: String?
    public init(format: String? = nil, channelLayout: String? = nil, application: String? = nil,
                pluginName: String? = nil, testedVersion: String? = nil) {
        self.format = format; self.channelLayout = channelLayout
        self.application = application; self.pluginName = pluginName; self.testedVersion = testedVersion
    }
}

public struct ResolvedProfileConfiguration {
    public let profile: Profile
    public let variant: ProfileManifest.Variant
    public let status: ProfileManifest.Status
    public let unresolved: [ProfileManifest.Unresolved]
}

public enum CollectionProfileLoader {
    private static func nonEmpty(_ value: String) -> Bool {
        !value.isEmpty && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private static func safeURL(_ path: String, directory: String, root: URL) throws -> URL {
        let allowed = root.appendingPathComponent(directory).resolvingSymlinksInPath().standardizedFileURL
        let file = root.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        guard nonEmpty(path), !path.hasPrefix("/"), file.path.hasPrefix(allowed.path + "/") else {
            throw ProfileResolutionError.invalidReference
        }
        return file
    }

    /// licenseStatus est le résultat de collectionStatus côté PluginLib, pas un inventaire Swift.
    /// Le chargement retourne des données et ne touche jamais aux transports ni au profil actif.
    public static func load(pluginId: String, licenseStatus: String, root: URL,
                            variant request: ProfileVariantRequest = .init()) throws -> ResolvedProfileConfiguration {
        guard licenseStatus == "owned" || licenseStatus == "subscription" else {
            throw ProfileResolutionError.outsideCollection
        }
        let data: Data
        do { data = try Data(contentsOf: root.appendingPathComponent("profile-manifest.json")) }
        catch { throw ProfileResolutionError.manifestUnavailable }
        let manifest: ProfileManifest
        do { manifest = try JSONDecoder().decode(ProfileManifest.self, from: data) }
        catch { throw ProfileResolutionError.invalidReference }
        guard manifest.schemaVersion == 1 else { throw ProfileResolutionError.invalidReference }
        var plugins = Set<String>(), profiles = Set<String>()
        for link in manifest.links {
            guard nonEmpty(link.pluginId), plugins.insert(link.pluginId).inserted, !link.profiles.isEmpty else {
                throw ProfileResolutionError.invalidReference
            }
            for entry in link.profiles {
                guard nonEmpty(entry.profileId), profiles.insert(entry.profileId).inserted, !entry.variants.isEmpty,
                      entry.unresolved.allSatisfy({ nonEmpty($0.field) && nonEmpty($0.reason) }) else {
                    throw ProfileResolutionError.invalidReference
                }
                _ = try safeURL(entry.profilePath, directory: "Profiles", root: root)
                var variants = Set<[String]>()
                for variant in entry.variants {
                    guard [variant.format, variant.channelLayout, variant.host.application, variant.host.pluginName].allSatisfy(nonEmpty),
                          variants.insert([variant.format, variant.channelLayout, variant.host.application, variant.host.pluginName]).inserted else {
                        throw ProfileResolutionError.invalidReference
                    }
                    if let path = variant.metadataPath { _ = try safeURL(path, directory: "Metadata", root: root) }
                }
            }
        }
        guard let link = manifest.links.first(where: { $0.pluginId == pluginId }) else {
            throw ProfileResolutionError.profileAbsent
        }
        func matches(_ known: String, _ supplied: String?) -> Bool { supplied == nil || supplied == known }
        let candidates = link.profiles.flatMap { entry in
            entry.variants.filter {
                matches($0.format, request.format) && matches($0.channelLayout, request.channelLayout)
                && matches($0.host.application, request.application) && matches($0.host.pluginName, request.pluginName)
                && (request.testedVersion == nil || request.testedVersion == $0.host.testedVersion)
            }.map { (entry, $0) }
        }
        guard !candidates.isEmpty else { throw ProfileResolutionError.variantUnavailable }
        guard candidates.count == 1, [request.format, request.channelLayout, request.application, request.pluginName].allSatisfy({ $0 != nil }) else {
            throw ProfileResolutionError.ambiguousVariant
        }
        let (entry, variant) = candidates[0]
        do {
            let url = try safeURL(entry.profilePath, directory: "Profiles", root: root)
            let profile = try Profiles.load(file: url)
            guard profile.id == entry.profileId else { throw ProfileResolutionError.invalidReference }
            if let path = variant.metadataPath {
                let metadata = try JSONSerialization.jsonObject(with: Data(contentsOf: safeURL(path, directory: "Metadata", root: root))) as? [String: Any]
                guard metadata?["lpPluginName"] as? String == variant.host.pluginName,
                      variant.host.testedVersion == nil || metadata?["observedLPVersion"] as? String == variant.host.testedVersion else {
                    throw ProfileResolutionError.invalidReference
                }
            }
            return ResolvedProfileConfiguration(profile: profile, variant: variant,
                status: entry.status == .verified && variant.status == .verified ? .verified : .draft,
                unresolved: entry.unresolved)
        } catch { throw ProfileResolutionError.invalidReference }
    }
}
