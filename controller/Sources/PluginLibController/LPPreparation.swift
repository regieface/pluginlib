import AppKit
import UniformTypeIdentifiers

extension ControllerModel {
    // Prépare uniquement une copie sur disque. Aucun chargement de projet LP,
    // lancement de plugin ou modification du moteur audio de LiveProfessor.
    func prepareLiveProfessorProject() {
        guard !preparingProject else { return }
        let source = NSOpenPanel()
        source.title = "Projet LiveProfessor contenant F6 et les deux contrôleurs de référence"
        source.allowedContentTypes = [UTType(filenameExtension: "rack2") ?? .data]
        source.allowsMultipleSelection = false
        guard source.runModal() == .OK, let input = source.url else { return }
        let save = NSSavePanel()
        save.title = "Enregistrer une copie avec les six banques F6"
        save.nameFieldStringValue = input.deletingPathExtension().lastPathComponent + "-PluginLib-6Bands.rack2"
        save.directoryURL = input.deletingLastPathComponent()
        save.allowedContentTypes = [UTType(filenameExtension: "rack2") ?? .data]
        guard save.runModal() == .OK, let output = save.url else { return }
        let sourceRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let resources = Bundle.main.resourceURL ?? sourceRoot
        let bundledScript = resources.appendingPathComponent("Tools/prepare_lp_project.py")
        let script = FileManager.default.fileExists(atPath: bundledScript.path) ? bundledScript : sourceRoot.appendingPathComponent("tools/prepare_lp_project.py")
        let bundledCatalogue = resources.appendingPathComponent("Metadata/waves-f6-au.json")
        let catalogue = FileManager.default.fileExists(atPath: bundledCatalogue.path) ? bundledCatalogue : sourceRoot.appendingPathComponent("Metadata/waves-f6-au.json")
        let profile = profilesURL.appendingPathComponent("waves-f6.json")
        preparingProject = true
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            let pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = ["-B", script.path, "--project", input.path, "--profile", profile.path, "--catalogue", catalogue.path, "--output", output.path]
            process.standardOutput = pipe; process.standardError = pipe
            let succeeded: Bool
            let details: String
            do {
                try process.run()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                succeeded = process.terminationStatus == 0
                details = String(data: data, encoding: .utf8) ?? ""
            } catch { succeeded = false; details = error.localizedDescription }
            DispatchQueue.main.async {
                self.preparingProject = false
                let alert = NSAlert()
                alert.messageText = succeeded ? "Copie LiveProfessor préparée" : "Préparation interrompue"
                alert.informativeText = succeeded
                    ? "Les six banques et leurs retours OSC sont affectés dans \(output.lastPathComponent). Le projet source est conservé. Ouvre cette copie dans une session de test LP, puis utilise Options → Apprendre les six boutons de bande pour associer les boutons physiques une seule fois."
                    : String(details.prefix(2500))
                alert.addButton(withTitle: "OK")
                if succeeded { alert.addButton(withTitle: "Afficher dans le Finder") }
                if alert.runModal() == .alertSecondButtonReturn { NSWorkspace.shared.activateFileViewerSelecting([output]) }
            }
        }
    }
}
