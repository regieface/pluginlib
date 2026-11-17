import Foundation
import CoreGraphics
import ControllerCore

// Preuves locales de l'AU, sans instancier le plugin ni contacter LiveProfessor.
func checkF6Pilot(root: URL) throws {
    struct Catalogue: Decodable {
        struct Parameter: Decodable { let id: Int; let name: String }
        struct Sample: Decodable { let id: Int; let normalized: Double; let text: String }
        let parameters: [Parameter]
        let sixBandDisplaySamples: [Sample]
    }
    let profile = try Profiles.load(file: root.appendingPathComponent("Profiles/waves-f6.json"))
    let catalogue = try JSONDecoder().decode(Catalogue.self, from: Data(contentsOf: root.appendingPathComponent("Metadata/waves-f6-au.json")))
    var stream = MIDIStream()
    var capture = MIDICapture()
    // Note On, maintien répété, Note Off et relâchement par vélocité zéro :
    // les octets restent des preuves, sans attribution implicite à un encodeur.
    let packets: [[UInt8]] = [[0x90, 0x20], [0x7f, 0x20, 0x7f], [0x80, 0x20, 0], [0x90, 0x20, 0]]
    for packet in packets {
        for message in stream.receive(packet) { capture.record(message, uptime: 12) }
    }
    check(capture.events.map { $0.bytes } == [[0x90, 0x20, 127], [0x90, 0x20, 127], [0x80, 0x20, 0], [0x90, 0x20, 0]], "capture passive des appuis et relâchements sans perte ni déduction")
    check(capture.events.allSatisfy { MIDIStream.routedEncoder($0.bytes, profile: profile, bank: 1) == nil }, "notes capturées jamais routées comme rotations")
    for i in 0..<300 { capture.record([0xB0, 16, 1], uptime: Double(i)) }
    check(capture.total == 304 && capture.events.count == 256 && capture.events.first?.uptime == 44, "capture bornée avec compteur de troncature")
    check(try JSONDecoder().decode([MIDICapture.Event].self, from: JSONEncoder().encode(capture.events)) == capture.events, "preuve MIDI sérialisable sans altération")
    for band in 1...6 {
        check(catalogue.parameters.filter { $0.name == "Band \(band) On/Off" }.map { $0.id } == [8 + (band - 1) * 12], "identifiant AU On/Off réel par bande")
    }
    check(profile.buttons.filter { $0.selectBank != nil }.map { $0.id } == Array(1...6), "sélections historiques B1…B6 conservées avant migration physique")
    for slot in 7...16 {
        let button = profile.buttons.first { $0.id == slot }!
        check(button.selectBank == nil && button.midi == nil && button.feedbackAddress == nil && button.hostParameter == nil, "B\(slot) reste sans commande ni état supposé")
    }
    var learned = profile
    learned.buttons[0].midi = MIDIBinding(message: .note, channel: 1, number: 89, encoding: .absolute)
    check(MIDIStream.selectedBank([0x90, 89, 127], profile: learned) == 1, "sélection apprise préservée")
    check(MIDIStream.selectedBank([0x80, 89, 0], profile: learned) == nil && MIDIStream.selectedBank([0x90, 89, 0], profile: learned) == nil, "relâchements sans sélection")
    for note: UInt8 in 0...127 {
        check(MIDIStream.routedEncoder([0x90, note, 127], profile: profile, bank: 1) == nil && MIDIStream.routedEncoder([0x80, note, 0], profile: profile, bank: 1) == nil, "aucun bouton non validé transmis au chemin encodeurs")
    }
    let names = ["Freq", "Q", "Gain", "Range", "Threshold", "Attack", "Release"]
    var parameters = Set<String>(), addresses = Set<String>()
    for band in 1...6 {
        check(profile.buttons.filter { $0.selectBank == band }.count == 1, "une sélection locale par bande F6")
        for control in profile.encoders(for: band) {
            let expected = control.id == 8 ? "OUT" : "Band \(band) \(names[control.id - 1])"
            check(control.hostParameter == expected && control.name == expected, "F6 Band \(band) E\(control.id) nom natif")
            let routeID = [2, 3, 1, 4, 5, 6, 7, 8][control.id - 1]
            let cc = control.id == 8 ? 23 : 15 + routeID + (band - 1) * 8
            for step: UInt8 in [1, 2, 0x41, 0x42] {
                check(MIDIStream.routedEncoder([0xB0, UInt8(15 + control.id), step], profile: profile, bank: band) == [0xB0, UInt8(cc), step], "F6 deux sens et accélération conservés pour chaque banque")
            }
            let matches = catalogue.parameters.filter { $0.name == expected }
            check(matches.count == 1, "paramètre F6 unique dans le catalogue AU")
            let scale = control.valueScale!
            check(scale.isValid && scale.inputMin == 0 && scale.inputMax == 1, "domaine OSC normalisé F6")
            check(scale.converted(0) != nil && scale.converted(1) != nil && scale.converted(-0.01) == nil && scale.converted(1.01) == nil, "bornes F6 sans extrapolation")
            let samples = catalogue.sixBandDisplaySamples.filter { $0.id == matches[0].id }
            check(samples.count >= 2, "preuves AU pour chaque commande de chaque bande")
            for sample in samples {
                let physical = scale.converted(sample.normalized)!
                let native = Double(sample.text)!
                check(abs(physical - native) <= 0.51 * pow(10, -Double(scale.decimals)), "conversion F6 conforme au texte AU : \(expected)")
            }
            parameters.insert(expected); addresses.insert(control.feedbackAddress!)
            if control.id == 8 { check(control == profile.encoders[7], "OUT partagé sans divergence entre banques") }
        }
    }
    let layout = profile.bandSelectorLayout!
    for factor in [0.75, 1.0, 1.25, 2.0] {
        let frame = CGRect(x: -900, y: 40, width: 802 * factor, height: 602 * factor)
        for band in 1...6 {
            let point = layout.point(band: band, in: frame)!
            check(abs(point.x - (-900 + (160 + Double(band - 1) * 50) * factor)) < 0.0001 &&
                  abs(point.y - (40 + 409 * factor)) < 0.0001, "six bandes déplacées et redimensionnées sans changer l’espacement relatif")
            let target = WindowClickTarget(pid: 123, title: "F6 (m)UI", frame: frame, point: point)
            check(target.matches(pid: 123, title: "F6 (m)UI", frame: frame, visible: true), "bonne cible redimensionnée acceptée")
            check(!target.matches(pid: 124, title: "F6 (m)UI", frame: frame, visible: true), "autre processus refusé")
            check(!target.matches(pid: 123, title: "LiveProfessor", frame: frame, visible: true), "autre fenêtre refusée même à géométrie identique")
            check(!target.matches(pid: 123, title: "F6 (m)UI", frame: frame, visible: false), "cible masquée refusée")
            check(!target.matches(pid: 123, title: "F6 (m)UI", frame: frame.offsetBy(dx: 1, dy: 0), visible: true), "fenêtre déplacée après planification refusée")
            check(!target.matches(pid: 123, title: "F6 (m)UI", frame: CGRect(x: -900, y: 40, width: frame.width + 1, height: frame.height), visible: true), "redimensionnement pendant la préparation refusé, nouvelle lecture nécessaire")
        }
    }
    for frame in [CGRect.zero, CGRect(x: 0, y: 0, width: -1, height: 602), CGRect(x: 0, y: 0, width: 802, height: Double.infinity)] {
        check(layout.point(band: 1, in: frame) == nil, "géométrie invalide refusée")
    }
    // Fixtures mesurées synthétiques, sans prétendre décrire le dessin réel F6.
    // Tailles non proportionnelles et bordures fixes : aucune extrapolation permise.
    for size in [CGSize(width: 650, height: 500), CGSize(width: 1000, height: 700), CGSize(width: 1203, height: 903)] {
        let offsets = [CGPoint(x: 120, y: 300), CGPoint(x: 163, y: 302), CGPoint(x: 207, y: 301),
                       CGPoint(x: 252, y: 300), CGPoint(x: 298, y: 302), CGPoint(x: 345, y: 301)]
        let measured = BandSelectorCalibration(title: layout.windowTitle, size: size, points: offsets)
        let frame = CGRect(origin: CGPoint(x: -1100, y: 80), size: size)
        check(measured.isValid, "six mesures indépendantes valides")
        for band in 1...6 {
            check(layout.measuredPoint(band: band, in: frame, calibrations: []) == nil, "taille non mesurée : seul le clic est indisponible")
            let expected = CGPoint(x: frame.minX + offsets[band-1].x, y: frame.minY + offsets[band-1].y)
            check(layout.measuredPoint(band: band, in: frame, calibrations: [measured]) == expected, "six repères exacts sans interpolation ni proportions")
            check(layout.measuredPoint(band: band, in: frame.offsetBy(dx: 200, dy: -100), calibrations: [measured]) == CGPoint(x: expected.x + 200, y: expected.y - 100), "déplacement multi-écran indépendant de la taille")
            var changed = frame; changed.size.width += 1
            check(layout.measuredPoint(band: band, in: changed, calibrations: [measured]) == nil, "calibrage jamais réutilisé pour une autre taille")
            check(measured.point(band: band, title: "Autre", frame: frame) == nil, "autre titre refusé")
            check(MIDIStream.routedEncoder([0xB0, 16, 1], profile: profile, bank: band) != nil, "MIDI des six banques indépendant d’une taille non calibrée")
        }
        check(!BandSelectorCalibration(title: layout.windowTitle, size: size, points: Array(offsets.prefix(5))).isValid, "calibrage incomplet rejeté")
        var bad = offsets; bad[2].x = .nan
        check(!BandSelectorCalibration(title: layout.windowTitle, size: size, points: bad).isValid, "mesure non finie rejetée")
        check(measured.point(band: 0, title: layout.windowTitle, frame: frame) == nil && measured.point(band: 7, title: layout.windowTitle, frame: frame) == nil, "bande invalide refusée")
        let decoded = try JSONDecoder().decode(BandSelectorCalibration.self, from: JSONEncoder().encode(measured))
        check(decoded.points == offsets && decoded.size == size, "persistance exacte des mesures")
    }
    var feedback = FeedbackBank()
    for band in 1...6 {
        let controls = profile.encoders(for: band)
        check(controls[0].feedbackAddress == (band == 1 ? "/pluginlib/waves-f6/e2" : "/pluginlib/waves-f6/band\(band)/e2"), "E1 fréquence garde la route OSC historique")
        check(controls[2].feedbackAddress == (band == 1 ? "/pluginlib/waves-f6/e1" : "/pluginlib/waves-f6/band\(band)/e1"), "E3 gain garde la route OSC historique")
        for control in controls.prefix(3) {
            check(feedback.receive(address: control.feedbackAddress!, value: .number(0.5), profiles: [profile]), "retour reçu après inversion")
            check(feedback.state(for: profile).values[control.feedbackAddress!] == .number(0.5), "retour associé au paramètre, indépendant de sa position")
        }
    }
    // Valeurs différentes : une inversion OSC/échelle ne peut pas passer par coïncidence.
    for band in 1...6 {
        let controls = profile.encoders(for: band)
        feedback.receive(address: controls[0].feedbackAddress!, value: .number(0), profiles: [profile])
        feedback.receive(address: controls[1].feedbackAddress!, value: .number(0), profiles: [profile])
        feedback.receive(address: controls[2].feedbackAddress!, value: .number(0.75), profiles: [profile])
    }
    for band in 1...6 {
        let controls = profile.encoders(for: band)
        let values = feedback.state(for: profile).values
        check(controls[1].valueScale!.display(values[controls[1].feedbackAddress!]!) == "0,4", "E2 affiche le retour Q de sa banque")
        check(controls[0].valueScale!.display(values[controls[0].feedbackAddress!]!) == "16 Hz", "E1 affiche le retour fréquence réel de sa banque")
        check(controls[2].valueScale!.display(values[controls[2].feedbackAddress!]!) == "+9,0 dB", "E3 affiche le retour gain réel de sa banque")
    }
    // Output Level est global : un seul retour doit rester lisible dans toutes les banques.
    feedback.receive(address: "/pluginlib/waves-f6/e8", value: .number(0.75), profiles: [profile])
    for band in [1, 6, 2, 5, 3, 4, 1] {
        let output = profile.encoders(for: band).first { $0.id == 8 }!
        check(output.hostParameter == "OUT" && output.midi?.number == 23 && output.midi?.channel == 1,
              "E8 Output Level reste attribué à la cible globale")
        check(output.feedbackAddress == "/pluginlib/waves-f6/e8", "E8 conserve son retour OSC global")
        let received = feedback.state(for: profile).values[output.feedbackAddress!]!
        check(output.valueScale!.display(received) == "+9,0 dB", "valeur E8 conservée en passant entre les six banques")
    }
    check(parameters.count == 43 && addresses.count == 43, "43 cibles F6 et 43 retours distincts")
    func rejects(_ invalid: Profile, _ message: String) {
        do { try invalid.validate(); check(false, message) } catch { check(true, message) }
    }
    var invalid = profile
    invalid.banks![1].encoders[0].feedbackAddress = profile.encoders[0].feedbackAddress
    rejects(invalid, "retour partagé entre deux bandes refusé au chargement")
    invalid = profile
    invalid.banks![1].encoders[7].valueScale?.outputMax = 19
    rejects(invalid, "échelle OUT incohérente entre banques refusée")
    invalid = profile
    invalid.banks![1].encoders[1].feedbackAddress = invalid.banks![1].encoders[0].feedbackAddress
    rejects(invalid, "retour dupliqué dans une banque refusé")
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("f6-invalid-\(UUID().uuidString).json")
    defer { try? FileManager.default.removeItem(at: file) }
    try JSONEncoder().encode(invalid).write(to: file)
    do { _ = try Profiles.load(file: file); check(false, "chargement JSON ambigu refusé") }
    catch { check(true, "chargement JSON ambigu refusé") }
}
