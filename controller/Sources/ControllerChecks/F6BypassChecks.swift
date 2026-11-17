import Foundation
import ControllerCore

func checkF6Bypass() throws {
    func event(_ band: Int, _ value: Float) throws -> [OSCMessage] {
        var bytes = Array(F6BandBypass.address(band).utf8) + [0]
        while bytes.count % 4 != 0 { bytes.append(0) }
        bytes += [44, 102, 0, 0]
        let b = value.bitPattern
        bytes += [UInt8(b >> 24), UInt8((b >> 16) & 255), UInt8((b >> 8) & 255), UInt8(b & 255)]
        return try OSC.decode(Data(bytes))
    }
    let down: [UInt8] = [0x90,95,127], up: [UInt8] = [0x90,95,0]
    var b = F6BandBypass()
    check(b.label(band: 1, now: 10) == "État inconnu", "B16 état initial inconnu")
    check(b.press(down, band: 1, allowed: true, now: 10) == nil, "B16 premier appui sans relâchement refusé")
    _ = b.press(up, band: 1, allowed: true, now: 10)
    check(b.press(down, band: 1, allowed: true, now: 10) == nil, "B16 inconnu ne bascule jamais")
    for band in 1...6 {
        b.receive(try event(band, 1), now: 10)
        _ = b.press(up, band: band, allowed: true, now: 10)
        let command = b.press(down, band: band, allowed: true, now: 10)!
        check(command.band == band && !command.enabled, "B16 vise seulement la bande choisie")
        let decoded = try OSC.decode(command.packet)
        check(decoded.count == 1 && decoded[0].address == F6BandBypass.address(band) && decoded[0].values == [.number(0)], "commande absolue OSC conforme à la polarité")
        check(b.label(band: band, now: 10) == "Commande émise · attente OSC", "pas de confirmation optimiste")
        check(b.press(down, band: band % 6 + 1, allowed: true, now: 10) == nil, "maintien avec changement de banque ne réémet pas")
        _ = b.press(up, band: band, allowed: true, now: 10)
        check(b.press(down, band: band, allowed: true, now: 10) == nil, "second appui bloqué en attente du retour")
        b.receive(try event(band, 1), now: 10)
        check(b.label(band: band, now: 10) == "Commande émise · attente OSC", "ancien retour ne débloque pas la commande")
        b.receive(try event(band, 0), now: 10)
        check(b.label(band: band, now: 10) == "Désactivée", "seul le retour confirme Off")
        _ = b.press([0x80,95,0], band: band, allowed: true, now: 10)
        check(b.press(down, band: band, allowed: true, now: 10)?.enabled == true, "bascule inverse après relâchement Note Off")
        b.receive(try event(band, 1), now: 10)
    }
    check(b.label(band: 1, now: 15) == "État périmé", "retour ancien ne confirme pas état actuel")
    _ = b.press(up, band: 1, allowed: true, now: 15)
    check(b.press(down, band: 1, allowed: true, now: 15) == nil, "bascule interdite sur état périmé")
    b.receive(try event(1, 1), now: 20)
    _ = b.press(up, band: 1, allowed: false, now: 20)
    check(b.press(down, band: 1, allowed: false, now: 20) == nil, "garde AX/routage refuse B16")
    check(b.press(down, band: 1, allowed: true, now: 20) == nil, "retour de cible pendant maintien ne réarme pas")
    b.invalidate(reconnect: true)
    b.receive(try event(1, 1), now: 20)
    check(b.press(down, band: 1, allowed: true, now: 20) == nil, "reconnexion nécessite relâchement")
    _ = b.press(up, band: 1, allowed: true, now: 20)
    b.receive(try event(1, 0.5), now: 20)
    check(b.label(band: 1, now: 20) == "État périmé", "retour non binaire invalide état")
    check(b.press(down, band: 1, allowed: true, now: 20) == nil, "aucun arrondi 0,5 vers On/Off")
    for message: [UInt8] in [[0x91,95,127], [0x90,94,127], [0xB0,95,127], [0x90,95], [0x90,95,1]] {
        _ = b.press(up, band: 1, allowed: true, now: 20)
        b.receive(try event(1, 1), now: 20)
        check(b.press(message, band: 1, allowed: true, now: 20) == nil, "seul appui B16 confirmé est accepté")
    }
    b.invalidate()
    check(b.label(band: 1, now: 20) == "État périmé", "perte de continuité périme On/Off")
    b.clear()
    check(b.label(band: 1) == "État inconnu", "arrêt purge les états")
}
