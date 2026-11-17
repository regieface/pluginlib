import Foundation

// La présentation mémorisée n'est jamais une preuve d'identité pour le routage.
public struct ProfileSelectionState {
    public private(set) var loadedProfile: Profile?
    public private(set) var confirmedProfileID: String?
    public init() {}
    public mutating func observe(_ profile: Profile?) {
        confirmedProfileID = profile?.id
        if let profile { loadedProfile = profile }
    }
    public mutating func refreshLoadedProfile(_ profile: Profile) {
        if loadedProfile?.id == profile.id { loadedProfile = profile }
    }
    public mutating func invalidate() { confirmedProfileID = nil }
    public mutating func reset() { loadedProfile = nil; confirmedProfileID = nil }
}
