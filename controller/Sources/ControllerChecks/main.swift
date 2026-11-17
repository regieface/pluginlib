import Foundation
import CoreGraphics
import ControllerCore

var assertions = 0
func check(_ condition: Bool, _ message: String) {
    assertions += 1
    guard condition else { fputs("ÉCHEC : \(message)\n", stderr); exit(1) }
}
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
do {
    try checkProfileResolution(root: root)
    try checkF6Pilot(root: root)
    try checkF6Bypass()
    try checkFeedbackFreshness(root: root)
    try checkSelectionState(root: root)
    let profiles = try Profiles.load(directory: root.appendingPathComponent("Profiles"))
    check(Profiles.match(title: "F6 (m)UI", profiles: profiles)?.id == "waves-f6", "F6 réel")
    check(Profiles.match(title: " kHs   CompressorUI \n", profiles: profiles)?.id == "khs-compressor", "kHs et espaces")
    check(Profiles.match(title: "F6 (m)UI unrelated", profiles: profiles) == nil, "pas de correspondance approximative")
    check(WindowSelection.select(orderedTitles: ["LiveProfessor", "F6 (m)UI"], profiles: profiles).profile == nil, "pas de plugin derrière la fenêtre principale")
    check(WindowSelection.select(orderedTitles: ["", "F6 (m)UI"], profiles: profiles).profile == nil, "ne pas sauter une fenêtre sans titre")
    check(WindowSelection.select(orderedTitles: [], profiles: profiles).profile == nil, "aucune fenêtre")
    check(WindowSelection.select(orderedTitles: ["F6 (m)UI", "kHs CompressorUI"], profiles: profiles).profile?.id == "waves-f6", "respecter l’ordre")
    for p in profiles {
        check(p.encoders.count == 8 && p.buttons.count == 16, "géométrie X-Touch Mini")
        check(p.buttons.allSatisfy { $0.midi == nil && $0.feedbackAddress == nil }, "boutons encore non affectés")
        check(p.encoders.filter { $0.midi != nil }.count == (p.id == "waves-f6" ? 8 : 0), "huit affectations MC explicites pour F6 seulement")
        check((p.encoders + p.buttons).filter { $0.feedbackAddress != nil }.count == (p.id == "waves-f6" ? 8 : 0), "huit retours F6 distincts")
    }
    var p = profiles[0]
    p.encoders.removeLast()
    do { try p.validate(); check(false, "profil incomplet accepté") } catch { check(true, "profil incomplet rejeté") }
    p = profiles[0]; p.encoders[0].feedbackAddress = "/raw"
    var state = FeedbackState()
    state.receive(FeedbackEvent(profileID: "wrong", address: "/raw", value: .number(88)), activeProfile: p)
    check(state.values.isEmpty, "retour d’un autre profil ignoré")
    state.receive(FeedbackEvent(profileID: p.id, address: "/other", value: .number(88)), activeProfile: p)
    check(state.values.isEmpty, "adresse non affectée ignorée")
    state.receive(FeedbackEvent(profileID: p.id, address: "/raw", value: .number(0.75)), activeProfile: p)
    check(state.values["/raw"]?.display == "0.75", "valeur brute sans Hz/dB")
    state.activateProfile(); check(state.values.isEmpty, "pas de valeur périmée après changement de profil")
    let f6Profile = profiles.first { $0.id == "waves-f6" }!
    check(ProfileColor(hex: "#F26B4F") != nil && ProfileColor(hex: "#f26b4f") != nil, "couleurs hexadécimales valides")
    check(ProfileColor(hex: "#FF0000")?.red == 1 && ProfileColor(hex: "#FF0000")?.green == 0, "composantes RGB")
    for color in ["red", "#fff", "#GG0000", "#00000000", "#１２３４５６"] { check(ProfileColor(hex: color) == nil, "couleur invalide rejetée") }
    check(f6Profile.accentColor == "#F26B4F", "couleur du profil F6 bande 1")
    check(f6Profile.encoders.prefix(7).allSatisfy { $0.color == f6Profile.accentColor } && f6Profile.encoders[7].color != f6Profile.accentColor, "sept commandes de bande colorées et sortie distincte")
    check(f6Profile.banks?.count == 6, "six bandes définies")
    let layout = f6Profile.bandSelectorLayout!
    let frame = CGRect(x: -954, y: 129, width: 802, height: 602)
    check(layout.point(band: 2, in: frame) == CGPoint(x: -744, y: 538), "clic Band 2 confirmé en session, coordonnées relatives")
    check(layout.point(band: 1, in: frame) == CGPoint(x: -794, y: 538) && layout.point(band: 6, in: frame) == CGPoint(x: -544, y: 538), "six sélecteurs dans la rangée repérée")
    check(layout.point(band: 2, in: frame.offsetBy(dx: 400, dy: 100)) == CGPoint(x: -344, y: 638), "le repérage suit la fenêtre déplacée")
    check(layout.point(band: 2, in: CGRect(x: 0, y: 0, width: 1604, height: 1204)) == CGPoint(x: 420, y: 818), "sélecteur mis à l’échelle après redimensionnement")
    var fixedLayout = layout; fixedLayout.resizing = nil
    check(fixedLayout.point(band: 2, in: CGRect(x: 0, y: 0, width: 803, height: 602)) == nil, "taille stricte conservée sans déclaration proportionnelle")
    check(layout.point(band: 0, in: frame) == nil && layout.point(band: 7, in: frame) == nil, "aucun clic hors des six bandes")
    var badLayout = layout; badLayout.firstY = .nan
    check(!badLayout.isValid && badLayout.point(band: 2, in: frame) == nil, "coordonnées invalides rejetées")
    for band in 1...6 {
        for id in 1...8 {
            let input: [UInt8] = [0xB0, UInt8(15 + id), 0x42]
            let output = MIDIStream.routedEncoder(input, profile: f6Profile, bank: band)
            let routeID = [2, 3, 1, 4, 5, 6, 7, 8][id - 1]
            let number = id == 8 ? 23 : 15 + routeID + (band - 1) * 8
            check(output == [0xB0, UInt8(number), 0x42], "Band \(band) E\(id) vise la bonne voie sans modifier l’accélération")
            let control = f6Profile.encoders(for: band)[id-1]
            check(control.name == control.hostParameter, "nom exact de l’éditeur conservé")
        }
    }
    check(MIDIStream.routedEncoder([0xB0,0x10,1], profile: f6Profile, bank: 99) == nil, "pas de repli dangereux sur une autre bande")
    var learned = f6Profile
    learned.buttons[1].midi = MIDIBinding(message: .note, channel: 1, number: 89, encoding: .absolute)
    check(MIDIStream.selectedBank([0x90,89,127], profile: learned) == 2, "appui du bouton appris sélectionne Band 2")
    for message: [UInt8] in [[0x90,89,0],[0x80,89,127],[0x91,89,127],[0x90,90,127]] {
        check(MIDIStream.selectedBank(message, profile: learned) == nil, "relâchement ou bouton non appris ne sélectionne rien")
    }
    let expectedF6Midpoint = ["578 Hz", "4,6", "0,0 dB", "0,0 dB", "-30,0 dB", "15,8 ms", "158 ms", "0,0 dB"]
    let expectedF6TwoThirds = ["1 911 Hz", "10,7", "+6,0 dB", "+6,0 dB", "-20,1 dB", "49,7 ms", "497 ms", "+6,0 dB"]
    for (index, control) in f6Profile.encoders.enumerated() {
        check(control.valueScale?.display(.number(0.5)) == expectedF6Midpoint[index], "E\(index+1) correspond au texte natif AU au milieu")
        check(control.valueScale?.display(.number(0.66571)) == expectedF6TwoThirds[index], "E\(index+1) correspond au texte natif AU à 0,66571")
    }
    for id in 1...8 {
        let number = UInt8(15 + id)
        let up: [UInt8] = [0xB0, number, 1]
        let down: [UInt8] = [0xB0, number, 0x42]
        check(MIDIStream.encoderMovement(up)?.id == id && MIDIStream.encoderMovement(up)?.delta == 1, "E\(id) identification et incrément")
        check(MIDIStream.mappedEncoder(down, profile: f6Profile)?.delta == -2, "E\(id) décrément accéléré et profil explicite")
        check(MIDIStream.mappedEncoder(up, profile: nil) == nil, "E\(id) sans profil non transmis")
        let control = f6Profile.encoders.first { $0.id == id }!
        check(control.feedbackAddress == "/pluginlib/waves-f6/e\([2, 3, 1, 4, 5, 6, 7, 8][id - 1])", "retour OSC E\(id) distinct")
        check(control.valueScale?.isValid == true, "échelle F6 E\(id) vérifiée sur les valeurs fournies par l’AU")
    }
    for message: [UInt8] in [[0xB0, 0x0F, 1], [0xB0, 0x18, 1], [0xB1, 0x11, 1], [0x90, 0x11, 1], [0xB0, 0x17, 0x40]] {
        check(MIDIStream.encoderMovement(message) == nil, "message hors des huit encodeurs ignoré")
    }
    var duplicateMIDI = f6Profile; duplicateMIDI.encoders[1].midi = duplicateMIDI.encoders[0].midi
    do { try duplicateMIDI.validate(); check(false, "double affectation MIDI acceptée") } catch { check(true, "double affectation MIDI rejetée") }
    var mismatchedMIDI = f6Profile; mismatchedMIDI.encoders[1].midi?.encoding = .relativeTwosComplement
    check(MIDIStream.mappedEncoder([0xB0, 0x11, 1], profile: mismatchedMIDI) == nil, "aucune interprétation sign-magnitude d’un autre encodage")
    var otherProfile = profiles.first { $0.id == "khs-compressor" }!
    otherProfile.encoders[0].feedbackAddress = "/khs/value"
    let cachedProfiles = [f6Profile, otherProfile]
    var bank = FeedbackBank()
    check(bank.receive(address: "/pluginlib/waves-f6/e1", value: .number(0.66571), profiles: cachedProfiles), "retour F6 mis en mémoire")
    check(bank.state(for: otherProfile).values.isEmpty, "F6 ne contamine pas l’autre profil")
    check(bank.state(for: nil).values.isEmpty, "aucun profil ne montre une ancienne valeur")
    check(bank.state(for: f6Profile).values["/pluginlib/waves-f6/e1"] == .number(0.66571), "retour dans F6 sans nouveau paquet conserve sa valeur")
    check(bank.receive(address: "/pluginlib/waves-f6/e1", value: .number(0.33429), profiles: cachedProfiles), "F6 mis à jour même sans profil actif")
    check(bank.state(for: f6Profile).values["/pluginlib/waves-f6/e1"] == .number(0.33429), "retour sur F6 utilise la dernière mise à jour reçue en arrière-plan")
    check(!bank.receive(address: "/inconnue", value: .number(1), profiles: cachedProfiles), "adresse inconnue non mémorisée")
    check(!bank.receive(FeedbackEvent(profileID: "wrong", address: "/pluginlib/waves-f6/e1", value: .number(1)), profiles: cachedProfiles), "profil inconnu non mémorisé")
    var ambiguous = otherProfile; ambiguous.encoders[0].feedbackAddress = "/pluginlib/waves-f6/e1"
    check(!bank.receive(address: "/pluginlib/waves-f6/e1", value: .number(1), profiles: [f6Profile, ambiguous]), "ne pas attribuer un retour OSC ambigu")
    check(bank.state(for: f6Profile).values["/pluginlib/waves-f6/e1"] == .number(0.33429), "retour ambigu ne remplace pas la valeur connue")
    bank.reset(); check(bank.state(for: f6Profile).values.isEmpty, "purge à l’arrêt, à la reconnexion ou au changement de session LP")
    for id in 1...8 { bank.receive(address: "/pluginlib/waves-f6/e\(id)", value: .number(Double(id) / 10), profiles: [f6Profile]) }
    check(bank.state(for: f6Profile).values.count == 8, "huit retours indépendants conservés")
    check(bank.state(for: f6Profile).values["/pluginlib/waves-f6/e1"] == .number(0.1) && bank.state(for: f6Profile).values["/pluginlib/waves-f6/e8"] == .number(0.8), "E8 ne remplace pas la valeur E1")
    check(ParameterValue.number(0.75).fraction(in: nil) == nil, "pas d’anneau sans domaine documenté")
    check(ParameterValue.number(0.75).fraction(in: 0...1) == 0.75, "domaine explicite")
    check(ParameterValue.number(.nan).fraction(in: 0...1) == nil, "NaN rejeté")
    let gain = ValueScale(inputMin: 0, inputMax: 1, outputMin: -18, outputMax: 18, unit: "dB", signed: true)
    check(gain.display(.number(0.5)) == "0,0 dB", "calibration utilisateur : zéro F6")
    check(gain.display(.number(0.66571)) == "+6,0 dB", "calibration utilisateur : +6 dB F6")
    check(gain.display(.number(0.33429)) == "-6,0 dB", "calibration utilisateur : −6 dB F6")
    check(gain.display(.number(0)) == "-18,0 dB" && gain.display(.number(1)) == "+18,0 dB", "bornes documentées F6")
    check(gain.display(.number(0.49999)) == "0,0 dB", "pas de zéro négatif à l’affichage")
    check(gain.display(.number(1.5)) == "1.5 (brut)", "pas de conversion hors du domaine validé")
    check(gain.display(.text("-3 dB")) == "-3 dB", "respecter le texte de l’hôte")
    let frequency = ValueScale(inputMin: 0, inputMax: 1, outputMin: 20, outputMax: 20000, curve: .logarithmic, unit: "Hz", decimals: 0)
    check(abs((frequency.converted(0.5) ?? 0) - sqrt(20 * 20000)) < 0.0001, "courbe logarithmique explicite, pas de règle universelle")
    var badScale = gain; badScale.inputMax = 0
    check(!badScale.isValid, "domaine vide rejeté")
    badScale = frequency; badScale.outputMin = 0
    check(!badScale.isValid, "logarithme de zéro rejeté")
    p = profiles[0]; p.encoders[0].valueScale = badScale
    do { try p.validate(); check(false, "profil avec échelle invalide accepté") } catch { check(true, "échelle invalide rejetée par le profil") }
    check(MIDIStream.firstEncoderDelta([0xB0, 0x10, 1]) == 1, "E1 incrément observé")
    check(MIDIStream.firstEncoderDelta([0xB0, 0x10, 0x41]) == -1, "E1 décrément observé")
    check(MIDIStream.firstEncoderDelta([0xB0, 0x10, 0x42]) == -2, "accélération MC")
    for message: [UInt8] in [[0xB0, 0x10, 0], [0xB0, 0x10, 0x40], [0xB1, 0x10, 1], [0xB0, 0x11, 1], [0x90, 0x10, 1], [0xB0, 0x10, 255]] {
        check(MIDIStream.firstEncoderDelta(message) == nil, "ne transmettre que les mouvements valides E1 canal 1")
    }
    var stream = MIDIStream()
    check(stream.receive([0xB0, 0x10]).isEmpty, "message fragmenté en attente")
    check(stream.receive([0xF8, 0x01, 0x10, 0x41]) == [[0xB0, 0x10, 1], [0xB0, 0x10, 0x41]], "fragmentation, horloge, running status")
    check(stream.receive([0xF0, 0x10, 0x01, 0xF8, 0xF7, 0x10, 0x01]).isEmpty, "SysEx et données orphelines ignorés")
    func oscString(_ text: String) -> [UInt8] {
        var bytes = Array(text.utf8) + [0]
        while bytes.count % 4 != 0 { bytes.append(0) }; return bytes
    }
    let raw = oscString("/pluginlib/waves-f6/e1") + oscString(",f") + [0x3F, 0x40, 0, 0]
    check(try OSC.decode(Data(raw)).first?.values == [.number(0.75)], "OSC float réseau brut")
    let text = oscString("/test") + oscString(",sTF") + oscString("-3.2 dB")
    check(try OSC.decode(Data(text)).first?.values == [.text("-3.2 dB"), .boolean(true), .boolean(false)], "OSC texte et booléens")
    let int = oscString("/test") + oscString(",i") + [255, 255, 255, 254]
    check(try OSC.decode(Data(int)).first?.values == [.number(-2)], "OSC entier signé")
    let bundle = oscString("#bundle") + [0, 0, 0, 0, 0, 0, 0, 1] + [0, 0, 0, UInt8(raw.count)] + raw
    check(try OSC.decode(Data(bundle)).count == 1, "bundle immédiat")
    for packet in [Array(raw.dropLast()), raw + [0, 0, 0, 0], oscString("/x") + oscString(",b"), oscString("/x") + oscString(",f") + [0x7F, 0xC0, 0, 0], Array(bundle.dropLast(4))] {
        do { _ = try OSC.decode(Data(packet)); check(false, "paquet OSC invalide accepté") }
        catch { check(true, "paquet OSC invalide rejeté") }
    }
    check(BridgeGate.allows(armed: true, running: true, demo: false, profileID: "waves-f6", hostIsFrontmost: true, snapshotAge: 0.1), "profil et lecture récents autorisent E1")
    check(!BridgeGate.allows(armed: false, running: true, demo: false, profileID: "waves-f6", hostIsFrontmost: true, snapshotAge: 0.1), "aucune transmission sans activation")
    check(!BridgeGate.allows(armed: true, running: false, demo: false, profileID: "waves-f6", hostIsFrontmost: true, snapshotAge: 0.1), "aucune transmission masqué")
    check(!BridgeGate.allows(armed: true, running: true, demo: true, profileID: "waves-f6", hostIsFrontmost: true, snapshotAge: 0.1), "aucune transmission démo")
    check(!BridgeGate.allows(armed: true, running: true, demo: false, profileID: "khs-compressor", hostIsFrontmost: true, snapshotAge: 0.1), "aucune transmission autre profil")
    check(!BridgeGate.allows(armed: true, running: true, demo: false, profileID: "waves-f6", hostIsFrontmost: false, snapshotAge: 0.1), "aucune transmission autre application")
    check(!BridgeGate.allows(armed: true, running: true, demo: false, profileID: "waves-f6", hostIsFrontmost: true, snapshotAge: 0.8), "lecture AX périmée bloque E1")
    print("\(assertions) contrôles réussis.")
} catch { fputs("ÉCHEC : \(error)\n", stderr); exit(1) }
