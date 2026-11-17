import Foundation
import ControllerCore

func checkFeedbackFreshness(root: URL) throws {
    let profile = try Profiles.load(file: root.appendingPathComponent("Profiles/waves-f6.json"))
    var bank = FeedbackBank()
    let addresses = Set(profile.allControls.compactMap(\.feedbackAddress))
    check(addresses.count == 43, "43 valeurs distinctes, E8 global inclus")
    for address in addresses {
        check(bank.state(for: profile).freshness(for: address, now: 100) == .unknown, "chargement sans valeur initiale inventée")
        bank.receive(address: address, value: .number(0.25), profiles: [profile], now: 100)
    }
    for band in 1...6 {
        for control in profile.encoders(for: band) {
            let address = control.feedbackAddress!
            check(bank.state(for: profile).freshness(for: address, now: 101) == .confirmed, "retour reçu pour les huit commandes de chaque banque")
            check(bank.state(for: profile).values[address] == .number(0.25), "changement de banque conserve le retour réel")
        }
    }
    bank.markStale(profileID: profile.id) // Perte de cible/focus, aucune purge audio.
    for address in addresses {
        check(bank.state(for: profile).freshness(for: address, now: 101) == .stale, "perte de focus invalide la fraîcheur")
        check(bank.state(for: profile).values[address] == .number(0.25), "perte de focus conserve les valeurs connues")
    }
    // Relire le profil ou revenir sur F6 ne constitue pas un nouveau retour.
    let reloaded = try Profiles.load(file: root.appendingPathComponent("Profiles/waves-f6.json"))
    check(bank.state(for: reloaded).freshness(for: "/pluginlib/waves-f6/e8", now: 102) == .stale, "reprise de focus seule ne confirme pas E8")
    bank.receive(address: "/pluginlib/waves-f6/e8", value: .number(0.75), profiles: [profile], now: 102)
    for band in 1...6 {
        let output = profile.encoders(for: band)[7]
        check(bank.state(for: profile).freshness(for: output.feedbackAddress!, now: 103) == .confirmed, "E8 réactualisé dans toutes les banques")
        check(output.valueScale!.display(bank.state(for: profile).values[output.feedbackAddress!]!) == "+9,0 dB", "valeur globale E8 correcte")
        check(bank.state(for: profile).freshness(for: profile.encoders(for: band)[0].feedbackAddress!, now: 103) == .stale, "retour E8 ne confirme pas les paramètres de bande")
    }
    check(!bank.observeSnapshotRecall(address: "/GlobalSnapshots/Name"), "liste des snapshots ne constitue pas un rappel")
    check(bank.observeSnapshotRecall(address: "/GlobalSnapshots/Recalled"), "notification de rappel documentée reconnue")
    for address in addresses {
        check(bank.state(for: profile).freshness(for: address, now: 103) == .stale, "snapshot invalide toutes les bandes et E8")
    }
    // Snapshot partiel : seules les valeurs réellement retransmises sont confirmées.
    for band in 1...6 {
        let address = profile.encoders(for: band)[2].feedbackAddress!
        bank.receive(address: address, value: .number(0.5), profiles: [profile], now: 104)
        check(bank.state(for: profile).freshness(for: address, now: 105) == .confirmed, "retour après snapshot réactualise la bonne bande")
        check(bank.state(for: profile).values[address] == .number(0.5), "nouvelle valeur snapshot conservée")
        check(bank.state(for: profile).freshness(for: address, now: 109) == .stale, "silence OSC : aucune garantie de connexion ou d’actualité")
    }
    bank.reset() // Reconnexion du récepteur / nouveau processus LP / arrêt.
    for address in addresses {
        check(bank.state(for: profile).freshness(for: address, now: 110) == .unknown, "reconnexion ne réutilise pas un ancien état")
        check(bank.state(for: profile).values[address] == nil, "session précédente purgée")
    }
    bank.receive(address: "/pluginlib/waves-f6/e8", value: .number(0.4), profiles: [profile], now: 111)
    check(bank.state(for: profile).freshness(for: "/pluginlib/waves-f6/e8", now: 112) == .confirmed, "premier retour après reconnexion confirmé")
    check(bank.state(for: profile).freshness(for: "/pluginlib/waves-f6/e8", now: 110) == .stale, "horloge incohérente ne confirme aucune valeur")
    // Exercer le même chemin OSC décodé que ControllerModel, y compris le bundle.
    func oscString(_ text: String) -> [UInt8] {
        var bytes = Array(text.utf8) + [0]
        while bytes.count % 4 != 0 { bytes.append(0) }
        return bytes
    }
    func message(_ address: String, number: Float? = nil) -> Data {
        var bytes = oscString(address) + oscString(number == nil ? "," : ",f")
        if let number {
            let bits = number.bitPattern
            bytes += [UInt8(truncatingIfNeeded: bits >> 24), UInt8(truncatingIfNeeded: bits >> 16), UInt8(truncatingIfNeeded: bits >> 8), UInt8(truncatingIfNeeded: bits)]
        }
        return Data(bytes)
    }
    let outputPacket = message("/pluginlib/waves-f6/e8", number: 0.5)
    let recallPacket = message("/GlobalSnapshots/Recalled")
    var bundle = Data(oscString("#bundle") + [0, 0, 0, 0, 0, 0, 0, 1])
    for packet in [outputPacket, recallPacket] {
        var size = UInt32(packet.count).bigEndian
        withUnsafeBytes(of: &size) { bundle.append(contentsOf: $0) }
        bundle.append(packet)
    }
    bank.receive(messages: try OSC.decode(bundle), profiles: [profile], now: 120)
    check(bank.state(for: profile).freshness(for: "/pluginlib/waves-f6/e8", now: 121) == .confirmed, "bundle snapshot : retour E8 du même paquet confirmé même avant notification")
    bank.receive(messages: try OSC.decode(recallPacket), profiles: [profile], now: 122)
    check(bank.state(for: profile).freshness(for: "/pluginlib/waves-f6/e8", now: 122) == .stale, "rappel sans retour : pas de confirmation fictive")
    bank.receive(messages: try OSC.decode(outputPacket), profiles: [profile], now: 123)
    check(bank.state(for: profile).values["/pluginlib/waves-f6/e8"] == .number(0.5), "mise à jour réelle après rappel")

}
