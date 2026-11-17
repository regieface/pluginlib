import Foundation
import ControllerCore

func checkSelectionState(root: URL) throws {
    let profiles = try Profiles.load(directory: root.appendingPathComponent("Profiles"))
    let f6 = profiles.first { $0.id == "waves-f6" }!
    let khs = profiles.first { $0.id == "khs-compressor" }!
    var state = ProfileSelectionState()
    check(state.loadedProfile == nil && state.confirmedProfileID == nil, "aucun profil inventé au démarrage")
    state.observe(f6)
    check(state.loadedProfile == f6 && state.confirmedProfileID == f6.id, "détection F6 charge et confirme séparément")
    for reason in ["AX erreur", "liste vide", "titre vide", "titre inconnu", "premier plan perdu", "fenêtre masquée"] {
        state.observe(nil)
        check(state.loadedProfile == f6 && state.confirmedProfileID == nil, "\(reason) conserve la vue mais retire toute identité de routage")
        check(!BridgeGate.allows(armed: true, running: true, demo: false, profileID: state.confirmedProfileID, hostIsFrontmost: true, snapshotAge: 0), "\(reason) ne route jamais le profil mémorisé")
    }
    state.observe(f6)
    check(state.confirmedProfileID == f6.id, "reprise sur preuve fraîche sans délai arbitraire")
    state.observe(khs)
    check(state.loadedProfile == khs && state.confirmedProfileID == khs.id, "vrai changement reconnu remplace immédiatement F6")
    check(!BridgeGate.allows(armed: true, running: true, demo: false, profileID: state.confirmedProfileID, hostIsFrontmost: true, snapshotAge: 0), "autre plugin reconnu ne conserve pas le routage F6")
    let unknown = WindowSelection.select(orderedTitles: ["Dialogue", "F6 (m)UI"], profiles: profiles)
    state.observe(unknown.profile)
    check(state.loadedProfile == khs && state.confirmedProfileID == nil, "aucun repli sur F6 derrière une fenêtre inconnue")
    state.refreshLoadedProfile(f6)
    check(state.loadedProfile == khs && state.confirmedProfileID == nil, "actualisation de configuration ne change pas le plugin mémorisé ni sa confirmation")
    state.invalidate()
    check(state.loadedProfile == khs && state.confirmedProfileID == nil, "arrêt invalide la cible sans effacer la présentation")
    state.reset()
    check(state.loadedProfile == nil && state.confirmedProfileID == nil, "rechargement explicite supprime le profil périmé")
}
