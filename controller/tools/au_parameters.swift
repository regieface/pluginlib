import Foundation
import AudioToolbox
// Offline metadata probe: no AudioUnitInitialize, render callback or audio device.
let args = CommandLine.arguments
let listOnly = args.contains("--list")
let requested: String? = args.firstIndex(of: "--name").flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil }
var search = AudioComponentDescription(componentType: 0, componentSubType: 0, componentManufacturer: 0, componentFlags: 0, componentFlagsMask: 0)
var previous: AudioComponent?
var selected: AudioComponent?
var all: [[String: Any]] = []
while let component = AudioComponentFindNext(previous, &search) {
 previous = component
 var name: Unmanaged<CFString>?
 guard AudioComponentCopyName(component, &name) == noErr, let name else { continue }
 let label = name.takeRetainedValue() as String
 var d = AudioComponentDescription(); AudioComponentGetDescription(component, &d)
 all.append(["componentName":label, "componentType":d.componentType, "componentSubType":d.componentSubType, "componentManufacturer":d.componentManufacturer])
 if label == requested { selected = component }
}
if listOnly {
 let data = try JSONSerialization.data(withJSONObject: all, options: [.prettyPrinted,.sortedKeys])
 FileHandle.standardOutput.write(data); exit(0)
}
guard let requested, let component = selected else { fputs("Usage: swift au_parameters.swift --list | --name \"Vendor: Plugin\" [--output file.json]\n", stderr); exit(1) }
var description = AudioComponentDescription(); AudioComponentGetDescription(component, &description)
var instance: AudioComponentInstance?
let status = AudioComponentInstanceNew(component, &instance)
guard status == noErr, let instance else { fatalError("Instance \(status)") }
defer { AudioComponentInstanceDispose(instance) }
var size: UInt32 = 0
var writable: DarwinBoolean = false
let infoStatus = AudioUnitGetPropertyInfo(instance, kAudioUnitProperty_ParameterList, kAudioUnitScope_Global, 0, &size, &writable)
guard infoStatus == noErr else { fatalError("Liste \(infoStatus)") }
var identifiers = [AudioUnitParameterID](repeating: 0, count: Int(size) / MemoryLayout<AudioUnitParameterID>.size)
let listStatus = AudioUnitGetProperty(instance, kAudioUnitProperty_ParameterList, kAudioUnitScope_Global, 0, &identifiers, &size)
guard listStatus == noErr else { fatalError("Paramètres \(listStatus)") }
var result: [[String: Any]] = []
for (index, identifier) in identifiers.enumerated() {
 var info = AudioUnitParameterInfo()
 var infoSize = UInt32(MemoryLayout<AudioUnitParameterInfo>.size)
 guard AudioUnitGetProperty(instance, kAudioUnitProperty_ParameterInfo, kAudioUnitScope_Global, identifier, &info, &infoSize) == noErr else { continue }
 let name: String
 if info.flags.contains(.flag_HasCFNameString), let text = info.cfNameString {
  name = text.takeUnretainedValue() as String
  if info.flags.contains(.flag_CFNameRelease) { text.release() }
 } else {
  name = withUnsafePointer(to: &info.name) { $0.withMemoryRebound(to: CChar.self, capacity: 52) { String(cString: $0) } }
 }
 result.append(["index":index, "id":identifier, "name":name, "min":info.minValue, "max":info.maxValue, "defaultValue":info.defaultValue, "unit":info.unit.rawValue, "flags":info.flags.rawValue])
}
let catalogue: [String: Any] = ["componentName":requested, "lpPluginName":requested.components(separatedBy: ": ").dropFirst().joined(separator: ": "),
 "componentType":description.componentType, "componentSubType":description.componentSubType,
 "componentManufacturer":description.componentManufacturer, "parameters":result]
let data = try JSONSerialization.data(withJSONObject: catalogue, options: [.prettyPrinted,.sortedKeys])
if let index = args.firstIndex(of: "--output"), index + 1 < args.count {
 try data.write(to: URL(fileURLWithPath:args[index + 1]), options: .withoutOverwriting)
} else { FileHandle.standardOutput.write(data) }
