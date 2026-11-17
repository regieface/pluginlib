import Foundation
import CoreGraphics

// Coordonnées en points relatives à la fenêtre UI du plugin, jamais à l’écran.
// La mise à l’échelle est explicite : seuls les profils qui la déclarent l’utilisent.
public struct BandSelectorLayout: Codable, Equatable, Sendable {
    public enum Resizing: String, Codable, Sendable { case proportional }
    public var resizing: Resizing?
    public var windowTitle: String
    public var width: Double
    public var height: Double
    public var firstX: Double
    public var firstY: Double
    public var lastX: Double
    public var lastY: Double
    public var isValid: Bool {
        !windowTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && [width,height,firstX,firstY,lastX,lastY].allSatisfy(\.isFinite) &&
        width > 0 && height > 0 && firstX > 0 && lastX < width && lastX - firstX >= 50 &&
        firstY > 0 && firstY < height && lastY > 0 && lastY < height && abs(firstY - lastY) <= 5
    }
    // Résolution F6 : mesures de cette taille, sinon référence exacte uniquement.
    public func measuredPoint(band: Int, in frame: CGRect, calibrations: [BandSelectorCalibration]) -> CGPoint? {
        if let point = calibrations.reversed().compactMap({ $0.point(band: band, title: windowTitle, frame: frame) }).first { return point }
        var reference = self; reference.resizing = nil
        return reference.point(band: band, in: frame)
    }
    public func point(band: Int, in frame: CGRect) -> CGPoint? {
        guard isValid, (1...6).contains(band),
              frame.origin.x.isFinite, frame.origin.y.isFinite,
              frame.size.width.isFinite, frame.size.height.isFinite, frame.size.width > 0, frame.size.height > 0 else { return nil }
        guard resizing == .proportional ||
              (abs(frame.width - width) <= 0.5 && abs(frame.height - height) <= 0.5) else { return nil }
        let scaleX = resizing == .proportional ? frame.width / width : 1
        let scaleY = resizing == .proportional ? frame.height / height : 1
        let fraction = Double(band - 1) / 5
        let point = CGPoint(x: frame.minX + (firstX + fraction * (lastX - firstX)) * scaleX,
                            y: frame.minY + (firstY + fraction * (lastY - firstY)) * scaleY)
        return point.x.isFinite && point.y.isFinite && frame.contains(point) ? point : nil
    }
}

// Revalidation immédiate d’une cible planifiée : un changement de géométrie
// impose une nouvelle lecture, jamais un clic avec des coordonnées périmées.
public struct WindowClickTarget: Sendable {
    public let pid: Int32
    public let title: String
    public let frame: CGRect
    public let point: CGPoint
    public init(pid: Int32, title: String, frame: CGRect, point: CGPoint) {
        self.pid = pid; self.title = title; self.frame = frame; self.point = point
    }
    public func matches(pid: Int32, title: String, frame: CGRect, visible: Bool) -> Bool {
        visible && self.pid == pid && self.title == title &&
        self.frame.contains(point) && frame.contains(point) &&
        abs(frame.minX - self.frame.minX) < 0.5 && abs(frame.minY - self.frame.minY) < 0.5 &&
        abs(frame.width - self.frame.width) < 0.5 && abs(frame.height - self.frame.height) < 0.5
    }
}

// Mesures indépendantes pour chaque sélecteur : aucune hypothèse sur les bordures,
// le zoom, l’espacement ou les proportions du contenu de l’hôte.
public struct BandSelectorCalibration: Codable, Sendable {
    public let title: String
    public let size: CGSize
    public let points: [CGPoint] // offsets AX, origine en haut à gauche
    public init(title: String, size: CGSize, points: [CGPoint]) {
        self.title = title; self.size = size; self.points = points
    }
    public var isValid: Bool {
        !title.isEmpty && size.width.isFinite && size.height.isFinite && size.width > 0 && size.height > 0 &&
        points.count == 6 && points.allSatisfy {
            $0.x.isFinite && $0.y.isFinite && $0.x > 0 && $0.y > 0 && $0.x < size.width && $0.y < size.height
        } && zip(points, points.dropFirst()).allSatisfy { $0.x < $1.x }
    }
    public func point(band: Int, title: String, frame: CGRect) -> CGPoint? {
        guard isValid, (1...6).contains(band), self.title == title,
              frame.origin.x.isFinite, frame.origin.y.isFinite,
              frame.width == size.width, frame.height == size.height else { return nil }
        return CGPoint(x: frame.minX + points[band - 1].x, y: frame.minY + points[band - 1].y)
    }
}
