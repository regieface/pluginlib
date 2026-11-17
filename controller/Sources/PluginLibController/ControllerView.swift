import SwiftUI
import ControllerCore

struct ControllerView: View {
    @ObservedObject var model: ControllerModel
    private let neutral = Color(red: 0.55, green: 0.84, blue: 0.78)
    private func color(_ hex: String?) -> Color? {
        guard let hex, let rgb = ProfileColor(hex: hex) else { return nil }
        return Color(red: rgb.red, green: rgb.green, blue: rgb.blue)
    }
    private var accent: Color { color(model.activeAccentColor) ?? neutral }
    var body: some View {
        ScrollView(.vertical) {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Text("PluginLib Controller").font(.headline)
                Text(model.profile?.name ?? "Aucun plugin reconnu").foregroundColor(accent).lineLimit(1)
                if let banks = model.profile?.banks {
                    Menu(model.activeBank?.name ?? "Band") {
                        ForEach(banks) { bank in Button(bank.name) { model.selectBank(bank.id) } }
                    }.fixedSize()
                }
                Spacer(minLength: 8)
                Button(model.compact ? "Complet" : "Compact") { model.setCompact(!model.compact) }
                Menu("Écran ↓") {
                    ForEach(Array(model.screens.enumerated()), id: \.offset) { index, name in
                        Button(name) { model.onPlace?(index) }
                    }
                }.fixedSize()
                Menu("Options") {
                    Button(model.visualSyncEnabled ? "Désactiver la sélection visuelle F6" : "Activer la sélection visuelle F6") { model.setVisualSync(!model.visualSyncEnabled) }
                    Button("Repérer Band \(model.calibrationBand) sous le pointeur dans 4 s…") { model.captureVisualSelector() }.disabled(model.demo || model.calibrationPending)
                    Button("Effacer les calibrages visuels F6") { model.resetVisualCalibration() }
                    Button("Apprendre les six boutons de bande…") { model.startLearningBands() }.disabled(model.demo)
                    if model.learningBank != nil { Button("Annuler l’apprentissage") { model.cancelLearningBands() } }
                    Button(model.preparingProject ? "Préparation en cours…" : "Préparer les affectations F6…") { model.prepareLiveProfessorProject() }.disabled(model.preparingProject)
                    Button("Configurer les encodeurs…") { model.connectionSettings = true }
                    Button(model.bridgeEnabled ? "Suspendre les encodeurs → LiveProfessor" : "Activer les encodeurs → LiveProfessor") { model.toggleBridge() }.disabled(model.demo)
                    Button("Importer une demande PluginLib…") { model.importCollectionRequest() }
                    Button("Recharger les profils") { model.reloadProfiles() }
                    Button("Ouvrir les profils") { NSWorkspace.shared.open(model.profilesURL) }
                    Button("Autoriser l’accessibilité…") { model.requestPermission() }
                    Button(model.diagnostics ? "Masquer le diagnostic" : "Afficher le diagnostic") { model.diagnostics.toggle() }
                    if model.demo {
                        ForEach(Array(model.profiles.enumerated()), id: \.offset) { index, p in Button("Démo : \(p.name)") { model.selectDemo(index) } }
                    }
                    Divider()
                    Button("Quitter") { NSApp.terminate(nil) }
                }.fixedSize()
            }.buttonStyle(.bordered).controlSize(.small)
            if !model.demo && model.profile != nil && !model.targetConfirmed {
                Text("Profil mémorisé · cible non confirmée · routage en pause (\(model.selectionReason))")
                    .font(.caption).foregroundColor(.orange).frame(maxWidth: .infinity, alignment: .leading)
            }
            if !model.collectionImportStatus.isEmpty { Text(model.collectionImportStatus).font(.caption).textSelection(.enabled) }
            HStack(alignment: .top, spacing: 6) {
                ForEach(1...8, id: \.self) { index in
                    let control = model.activeEncoders.first(where: { $0.id == index }) ?? Control(id: index, name: "Unassigned")
                    let tint = color(control.color) ?? accent
                    VStack(spacing: 6) {
                        Text("E\(index)").font(.caption2).foregroundColor(.secondary)
                        if !model.compact {
                            ZStack {
                                Circle().stroke(tint.opacity(0.3), lineWidth: 5)
                                // Pas de position fictive sans valeur et domaine validés.
                                Image(systemName: "circle.dotted").foregroundColor(tint.opacity(0.9))
                            }.frame(width: 38, height: 38).accessibilityLabel("Encodeur \(index), position inconnue")
                        }
                        Text(control.name).font(.system(size: 12, weight: .medium)).lineLimit(2).multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, minHeight: 30)
                        Text(model.value(control)).font(.system(size: 15, weight: .semibold, design: .monospaced)).foregroundColor(tint).lineLimit(1).minimumScaleFactor(0.7)
                            .help("Dernier retour OSC uniquement. Inconnue : aucun retour. Périmée : cible non confirmée, interruption ou retour vieux de 5 s. Reçue par OSC : confirmée à réception, sans garantie de lecture continue.")
                        Text(model.valueFreshnessLabel(control)).font(.caption2)
                            .foregroundColor(model.valueFreshness(control) == .stale ? .orange : .secondary)
                    }.padding(.vertical, 7).frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.045)).cornerRadius(7)
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(tint.opacity(0.3), lineWidth: 1))
                }
            }
            if model.profile?.id == "waves-f6" {
                Text("Band \(model.selectedBank) · B16 On/Off : \(model.f6BypassLabel) · \(model.f6BypassNotice)")
                    .font(.caption).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !model.learningStatus.isEmpty {
                Text(model.learningStatus).font(.callout).foregroundColor(accent).frame(maxWidth: .infinity, alignment: .leading)
            }
            if model.visualSyncProblem {
                Text(model.visualSyncStatus).font(.caption).foregroundColor(.orange).frame(maxWidth: .infinity, alignment: .leading)
            }
            if !model.compact {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 8), spacing: 6) {
                    ForEach(1...16, id: \.self) { index in
                        let control = model.profile?.buttons.first(where: { $0.id == index }) ?? Control(id: index, name: "Unassigned")
                        let tint = color(control.color) ?? accent
                        let selected = control.selectBank == model.selectedBank
                        Button { if let bank = control.selectBank { model.selectBank(bank) } } label: { VStack(spacing: 4) {
                            Text("B\(index)").font(.caption2).foregroundColor(.secondary)
                            Text(index == 16 && model.profile?.id == "waves-f6" ? "Band \(model.selectedBank) On/Off" : control.name).font(.system(size: 11)).lineLimit(2)
                            Text(index == 16 && model.profile?.id == "waves-f6" ? model.f6BypassLabel : model.value(control)).font(.caption.monospaced()).foregroundColor(tint)
                        }.frame(maxWidth: .infinity, minHeight: 53).padding(4)
                            .background(selected ? tint.opacity(0.2) : Color.white.opacity(0.055)).cornerRadius(5)
                            .overlay(RoundedRectangle(cornerRadius: 5).stroke(selected ? tint : .clear, lineWidth: 2))
                        }.buttonStyle(.plain).disabled(control.selectBank == nil)
                    }
                }
            }
            HStack {
                Circle().fill(!model.targetConfirmed && !model.demo ? Color.orange : accent).frame(width: 6, height: 6)
                Text(model.profileError ?? model.status).lineLimit(1)
                Spacer()
                Text("\(model.bridgeEnabled ? model.bridgeStatus : model.midiStatus) · \(model.oscStatus)").foregroundColor(.secondary).lineLimit(1)
            }.font(.system(size: 10))
            if model.diagnostics {
                Text("MIDI MC · \(model.midiByteCount) octets reçus · Derniers octets : \(model.lastMIDI)")
                    .font(.system(size: 11, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                Text("\(model.lastMovement) · \(model.forwardedCount) messages transmis à LP\nOSC : \(model.oscCount) messages · \(model.lastOSC)")
                    .font(.system(size: 11, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                if !model.visualSyncStatus.isEmpty {
                    Text(model.visualSyncStatus).font(.system(size: 11)).frame(maxWidth: .infinity, alignment: .leading)
                }
                Text("Fenêtre AX : \(model.windowTitle.isEmpty ? "—" : model.windowTitle)\nProfil mémorisé : \(model.profile?.id ?? "—") · Cible confirmée : \(model.targetConfirmed ? "oui" : "non") · Raison : \(model.selectionReason) · Lectures AX : \(model.pollCount)\nUnités selon l’échelle du profil ; diagnostic OSC brut ; — = retour inconnu. Lecture AX à 2 Hz.")
                    .font(.system(size: 11, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
            }
        }.padding(12)
        }.background(Color(red: 0.10, green: 0.12, blue: 0.15)).foregroundColor(.white)
            .overlay(alignment: .top) { Rectangle().fill(accent).frame(height: 3).allowsHitTesting(false) }
            .preferredColorScheme(.dark).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .sheet(isPresented: $model.connectionSettings) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("F6 · \(model.activeBank?.name ?? "Band 1")").font(.headline)
                    Text("Options → Préparer les affectations F6 crée une copie du projet avec les six banques MIDI/OSC. Ouvre la copie dans LP, puis utilise Apprendre les six boutons de bande. Chaque bouton choisit une banque de paramètres et sa couleur dans Controller. OUT reste global.")
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(model.activeEncoders.isEmpty ? (model.profiles.first(where: { $0.id == "waves-f6" })?.encoders ?? []) : model.activeEncoders) { control in
                            HStack {
                                Text("E\(control.id)").frame(width: 25, alignment: .leading)
                                Text(control.hostParameter ?? control.name).frame(width: 130, alignment: .leading)
                                Text(control.feedbackAddress ?? "—").font(.system(size: 11, design: .monospaced))
                            }
                        }
                    }
                    Text("Le contrôleur OSC utilise 127.0.0.1 et le port de sortie ci-dessous. Son entrée doit rester sur un autre port libre, par exemple 9000. Les valeurs sans échelle vérifiée portent la mention « brut ».")
                    HStack {
                        Text("Port de réception OSC")
                        TextField("9001", text: $model.oscPortText).frame(width: 85)
                        Button("Appliquer") { model.restartOSC() }
                    }
                    Text(model.oscStatus).font(.caption)
                    Text("Active ensuite les encodeurs dans Options, puis reviens dans F6. La liaison se met en pause hors de F6. Masquer ou quitter Controller la désactive. — indique qu’aucun retour du paramètre n’a encore été reçu.").font(.callout)
                    Button("Fermer") { model.connectionSettings = false }.frame(maxWidth: .infinity, alignment: .trailing)
                }.padding(24).frame(width: 550).textSelection(.enabled)
            }
    }
}
