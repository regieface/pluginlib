import Foundation

// Échelle propre à un paramètre, à renseigner après vérification du retour LP.
// Les bornes constructeur seules ne prouvent pas l’encodage OSC.
public struct ValueScale: Codable, Equatable {
    public enum Curve: String, Codable { case linear, logarithmic }
    public var inputMin: Double
    public var inputMax: Double
    public var outputMin: Double
    public var outputMax: Double
    public var curve: Curve
    public var unit: String
    public var decimals: Int
    public var signed: Bool
    public init(inputMin: Double, inputMax: Double, outputMin: Double, outputMax: Double,
                curve: Curve = .linear, unit: String, decimals: Int = 1, signed: Bool = false) {
        self.inputMin = inputMin; self.inputMax = inputMax
        self.outputMin = outputMin; self.outputMax = outputMax
        self.curve = curve; self.unit = unit; self.decimals = decimals; self.signed = signed
    }
    public var isValid: Bool {
        [inputMin, inputMax, outputMin, outputMax].allSatisfy(\.isFinite) &&
        inputMax > inputMin && outputMax > outputMin &&
        (inputMax - inputMin).isFinite && (outputMax - outputMin).isFinite &&
        (0...6).contains(decimals) && unit == unit.trimmingCharacters(in: .whitespacesAndNewlines) && unit.count <= 16 &&
        unit.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) &&
        (curve != .logarithmic || outputMin > 0)
    }
    public func converted(_ raw: Double) -> Double? {
        guard isValid, raw.isFinite, raw >= inputMin, raw <= inputMax else { return nil }
        let fraction = (raw - inputMin) / (inputMax - inputMin)
        let result: Double
        switch curve {
        case .linear: result = outputMin + fraction * (outputMax - outputMin)
        case .logarithmic: result = exp(log(outputMin) + fraction * (log(outputMax) - log(outputMin)))
        }
        return result.isFinite ? result : nil
    }
    public func display(_ value: ParameterValue) -> String {
        guard case .number(let raw) = value else { return value.display }
        guard raw.isFinite else { return "—" }
        guard let physical = converted(raw) else { return value.display + " (brut)" }
        let factor = pow(10.0, Double(decimals))
        // Évite −0,0 dB lorsque le retour OSC est arrondi autour du milieu.
        let clean = abs(physical) < 0.5 / factor ? 0.0 : physical
        let number = String(format: "%.*f", locale: Locale(identifier: "fr_FR"), decimals, clean)
        return (signed && clean > 0 ? "+" : "") + number + (unit.isEmpty ? "" : " " + unit)
    }
}
