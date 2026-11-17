import AppKit
import SwiftUI
import ControllerCore

@MainActor final class ControllerModel: ObservableObject {
    @Published var profile: Profile?
    private var selectionState = ProfileSelectionState()
    private var midiCapture = MIDICapture()
    private var f6Bypass = F6BandBypass()
    @Published private(set) var f6BypassNotice = "Relâcher B16 avant le premier appui"
    var f6BypassLabel: String { f6Bypass.label(band: selectedBank) }
    @Published private(set) var selectionReason = "initial"
    @Published private(set) var targetConfirmed = false
    private var selectionTrace: [[String: Any]] = []
    private var lastSelectionSignature = ""
    private var lastTracedConfirmed = ""
    private var lastTracedLoaded = ""
    private var lastProbe: [String: Any] = [:]
    private var detectionGeneration = 0
    @Published var status = "Initialisation…"
    @Published var windowTitle = ""
    @Published private(set) var pollCount = 0
    @Published var compact = UserDefaults.standard.object(forKey: "controller.compact") as? Bool ?? true
    @Published var diagnostics = false
    @Published var demo = false
    @Published var profileError: String?
    @Published var midiStatus = "MIDI arrêté"
    @Published private(set) var midiByteCount = 0
    @Published private(set) var lastMIDI = "—"
    @Published private(set) var bridgeEnabled = false
    @Published private(set) var forwardedCount = 0
    @Published private(set) var forwardedEncoders: [Int: Int] = [:]
    @Published private(set) var lastMovement = "—"
    @Published var oscStatus = "OSC arrêté"
    @Published private(set) var oscCount = 0
    @Published private(set) var lastOSC = "—"
    @Published var connectionSettings = false
    @Published var preparingProject = false
    @Published private(set) var selectedBank = 1
    @Published private(set) var learningBank: Int?
    @Published private(set) var learningStatus = ""
    @Published private(set) var visualSyncStatus = ""
    @Published private(set) var visualSyncProblem = false
    @Published private(set) var visualSyncEnabled = UserDefaults.standard.object(forKey: "controller.visualBandSync") as? Bool ?? true
    @Published private(set) var calibrationBand = 1
    @Published private(set) var calibrationPending = false
    private var calibrationPoints: [CGPoint] = []
    private var calibrationSize: CGSize?
    private var calibrationPID: pid_t?
    private var calibrationGeneration = 0
    private var visualCoordinates = ""
    private var visualCalibrations: [BandSelectorCalibration] = {
        guard let data = UserDefaults.standard.data(forKey: "controller.f6VisualCalibrations.v1") else { return [] }
        return (try? JSONDecoder().decode([BandSelectorCalibration].self, from: data)) ?? []
    }()
    private let visualQueue = DispatchQueue(label: "PluginLibController.visualSelection", qos: .utility)
    private var visualGeneration = 0
    private var lastVisualBand: Int?
    private var lastVisualTime: TimeInterval = 0
    private var rememberedBanks: [String: Int] = [:]
    private var learningButtons: [String: [String: Int]] = [:]
    var activeEncoders: [Control] { profile?.encoders(for: selectedBank) ?? [] }
    var activeBank: ControlBank? { profile?.banks?.first { $0.id == selectedBank } }
    var activeAccentColor: String? { activeBank?.accentColor ?? profile?.accentColor }
    @Published var oscPortText = String(UserDefaults.standard.object(forKey: "controller.oscPort") as? Int ?? 9001)
    private let midi = MIDIReceiver()
    private let osc = OSCReceiver()
    private var midiStream = MIDIStream()
    private var lastAXTime: TimeInterval = 0
    private var running = false
    var profiles: [Profile] = []
    @Published var feedback = FeedbackState()
    private var feedbackBank = FeedbackBank()
    private var lastHostPID: pid_t?
    var onModeChange: ((Bool) -> Void)?
    var onPlace: ((Int) -> Void)?
    var screens: [String] { NSScreen.screens.map(\.localizedName) }
    private var timer: Timer?
    private var busy = false
    private let queue = DispatchQueue(label: "PluginLibController.accessibility", qos: .utility)
    private let probe = AccessibilityProbe()
    let profilesURL: URL
    init(demo: Bool) {
        self.demo = demo
        let args = CommandLine.arguments
        if let index = args.firstIndex(of: "--profiles"), index + 1 < args.count {
            profilesURL = URL(fileURLWithPath: args[index + 1], isDirectory: true)
            UserDefaults.standard.set(profilesURL.path, forKey: "controller.profilesDirectory")
        } else if let saved = UserDefaults.standard.string(forKey: "controller.profilesDirectory"), FileManager.default.fileExists(atPath: saved) {
            profilesURL = URL(fileURLWithPath: saved, isDirectory: true)
        } else if let resources = Bundle.main.resourceURL, FileManager.default.fileExists(atPath: resources.appendingPathComponent("Profiles").path) {
            profilesURL = resources.appendingPathComponent("Profiles")
        } else {
            profilesURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Profiles")
        }
        reloadProfiles()
        midi.onStatus = { [weak self] status in
            guard let self else { return }
            if self.midiStatus != status {
                self.midiStream = MIDIStream(); self.bridgeEnabled = false
                self.f6Bypass.invalidate(reconnect: true)
                self.feedbackBank.markStale()
                self.feedback = self.feedbackBank.state(for: self.profile)
            }
            self.midiStatus = status
        }
        midi.onBytes = { [weak self] bytes in
            guard let self, self.running else { return }
            self.midiByteCount += bytes.count
            self.lastMIDI = bytes.suffix(24).map { String(format: "%02X", $0) }.joined(separator: " ")
            for message in self.midiStream.receive(bytes) {
                if CommandLine.arguments.contains("--diagnostics-file") {
                    self.midiCapture.record(message, uptime: ProcessInfo.processInfo.systemUptime)
                }
                if F6BandBypass.isButton(message) {
                    let collision = self.profile?.buttons.contains { $0.selectBank != nil && $0.midi?.message == .note && $0.midi?.channel == 1 && $0.midi?.number == 95 } == true
                    let allowed = self.bridgeEnabled && self.canForward && self.windowTitle == "F6 (m)UI" && self.profile?.id == "waves-f6" && self.learningBank == nil && !collision
                    if let command = self.f6Bypass.press(message, band: self.selectedBank, allowed: allowed) {
                        if self.osc.sendF6(command.packet) {
                            self.f6BypassNotice = "Band \(command.band) : commande émise, attente du retour OSC"
                        } else {
                            self.f6Bypass.invalidate()
                            self.f6BypassNotice = "Envoi OSC refusé"
                        }
                    } else if message == [0x90, 95, 127] {
                        self.f6BypassNotice = collision ? "B16 déjà affecté à une sélection : bascule bloquée" : (allowed ? self.f6BypassLabel : "B16 en pause · cible ou routage non confirmé")
                    }
                    if self.profile?.id == "waves-f6" || self.learningBank != nil { continue }
                }
                if self.learningBank != nil { self.learnBandButton(message); continue }
                if self.canForward, let bank = MIDIStream.selectedBank(message, profile: self.profile) {
                    self.selectBank(bank); continue
                }
                guard let movement = MIDIStream.encoderMovement(message) else { continue }
                self.lastMovement = "E\(movement.id) : \(movement.delta > 0 ? "+" : "")\(movement.delta)"
                if self.bridgeEnabled && self.canForward,
                   let routed = MIDIStream.routedEncoder(message, profile: self.profile, bank: self.selectedBank), self.midi.forward(routed) {
                    self.forwardedCount += 1
                    self.forwardedEncoders[movement.id, default: 0] += 1
                }
            }
            self.writeDiagnostic()
        }
        osc.onData = { [weak self] in self?.receiveOSC($0) }
    }
    // Résolution explicite depuis Ma collection ; ne change ni la sélection AX ni le routage.
    func loadCollectionConfiguration(pluginId: String, licenseStatus: String,
                                     variant: ProfileVariantRequest) throws -> ResolvedProfileConfiguration {
        try CollectionProfileLoader.load(pluginId: pluginId, licenseStatus: licenseStatus,
                                         root: profilesURL.deletingLastPathComponent(), variant: variant)
    }
    @Published private(set) var collectionImportStatus = ""
    private(set) var importedConfiguration: ResolvedProfileConfiguration?
    func importCollectionRequest() {
        let panel = NSOpenPanel()
        panel.title = "Importer une demande PluginLib"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let file = panel.url else { return }
        // Toute tentative explicite suspend le routage, sans démarrer de transport.
        bridgeEnabled = false
        visualGeneration &+= 1
        importedConfiguration = nil
        do {
            let configuration = try CollectionLoadRequest.load(file: file, root: profilesURL.deletingLastPathComponent())
            importedConfiguration = configuration
            collectionImportStatus = "Configuration importée : \(configuration.profile.name) · \(configuration.variant.host.pluginName). Ouvrir sa fenêtre dans LiveProfessor; routage désactivé."
        } catch {
            collectionImportStatus = "Import refusé : \(error.localizedDescription) (\(error))"
        }
    }
    func reloadProfiles() {
        visualGeneration &+= 1
        do { profiles = try Profiles.load(directory: profilesURL); profileError = nil }
        catch { profiles = []; profileError = error.localizedDescription }
        restoreLearnedButtons()
        detectionGeneration &+= 1; busy = false
        selectionState.reset(); profile = nil; lastAXTime = 0
        traceSelection("profilesReloaded")
        clearFeedback()
        if demo { selectDemo(0) }
    }
    func start() {
        if running { tick(); return }
        stop()
        running = true
        if !demo { midi.start(); restartOSC() }
        tick()
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common); timer = t
    }
    func stop() {
        detectionGeneration &+= 1; busy = false
        selectionState.invalidate()
        visualGeneration &+= 1
        learningBank = nil
        running = false; bridgeEnabled = false; lastAXTime = 0; midiStream = MIDIStream()
        timer?.invalidate(); timer = nil; midi.stop(); osc.stop()
        midiStatus = "MIDI arrêté"; oscStatus = "OSC arrêté"
        clearFeedback()
        traceSelection("controllerStopped")
    }
    private func clearFeedback() { feedbackBank.reset(); feedback = FeedbackState(); f6Bypass.clear() }
    private var canForward: Bool {
        BridgeGate.allows(armed: true, running: running, demo: demo, profileID: selectionState.confirmedProfileID == profile?.id ? selectionState.confirmedProfileID : nil,
                          hostIsFrontmost: NSWorkspace.shared.frontmostApplication?.bundleIdentifier == AccessibilityProbe.hostID,
                          snapshotAge: lastAXTime > 0 ? ProcessInfo.processInfo.systemUptime - lastAXTime : .infinity)
    }
    var bridgeStatus: String {
        guard bridgeEnabled else { return "Encodeurs + B16 → LP désactivés" }
        return canForward ? "Encodeurs + B16 → LP actifs" : "Encodeurs + B16 → LP en pause · \(selectionReason)"
    }
    func toggleBridge() {
        guard !demo, midi.bridgeAvailable else { midiStatus = "Port MIDI virtuel indisponible"; return }
        bridgeEnabled.toggle()
    }
    func restartOSC() {
        osc.stop(); clearFeedback()
        guard running, !demo else { return }
        guard let port = UInt16(oscPortText), port > 0 else { oscStatus = "Port OSC invalide (1–65535)"; return }
        do {
            try osc.start(port: port)
            UserDefaults.standard.set(Int(port), forKey: "controller.oscPort")
            oscStatus = "OSC 127.0.0.1:\(port) · écoute"
        } catch { oscStatus = "OSC indisponible : \(error.localizedDescription)" }
    }
    private func receiveOSC(_ data: Data) {
        guard running, !demo else { return }
        guard let messages = try? OSC.decode(data) else { lastOSC = "Paquet OSC non pris en charge"; return }
        for message in messages {
            oscCount += 1
            lastOSC = message.address + " " + message.values.map(\.display).joined(separator: " · ")
        }
        // Le retour est la seule source des valeurs affichées, jamais les pas MC.
        f6Bypass.receive(messages)
        feedbackBank.receive(messages: messages, profiles: profiles)
        feedback = feedbackBank.state(for: profile)
        writeDiagnostic()
    }
    func setCompact(_ value: Bool) {
        compact = value; UserDefaults.standard.set(value, forKey: "controller.compact"); onModeChange?(value)
    }
    func requestPermission() {
        _ = AccessibilityProbe.trusted(prompt: true)
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") { NSWorkspace.shared.open(url) }
    }
    func selectDemo(_ index: Int) {
        guard profiles.indices.contains(index) else { return }
        profile = profiles[index]; windowTitle = profile?.windowTitles.first ?? ""; status = "DÉMO · aucune liaison avec LiveProfessor"
        selectedBank = rememberedBanks[profile?.id ?? ""] ?? profile?.banks?.first?.id ?? 1
        feedback = feedbackBank.state(for: profile)
    }
    private func tick() {
        pollCount += 1
        guard !demo else { return }
        expireSelectionIfNeeded(now: ProcessInfo.processInfo.systemUptime)
        guard !busy else { return }
        busy = true
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let host = NSRunningApplication.runningApplications(withBundleIdentifier: AccessibilityProbe.hostID).first?.processIdentifier
        if host != lastHostPID {
            clearFeedback(); bridgeEnabled = false; lastHostPID = host
            selectionState.invalidate(); lastAXTime = 0
            visualGeneration &+= 1
            traceSelection("hostProcessChanged")
        }
        let generation = detectionGeneration
        queue.async { [weak self, probe] in
            let result = probe.read(frontmostPID: front, hostPID: host)
            DispatchQueue.main.async { self?.apply(result, generation: generation) }
        }
    }
    private func expireSelectionIfNeeded(now: TimeInterval) {
        if selectionState.confirmedProfileID != nil && lastAXTime > 0 && now - lastAXTime >= 0.8 {
            selectionState.invalidate(); lastAXTime = 0; visualGeneration &+= 1
            traceSelection("snapshotExpired")
        }
    }
    private func apply(_ snapshot: ProbeResult, generation: Int? = nil) {
        // Un ancien sondage ne peut pas réarmer un suivi arrêté/rechargé/redémarré.
        if let generation, generation != detectionGeneration { return }
        guard running, !demo else { busy = false; return }
        busy = false
        var result = snapshot
        let front = NSWorkspace.shared.frontmostApplication
        if result.hostIsFrontmost && (front?.bundleIdentifier != AccessibilityProbe.hostID ||
            (result.hostPID != nil && front?.processIdentifier != result.hostPID)) {
            result.hostIsFrontmost = false; result.reason = "frontmostChangedDuringPoll"
            result.status = "Premier plan changé pendant la lecture AX"
        }
        let age = ProcessInfo.processInfo.systemUptime - result.sampledAt
        let fresh = result.sampledAt > 0 && age >= 0 && age < 0.8
        let eligible = result.hostIsFrontmost && !result.minimized && fresh
        let selection = WindowSelection.select(orderedTitles: eligible ? result.orderedTitles : [], profiles: profiles)
        let previous = selectionState.confirmedProfileID
        selectionState.observe(selection.profile)
        if previous != selectionState.confirmedProfileID { visualGeneration &+= 1 }
        let changedProfile = profile?.id != selectionState.loadedProfile?.id
        profile = selectionState.loadedProfile
        windowTitle = result.orderedTitles.first ?? ""
        if changedProfile { selectedBank = rememberedBanks[profile?.id ?? ""] ?? profile?.banks?.first?.id ?? 1 }
        feedback = feedbackBank.state(for: profile)
        lastAXTime = selection.profile != nil ? result.sampledAt : 0
        var reason = result.reason
        if !fresh && result.hostIsFrontmost { reason = "stalePoll" }
        else if eligible && selection.profile == nil { reason = result.orderedTitles.first?.isEmpty == false ? "unrecognizedFirstWindow" : result.reason }
        else if selection.profile != nil { reason = "targetConfirmed" }
        status = selection.profile == nil ? "Routage en pause · profil mémorisé · \(result.status)" : result.status
        lastProbe = ["reason": result.reason, "readReason": snapshot.reason, "hostPID": result.hostPID ?? -1,
                     "frontmostPIDAtRead": result.frontmostPID ?? -1,
                     "frontmostPIDAtApply": front?.processIdentifier ?? -1,
                     "windowsAX": result.windowsAX ?? -1, "titleAX": result.titleAX ?? -1,
                     "firstTitle": result.orderedTitles.first ?? "", "focusedTitle": result.focusedTitle,
                     "focusedAX": result.focusedAX ?? -1, "minimized": result.minimized,
                     "sampleAge": age, "generation": generation ?? detectionGeneration]
        traceSelection(reason)
        writeDiagnostic()
    }
    private func traceSelection(_ reason: String) {
        selectionReason = reason
        targetConfirmed = selectionState.confirmedProfileID != nil
        if lastTracedConfirmed != selectionState.confirmedProfileID,
           !lastTracedConfirmed.isEmpty {
            f6Bypass.invalidate()
            feedbackBank.markStale(profileID: lastTracedConfirmed)
            feedback = feedbackBank.state(for: profile)
        }
        let signature = "\(reason)|\(selectionState.confirmedProfileID ?? "")|\(profile?.id ?? "")|\(windowTitle)"
        guard signature != lastSelectionSignature else { return }
        lastSelectionSignature = signature
        let entry: [String: Any] = ["time": ISO8601DateFormatter().string(from: Date()),
            "poll": pollCount, "reason": reason, "loadedProfile": profile?.id ?? "",
            "profilesDirectory": profilesURL.path,
                                   "activeEncoderMappings": activeEncoders.map { control -> [String: Any] in
                                       ["encoder": control.id, "parameter": control.hostParameter ?? "",
                                        "destinationCC": control.midi?.number ?? -1,
                                        "feedbackAddress": control.feedbackAddress ?? "",
                                        "unit": control.valueScale?.unit ?? ""]
                                   },
                                   "activeButtonMappings": (profile?.buttons ?? []).map { control -> [String: Any] in
                                       ["slot": control.id, "name": control.name, "selectBank": control.selectBank ?? 0,
                                        "message": control.midi?.message.rawValue ?? "",
                                        "channel": control.midi?.channel ?? -1, "number": control.midi?.number ?? -1]
                                   },
                                   "f6BandBypassCapability": "B16 press only; OSC absolute; fresh feedback required",
                                   "f6BandOnOffState": f6BypassLabel,
                                   "confirmedProfile": selectionState.confirmedProfileID ?? "", "lastProbe": lastProbe,
            "previousConfirmedProfile": lastTracedConfirmed, "previousLoadedProfile": lastTracedLoaded,
            "liveHostPID": lastHostPID ?? -1]
        lastTracedConfirmed = selectionState.confirmedProfileID ?? ""
        lastTracedLoaded = profile?.id ?? ""
        selectionTrace.append(entry)
        if selectionTrace.count > 100 { selectionTrace.removeFirst(selectionTrace.count - 100) }
        // La console conserve chaque transition même sans --diagnostics-file.
        if let data = try? JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) { NSLog("PLC sélection %@", text) }
        writeDiagnostic()
    }
    private func writeDiagnostic() {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: "--diagnostics-file"), index + 1 < args.count else { return }
        let report: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier, "pollCount": pollCount,
                                   "status": status, "windowTitle": windowTitle, "profile": profile?.id ?? "",
                                   "profilesDirectory": profilesURL.path,
                                   "activeEncoderMappings": activeEncoders.map { control -> [String: Any] in
                                       ["encoder": control.id, "parameter": control.hostParameter ?? "",
                                        "destinationCC": control.midi?.number ?? -1,
                                        "feedbackAddress": control.feedbackAddress ?? "",
                                        "unit": control.valueScale?.unit ?? ""]
                                   },
                                   "activeButtonMappings": (profile?.buttons ?? []).map { control -> [String: Any] in
                                       ["slot": control.id, "name": control.name, "selectBank": control.selectBank ?? 0,
                                        "message": control.midi?.message.rawValue ?? "",
                                        "channel": control.midi?.channel ?? -1, "number": control.midi?.number ?? -1]
                                   },
                                   "f6BandBypassCapability": "B16 press only; OSC absolute; fresh feedback required",
                                   "f6BandOnOffState": f6BypassLabel,
                                   "confirmedProfile": selectionState.confirmedProfileID ?? "",
                                   "selectionReason": selectionReason, "selectionTrace": selectionTrace, "lastProbe": lastProbe,
                                   "trustedPreflight": AccessibilityProbe.trusted(), "executable": Bundle.main.executablePath ?? "",
                                   "midiStatus": midiStatus, "midiByteCount": midiByteCount, "lastMIDI": lastMIDI,
                                   "midiCaptureTotal": midiCapture.total,
                                   "midiCapture": midiCapture.events.map { ["uptime": $0.uptime, "bytes": $0.bytes] as [String: Any] },
                                   "bridgeEnabled": bridgeEnabled, "forwardedCount": forwardedCount,
                                   "selectedBank": selectedBank, "learningBank": learningBank ?? 0, "learningStatus": learningStatus,
                                   "visualCoordinates": visualCoordinates, "visualSyncEnabled": visualSyncEnabled, "visualSyncStatus": visualSyncStatus,
                                   "forwardedEncoders": Dictionary(uniqueKeysWithValues: forwardedEncoders.map { ("E\($0.key)", $0.value) }),
                                   "oscStatus": oscStatus, "oscCount": oscCount, "lastOSC": lastOSC,
                                   "feedbackReadCapability": "changeFeedbackOnly; initialReadUnconfirmed",
                                   "displayedValueStates": Dictionary(uniqueKeysWithValues: activeEncoders.map { ("E\($0.id)", valueFreshness($0).rawValue) }),
                                   "displayedValues": Dictionary(uniqueKeysWithValues: activeEncoders.map { ("E\($0.id)", value($0)) })]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: args[index + 1]), options: .atomic)
        }
    }
    func acceptFeedback(_ event: FeedbackEvent) {
        feedbackBank.receive(event, profiles: profiles)
        feedback = feedbackBank.state(for: profile)
    }
    // Régression : quitter F6 suspend les envois sans perdre la demande
    // d’activation, notamment pendant l’utilisation du menu Options.
    func checkActivationLifecycle() -> Bool {
        guard let f6 = profiles.first(where: { $0.id == "waves-f6" }) else { return false }
        // Les choix locaux restent affichés quelle que soit la taille F6.
        // running=false empêche tout clic ou transport pendant ce test synthétique.
        profile = f6
        let output = f6.encoders.first { $0.id == 8 }!
        acceptFeedback(FeedbackEvent(profileID: f6.id, address: output.feedbackAddress!, value: .number(0.75)))
        var bankDisplay = true
        for band in 1...6 {
            selectBank(band)
            let resized = CGRect(x: -100, y: 50, width: 1203, height: 903)
            bankDisplay = bankDisplay && selectedBank == band && activeBank?.id == band &&
                activeEncoders.first?.hostParameter == "Band \(band) Freq" &&
                activeEncoders.last == output && value(output) == "+9,0 dB" &&
                resized.width > 0 // aucune dépendance du contrôle MIDI à la géométrie visuelle
        }
        running = true; profile = f6; windowTitle = f6.windowTitles[0]; bridgeEnabled = true
        selectionState.observe(f6)
        apply(ProbeResult(status: "Autre application", reason: "hostNotFrontmost"))
        let paused = bridgeEnabled && profile?.id == f6.id && !targetConfirmed && !canForward
        var transientLosses = true
        for reason in ["windowsReadFailed", "windowsEmpty", "titleReadFailed", "titleEmpty", "windowMinimized"] {
            selectionState.observe(f6)
            apply(ProbeResult(status: reason, reason: reason))
            transientLosses = transientLosses && profile?.id == f6.id && activeEncoders.count == 8 &&
                !targetConfirmed && !canForward && selectedBank == 6 && selectionReason == reason
        }
        // Un résultat d’avant stop/reload ne doit pas rétablir une cible.
        apply(ProbeResult(status: "Ancien résultat", orderedTitles: ["F6 (m)UI"], hostIsFrontmost: true,
                          sampledAt: ProcessInfo.processInfo.systemUptime), generation: detectionGeneration - 1)
        transientLosses = transientLosses && !targetConfirmed && selectionReason == "windowMinimized"
        selectionState.observe(f6); lastAXTime = 1
        expireSelectionIfNeeded(now: 2)
        transientLosses = transientLosses && selectionReason == "snapshotExpired" &&
            !targetConfirmed && !canForward && activeEncoders.count == 8
        // Paquet réel reçu pendant qu’aucun plugin n’est au premier plan.
        var packet = Array("/pluginlib/waves-f6/e1".utf8) + [0]
        while packet.count % 4 != 0 { packet.append(0) }
        packet += [44, 102, 0, 0, 0x3F, 0x40, 0, 0] // ,f 0.75
        receiveOSC(Data(packet))
        let hidden = !targetConfirmed && !canForward
        profile = f6; feedback = feedbackBank.state(for: profile)
        let restored = value(f6.encoders.first { $0.hostParameter == "Band 1 Gain" }!) == "+9,0 dB"
        let gain = f6.encoders.first { $0.hostParameter == "Band 1 Gain" }!
        var freshnessChecks = valueFreshness(gain) == .stale && valueFreshnessLabel(gain) == "Périmée"
        selectionState.observe(f6); traceSelection("targetConfirmed")
        selectionState.invalidate(); traceSelection("hostNotFrontmost")
        selectionState.observe(f6); traceSelection("targetConfirmed")
        // La reprise de cible n’est pas une lecture des paramètres.
        freshnessChecks = freshnessChecks && valueFreshness(gain) == .stale
        receiveOSC(Data(packet))
        freshnessChecks = freshnessChecks && valueFreshness(gain) == .confirmed
        var recall = Array("/GlobalSnapshots/Recalled".utf8) + [0]
        while recall.count % 4 != 0 { recall.append(0) }
        recall += [44, 0, 0, 0]
        receiveOSC(Data(recall))
        freshnessChecks = freshnessChecks && valueFreshness(gain) == .stale && value(gain) == "+9,0 dB"
        stop()
        freshnessChecks = freshnessChecks && valueFreshness(gain) == .unknown && value(gain) == "—"
        return freshnessChecks && transientLosses && bankDisplay && paused && hidden && restored && !bridgeEnabled && !canForward && feedbackBank.state(for: f6).values.isEmpty
    }
    func valueFreshness(_ control: Control) -> FeedbackFreshness {
        guard let address = control.feedbackAddress else { return .unknown }
        let state = feedback.freshness(for: address)
        return state == .confirmed && !demo && !targetConfirmed ? .stale : state
    }
    func valueFreshnessLabel(_ control: Control) -> String {
        switch valueFreshness(control) {
        case .unknown: return "Inconnue"
        case .confirmed: return "Reçue par OSC"
        case .stale: return "Périmée"
        }
    }
    func value(_ control: Control) -> String {
        if let target = control.selectBank { return target == selectedBank ? "Selected" : "" }
        guard let address = control.feedbackAddress, let value = feedback.values[address] else { return "—" }
        if let scale = control.valueScale { return scale.display(value) }
        if case .number = value { return value.display + " brut" }
        return value.display
    }
    func selectBank(_ id: Int) {
        guard let profile, profile.banks?.contains(where: { $0.id == id }) == true else { return }
        selectedBank = id; rememberedBanks[profile.id] = id
        synchronizeVisualBand(id)
        writeDiagnostic()
    }
    func setVisualSync(_ enabled: Bool) {
        visualSyncEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "controller.visualBandSync")
        visualGeneration &+= 1
        visualSyncStatus = enabled ? "Sélection visuelle F6 activée" : "Sélection visuelle F6 désactivée"
        visualSyncProblem = false
    }
    private func synchronizeVisualBand(_ band: Int) {
        visualGeneration &+= 1
        let generation = visualGeneration
        guard running, !demo, visualSyncEnabled, canForward,
              let layout = profile?.bandSelectorLayout,
              let pid = NSRunningApplication.runningApplications(withBundleIdentifier: AccessibilityProbe.hostID).first?.processIdentifier else { return }
        visualSyncStatus = "Sélection de Band \(band) dans F6…"
        visualSyncProblem = false
        let calibrations = visualCalibrations
        visualCoordinates = "Band \(band) : préparation AX en cours"
        visualQueue.async {
            let result = Result { try F6VisualSelection.plan(pid: pid, band: band, layout: layout, calibrations: calibrations) }
            DispatchQueue.main.async {
                guard self.running, !self.demo, self.visualSyncEnabled, self.visualGeneration == generation,
                      self.selectedBank == band, self.canForward else { return }
                do {
                    let plan = try result.get()
                    self.visualCoordinates = F6VisualSelection.diagnostic(plan)
                    let now = ProcessInfo.processInfo.systemUptime
                    // Un double clic sur un sélecteur F6 change l’état audio.
                    // Les répétitions rapides du même bouton ne sont pas rejouées.
                    if self.lastVisualBand == band && now - self.lastVisualTime < NSEvent.doubleClickInterval + 0.1 {
                        self.visualSyncStatus = "Band \(band) : sélection déjà envoyée"
                        self.writeDiagnostic(); return
                    }
                    try F6VisualSelection.click(plan)
                    self.lastVisualBand = band; self.lastVisualTime = now
                    self.visualSyncStatus = "Band \(band) : sélection envoyée à F6"
                } catch { self.visualSyncStatus = error.localizedDescription; self.visualSyncProblem = true
                    self.visualCoordinates += " ; refus : " + error.localizedDescription
                }
                self.writeDiagnostic()
            }
        }
    }
    func resetVisualCalibration() {
        calibrationGeneration &+= 1; calibrationPending = false
        calibrationBand = 1; calibrationPoints = []; calibrationSize = nil; calibrationPID = nil
        visualCalibrations = []
        UserDefaults.standard.removeObject(forKey: "controller.f6VisualCalibrations.v1")
        visualSyncStatus = "Calibrages effacés ; référence 802 × 602 conservée"
        writeDiagnostic()
    }
    // Lecture de la position du curseur uniquement, aucun clic de calibration.
    func captureVisualSelector() {
        guard !calibrationPending, !demo else { return }
        calibrationPending = true
        diagnostics = true
        let generation = calibrationGeneration
        visualSyncStatus = "Dans 4 s : F6 au premier plan, pointeur au centre du sélecteur Band \(calibrationBand), sans cliquer"
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            guard self.calibrationGeneration == generation else { return }
            self.calibrationPending = false
            do {
                guard self.running, !self.demo, self.canForward,
                      self.profile?.id == "waves-f6",
                      let layout = self.profile?.bandSelectorLayout,
                      let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
                      let cursor = CGEvent(source: nil)?.location else {
                    throw VisualSelectionError.unavailable("Calibration : cible F6 fraîche et routage activé requis")
                }
                let frame = try F6VisualSelection.geometry(pid: pid, title: layout.windowTitle)
                let plan = F6ClickPlan(pid: pid, title: layout.windowTitle, frame: frame, point: cursor)
                try F6VisualSelection.validate(plan)
                guard self.calibrationSize == nil || (self.calibrationSize == frame.size && self.calibrationPID == pid) else {
                    throw VisualSelectionError.unavailable("Taille ou processus changé : effacer et recommencer le calibrage")
                }
                let offset = CGPoint(x: cursor.x - frame.minX, y: cursor.y - frame.minY)
                guard offset.x > (self.calibrationPoints.last?.x ?? 0), offset.y > 0 else {
                    throw VisualSelectionError.unavailable("Sélecteurs attendus de gauche à droite à l’intérieur de F6")
                }
                self.calibrationSize = frame.size; self.calibrationPID = pid
                self.calibrationPoints.append(offset)
                self.visualCoordinates = F6VisualSelection.diagnostic(plan)
                if self.calibrationPoints.count == 6 {
                    let calibration = BandSelectorCalibration(title: layout.windowTitle, size: frame.size, points: self.calibrationPoints)
                    guard calibration.isValid else { throw VisualSelectionError.unavailable("Mesures invalides : recommencer le calibrage") }
                    self.visualCalibrations.removeAll { $0.title == calibration.title && $0.size == calibration.size }
                    self.visualCalibrations.append(calibration)
                    if let data = try? JSONEncoder().encode(self.visualCalibrations) {
                        UserDefaults.standard.set(data, forKey: "controller.f6VisualCalibrations.v1")
                    }
                    self.calibrationBand = 1; self.calibrationPoints = []; self.calibrationSize = nil; self.calibrationPID = nil
                    self.visualSyncStatus = "Six repères mémorisés pour \(frame.size) ; surlignage réel à vérifier"
                } else {
                    self.calibrationBand += 1
                    self.visualSyncStatus = "Repère mémorisé ; capturer maintenant Band \(self.calibrationBand) dans Options"
                }
                self.visualSyncProblem = false
            } catch { self.visualSyncStatus = error.localizedDescription; self.visualSyncProblem = true }
            self.writeDiagnostic()
        }
    }
    func startLearningBands() {
        guard !demo else { return }
        learningButtons = [:]
        learningBank = 1; learningStatus = "Band 1 : appuie sur le bouton choisi sur le X-Touch"
    }
    func cancelLearningBands() { learningBank = nil; learningButtons = [:]; learningStatus = "Apprentissage arrêté" }
    private func restoreLearnedButtons() {
        guard let index = profiles.firstIndex(where: { $0.id == "waves-f6" }),
              let saved = UserDefaults.standard.dictionary(forKey: "controller.f6BandButtons") as? [String: [String: Int]] else { return }
        for (key, raw) in saved {
            guard let bank = Int(key), let button = profiles[index].buttons.firstIndex(where: { $0.selectBank == bank }),
                  let channel = raw["channel"], let number = raw["number"], (1...16).contains(channel), (0...127).contains(number) else { continue }
            profiles[index].buttons[button].midi = MIDIBinding(message: .note, channel: channel, number: number, encoding: .absolute)
        }
    }
    private func learnBandButton(_ message: [UInt8]) {
        guard let bank = learningBank, message.count == 3, message[0] & 0xF0 == 0x90,
              message[1] < 128, message[2] > 0, message[2] < 128,
              let index = profiles.firstIndex(where: { $0.id == "waves-f6" }) else { return }
        guard !(message[0] == 0x90 && message[1] == 95) else { learningStatus = "B16 réservé au On/Off"; return }
        var saved = learningButtons
        let channel = Int(message[0] & 15) + 1, number = Int(message[1])
        if saved.contains(where: { $0.key != String(bank) && $0.value["channel"] == channel && $0.value["number"] == number }) {
            learningStatus = "Ce bouton est déjà associé à une autre bande"; return
        }
        saved[String(bank)] = ["channel": channel, "number": number]
        learningButtons = saved
        if bank < 6 { learningBank = bank + 1; learningStatus = "Band \(bank + 1) : appuie sur le bouton suivant" }
        else {
            UserDefaults.standard.set(saved, forKey: "controller.f6BandButtons")
            restoreLearnedButtons()
            if profile?.id == profiles[index].id {
                profile = profiles[index]
                selectionState.refreshLoadedProfile(profiles[index])
            }
            learningBank = nil; learningButtons = [:]; learningStatus = "Six boutons de bande mémorisés"
        }
        writeDiagnostic()
    }
}
