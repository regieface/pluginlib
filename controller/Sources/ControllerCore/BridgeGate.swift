import Foundation

public enum BridgeGate {
    public static func allows(armed: Bool, running: Bool, demo: Bool, profileID: String?, hostIsFrontmost: Bool, snapshotAge: TimeInterval) -> Bool {
        armed && running && !demo && profileID == "waves-f6" && hostIsFrontmost && snapshotAge >= 0 && snapshotAge < 0.8
    }
}
