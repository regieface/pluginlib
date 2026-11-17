import Foundation
import ControllerCore

func checkProfileResolution(root: URL) throws {
    let id = "waves--f6-floating-band-dynamic-eq"
    let mono = ProfileVariantRequest(format: "AudioUnit", channelLayout: "mono", application: "LiveProfessor", pluginName: "F6 (m)")
    let loaded = try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: root, variant: mono)
    check(loaded.status == .draft && loaded.profile.id == "waves-f6", "résolution F6 pilote non vérifiée")
    check(loaded.profile == (try Profiles.load(file: root.appendingPathComponent("Profiles/waves-f6.json"))), "configuration F6 inchangée")
    check(!loaded.unresolved.isEmpty, "informations non résolues conservées")
    let subscribed = try CollectionProfileLoader.load(pluginId: id, licenseStatus: "subscription", root: root, variant: mono)
    check(subscribed.profile == loaded.profile, "abonnement éligible")
    func rejects(_ expected: ProfileResolutionError, pluginId: String = id, status: String = "owned", at: URL = root, request: ProfileVariantRequest = mono) {
        do {
            _ = try CollectionProfileLoader.load(pluginId: pluginId, licenseStatus: status, root: at, variant: request)
            check(false, "erreur attendue : \(expected)")
        } catch { check(error as? ProfileResolutionError == expected, "erreur explicite : \(expected), reçue : \(error)") }
    }
    for status in ["unknown", "trial", "wishlist", "", "expired"] { rejects(.outsideCollection, status: status) }
    rejects(.profileAbsent, pluginId: "absent")
    rejects(.ambiguousVariant, request: .init())
    rejects(.variantUnavailable, request: .init(format: "AudioUnit", channelLayout: "stereo", application: "LiveProfessor", pluginName: "F6 (s)"))
    rejects(.variantUnavailable, request: .init(format: "AudioUnit", channelLayout: "mono", application: "LiveProfessor", pluginName: "F6 (m)", testedVersion: "inconnue"))

    let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temp) }
    rejects(.manifestUnavailable, at: temp)
    for directory in ["Profiles", "Metadata"] {
        try FileManager.default.copyItem(at: root.appendingPathComponent(directory), to: temp.appendingPathComponent(directory))
    }
    let manifestURL = temp.appendingPathComponent("profile-manifest.json")
    let original = try Data(contentsOf: root.appendingPathComponent("profile-manifest.json"))
    func fixture(_ mutate: (inout [String: Any]) -> Void) throws {
        var manifest = try JSONSerialization.jsonObject(with: original) as! [String: Any]
        mutate(&manifest)
        try JSONSerialization.data(withJSONObject: manifest).write(to: manifestURL)
    }
    func entryFixture(_ mutate: (inout [String: Any]) -> Void) throws {
        try fixture { manifest in
            var links = manifest["links"] as! [[String: Any]]
            var entries = links[0]["profiles"] as! [[String: Any]]
            mutate(&entries[0]); links[0]["profiles"] = entries; manifest["links"] = links
        }
    }
    try entryFixture { $0["status"] = "draft" }
    let draft = try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: temp, variant: mono)
    check(draft.status == .draft && draft.profile == loaded.profile, "profil non vérifié chargé avec état explicite")
    try entryFixture { entry in
        var variants = entry["variants"] as! [[String: Any]]; variants[0]["status"] = "draft"; entry["variants"] = variants
    }
    check(try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: temp, variant: mono).status == .draft, "variante draft ne devient pas vérifiée")
    for path in ["../outside.json", "/tmp/outside.json", "Profiles/missing.json", "Profiles/khs-compressor.json"] {
        try entryFixture { $0["profilePath"] = path }; rejects(.invalidReference, at: temp)
    }
    let outside = temp.appendingPathComponent("outside.json")
    try original.write(to: outside)
    try FileManager.default.createSymbolicLink(at: temp.appendingPathComponent("Profiles/escape.json"), withDestinationURL: outside)
    try entryFixture { $0["profilePath"] = "Profiles/escape.json" }; rejects(.invalidReference, at: temp)
    try fixture { $0["schemaVersion"] = 2 }; rejects(.invalidReference, at: temp)
    try fixture { $0["links"] = ($0["links"] as! [[String: Any]]) + ($0["links"] as! [[String: Any]]) }; rejects(.invalidReference, at: temp)
    try entryFixture { entry in
        var variants = entry["variants"] as! [[String: Any]]
        var alternate = variants[0]; alternate["channelLayout"] = "stereo"
        variants.append(alternate); entry["variants"] = variants
    }
    rejects(.ambiguousVariant, at: temp, request: .init(format: "AudioUnit", application: "LiveProfessor", pluginName: "F6 (m)"))
    check(try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: temp, variant: mono).variant.channelLayout == "mono", "variante explicite parmi plusieurs")
    try entryFixture { entry in
        entry["profileId"] = "khs-compressor"; entry["profilePath"] = "Profiles/khs-compressor.json"
        entry["status"] = "draft"
    }
    let khs = try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: temp, variant: mono)
    check(khs.status == .draft && khs.profile.id == "khs-compressor" && khs.profile.encoders.allSatisfy { $0.midi == nil }, "fixture : chargeur commun préserve la structure kHs non affectée")
    try entryFixture { entry in
        var variants = entry["variants"] as! [[String: Any]]
        variants[0]["metadataPath"] = "Metadata/missing.json"; entry["variants"] = variants
    }
    rejects(.invalidReference, at: temp)
    try entryFixture { entry in
        entry["status"] = "verified"
        var variants = entry["variants"] as! [[String: Any]]
        variants[0]["status"] = "verified"; entry["variants"] = variants
    }
    check(try CollectionProfileLoader.load(pluginId: id, licenseStatus: "owned", root: temp, variant: mono).status == .verified, "fixture vérifiée acceptée")
    let requestURL = temp.appendingPathComponent("request.json")
    let request: [String: Any] = ["schemaVersion": 1, "pluginId": id, "licenseStatus": "owned",
        "variant": ["format": "AudioUnit", "channelLayout": "mono", "application": "LiveProfessor", "pluginName": "F6 (m)"]]
    func writeRequest(_ value: [String: Any]) throws {
        try JSONSerialization.data(withJSONObject: value).write(to: requestURL)
    }
    for status in ["owned", "subscription"] {
        var value = request; value["licenseStatus"] = status; try writeRequest(value)
        check(try CollectionLoadRequest.load(file: requestURL, root: temp).profile == loaded.profile, "import JSON éligible")
    }
    var invalidRequests: [[String: Any]] = []
    for (key, value) in [("schemaVersion", 2 as Any), ("pluginId", "absent"), ("pluginId", ""), ("licenseStatus", "trial"), ("variant", [:] as [String: String]), ("variant", ["format": "AudioUnit", "channelLayout": "stereo", "application": "LiveProfessor", "pluginName": "F6 (s)"])] {
        var invalid = request; invalid[key] = value; invalidRequests.append(invalid)
    }
    for key in ["schemaVersion", "pluginId", "licenseStatus", "variant"] {
        var invalid = request; invalid.removeValue(forKey: key); invalidRequests.append(invalid)
    }
    for invalid in invalidRequests {
        try writeRequest(invalid)
        do { _ = try CollectionLoadRequest.load(file: requestURL, root: temp); check(false, "import invalide refusé") }
        catch { check(true, "import invalide refusé") }
    }
    try writeRequest(request)
    try entryFixture { $0["status"] = "draft" }
    do { _ = try CollectionLoadRequest.load(file: requestURL, root: temp); check(false, "import draft refusé") }
    catch { check(true, "import draft refusé") }
    try original.write(to: manifestURL)
    for file in [temp.appendingPathComponent("absent.json"), requestURL] {
        try Data("invalide".utf8).write(to: requestURL)
        do { _ = try CollectionLoadRequest.load(file: file, root: temp); check(false, "fichier absent ou invalide refusé") }
        catch { check(true, "fichier absent ou invalide refusé") }
    }
    try Data("{}".utf8).write(to: temp.appendingPathComponent("Profiles/waves-f6.json"))
    rejects(.invalidReference, at: temp)
    try Data("invalide".utf8).write(to: manifestURL); rejects(.invalidReference, at: temp)
}
