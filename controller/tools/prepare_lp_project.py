"""Prepare an LP project copy from existing, verified controller definitions.

Never opens LP and never overwrites the input. Opaque plugin state, audio and
snapshots remain byte-identical. Parameter indices come from an AU catalogue,
with an existing LP assignment checked as an anchor before any new assignment.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
from lp_project import Node, Variant, FormatError, dumps, loads

class PreparationError(ValueError):
    pass

def only(items, description):
    items = list(items)
    if len(items) != 1:
        raise PreparationError(f'{description}: attendu 1, trouvé {len(items)}')
    return items[0]

def child(node, kind):
    return only((c for c in node.children if c.kind == kind), kind)

def normalize(text):
    return ' '.join(text.casefold().split())

def prepare(source: bytes, profile: dict, catalogue: dict, target_uid: int | None = None):
    root = loads(source)
    if root.kind != 'LiveProfessorProjectFile' or dumps(root) != source:
        raise PreparationError('Format de projet non reconnu ou sérialisation non identique')
    plugins = [n for n in root.walk() if n.kind == 'Plugin' and n.get('pluginUid') is not None]
    plugin = only((n for n in plugins if n.get('pluginTypeName') == catalogue['lpPluginName'] and
                   (target_uid is None or n.get('pluginUid') == target_uid)), 'Instance du plugin cible')
    if not str(plugin.get('pluginTypeId', '')).startswith('AudioUnit-'):
        raise PreparationError('Le catalogue décrit une Audio Unit, pas ce format de plugin')
    aliases = {title[:-2] if title.endswith('UI') else title for title in profile['windowTitles']}
    if plugin.get('pluginTypeName') not in aliases:
        raise PreparationError('Le profil et le plugin cible ne correspondent pas')
    parameter_sets = [n for n in plugin.walk() if n.kind == 'parameters']
    params = catalogue['parameters']
    if not parameter_sets or len(parameter_sets[0].properties) != len(params):
        raise PreparationError('Le nombre de paramètres diffère du catalogue AU : nouvelle vérification nécessaire')
    by_name = {}
    for param in params:
        by_name.setdefault(normalize(param['name']), []).append(param['index'])
    controls = profile['encoders']
    if len(controls) != 8 or {c['id'] for c in controls} != set(range(1, 9)):
        raise PreparationError('Le profil doit définir huit encodeurs')
    requested = {}
    bank_list = profile.get('banks') or [{'id': 1, 'encoders': controls}]
    if len({bank['id'] for bank in bank_list}) != len(bank_list):
        raise PreparationError('Identifiants de banque dupliqués')
    if bank_list[0]['encoders'] != controls:
        raise PreparationError('La banque initiale ne correspond pas au profil')
    for bank in bank_list:
        if len(bank['encoders']) != 8 or {c['id'] for c in bank['encoders']} != set(range(1,9)):
            raise PreparationError('Chaque banque doit contenir huit encodeurs distincts')
        for control in bank['encoders']:
            binding = control.get('midi', {})
            if (binding.get('message') != 'controlChange' or binding.get('channel') != 1 or
                binding.get('encoding') != 'relativeSignMagnitude' or not 0 <= binding.get('number', -1) <= 127):
                raise PreparationError(f"Affectation MCU non compatible pour {control['name']}")
            key = (binding['channel'], binding['number'])
            if not control.get('feedbackAddress', '').startswith('/'):
                raise PreparationError('Adresse de retour OSC absente')
            parameter = only(by_name.get(normalize(control.get('hostParameter', '')), []), control.get('hostParameter', '?'))
            entry = (control, parameter, bank['id'])
            if key in requested:
                previous = requested[key]
                if previous[1] != parameter or previous[0]['feedbackAddress'] != control['feedbackAddress']:
                    raise PreparationError('Un message MIDI vise plusieurs paramètres')
            else:
                requested[key] = entry
    if len({entry[0]['feedbackAddress'] for entry in requested.values()}) != len(requested):
        raise PreparationError('Les adresses OSC doivent être distinctes')
    destinations = {key: entry[1] for key, entry in requested.items()}
    # Garder l’ancre Gain/CC16 historique, indépendamment de l’ordre d’affichage.
    anchor = requested[(1, 16)][0]
    controllers_root = child(root, 'HardwareControllers')
    original_other_children = [dumps(n) for n in root.children if n is not controllers_root]
    controllers = child(controllers_root, 'HardwareControllers').children
    mcu = only((n for n in controllers if n.kind == 'HardwareController' and n.get('ControllerType') == 'MackieMCU'), 'Contrôleur MCU')
    midi_input = only((n for n in root.walk() if n.kind == 'InputDevice' and n.get('HWname') == 'PluginLib Controller E1'), 'Entrée MIDI virtuelle PluginLib')
    mcu.set('MidiInputId', midi_input.get('ID'))
    osc = only((n for n in controllers if n.kind == 'HardwareController' and n.get('ControllerType') == 'OSC Controller' and
                any(c.get('OSCAddressPatern') == anchor['feedbackAddress'] for c in child(n, 'Controls').children)), 'Contrôleur OSC du profil')
    mcu_controls = child(mcu, 'Controls')
    osc_controls = child(osc, 'Controls')
    encoder_nodes = {}
    for control in controls:
        expected = bytes([8, 0xB0, 15 + control['id'], 0])
        encoder_nodes[control['id']] = only((n for n in mcu_controls.children if n.kind == 'HardwareControl' and
                                          n.properties.get('MidiData') and n.properties['MidiData'].payload == expected), f"Encodeur MCU {control['id']}")
    osc_first = only((n for n in osc_controls.children if n.get('OSCAddressPatern') == anchor['feedbackAddress']), 'Retour OSC E1 existant')
    active_map = only((n for n in child(controllers_root, 'HardwareCtrlMaps').children if n.get('mapId') == controllers_root.get('ActiveMap')), 'Map active')
    assignments = child(active_map, 'Assignments')
    target = f"Processor{plugin.get('pluginUid')}"
    templates = {}
    for label, controller, control in [('MIDI', mcu, encoder_nodes[1]), ('OSC', osc, osc_first)]:
        template = only((n for n in assignments.children if n.kind == 'Assignment' and
                         n.get('ParentControllerId') == controller.get('uID') and n.get('ControllerId') == control.get('id') and
                         n.get('ControllableId') == target), f'Affectation {label} E1 de référence')
        if template.get('ParameterId') != destinations[(1, 16)]:
            raise PreparationError(f"L’affectation {label} E1 ne confirme pas l’index du catalogue")
        templates[label] = template
    identifiers = [value.value for n in root.walk() for key, value in n.properties.items()
                   if (key.casefold().endswith('id') or key.casefold() == 'idint')
                   and type(value.value) is int and 0 <= value.value < 2**31]
    next_id = max(identifiers, default=0) + 1
    rows = []
    added_controls = added_assignments = added_midi = 0
    for key, (control, parameter, bank_id) in sorted(requested.items()):
        expected = bytes([8, 0xB0 | (key[0] - 1), key[1], 0])
        matching_midi = [n for n in mcu_controls.children if n.kind == 'HardwareControl' and
                         n.properties.get('MidiData') and n.properties['MidiData'].payload == expected]
        if matching_midi:
            midi_node = only(matching_midi, 'Message MIDI unique')
        else:
            if next_id >= 2**31:
                raise PreparationError('Plus d’identifiants disponibles')
            midi_node = copy.deepcopy(encoder_nodes[1])
            midi_node.set('Name', control['name']); midi_node.set('id', next_id); next_id += 1
            midi_node.properties['MidiData'] = Variant(expected)
            mcu_controls.children.append(midi_node); added_midi += 1
        midi_node.set('Name', control['name'])
        matching = [n for n in osc_controls.children if n.get('OSCAddressPatern') == control['feedbackAddress']]
        if matching:
            osc_node = only(matching, 'Adresse OSC unique')
        else:
            if next_id >= 2**31:
                raise PreparationError('Plus d’identifiants disponibles')
            osc_node = copy.deepcopy(osc_first)
            osc_node.set('Name', control['name']); osc_node.set('id', next_id)
            next_id += 1
            osc_node.set('OSCAddressPatern', control['feedbackAddress'])
            osc_controls.children.append(osc_node); added_controls += 1
        osc_node.set('Name', control['name'])
        for label, controller, hardware in [('MIDI', mcu, midi_node), ('OSC', osc, osc_node)]:
            existing = [n for n in assignments.children if n.kind == 'Assignment' and
                        n.get('ParentControllerId') == controller.get('uID') and n.get('ControllerId') == hardware.get('id')]
            if existing:
                if len(existing) != 1 or existing[0].get('ControllableId') != target or existing[0].get('ParameterId') != parameter:
                    raise PreparationError(f"{control['name']} {label} est déjà affecté ailleurs ; aucune affectation remplacée")
            else:
                assignment = copy.deepcopy(templates[label])
                assignment.set('ControllerId', hardware.get('id'))
                assignment.set('ParameterId', parameter)
                assignments.children.append(assignment); added_assignments += 1
        rows.append({'bank': bank_id, 'encoder': control['id'], 'cc': key[1], 'name': control['hostParameter'], 'parameterIndex': parameter, 'osc': control['feedbackAddress']})
    if original_other_children != [dumps(n) for n in root.children if n is not controllers_root]:
        raise PreparationError('Une section extérieure aux contrôleurs a changé')
    output = dumps(root)
    if dumps(loads(output)) != output:
        raise PreparationError('Échec de validation de la copie générée')
    report = {'plugin': plugin.get('pluginTypeName'), 'instanceUID': plugin.get('pluginUid'),
              'addedOSCControls': added_controls, 'addedMIDIControls': added_midi, 'addedAssignments': added_assignments,
              'preservedOtherSections': True, 'inputSHA256': hashlib.sha256(source).hexdigest(),
              'outputSHA256': hashlib.sha256(output).hexdigest(), 'mappings': rows}
    return output, report

def main():
    parser = argparse.ArgumentParser(description='Préparer une copie LP avec les huit affectations du profil')
    parser.add_argument('--project', required=True, type=Path)
    parser.add_argument('--profile', required=True, type=Path)
    parser.add_argument('--catalogue', required=True, type=Path)
    parser.add_argument('--target-uid', type=int)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.output and args.output.resolve() == args.project.resolve():
        parser.error('La sortie doit être une copie distincte du projet source')
    try:
        output, report = prepare(args.project.read_bytes(), json.loads(args.profile.read_text()), json.loads(args.catalogue.read_text()), args.target_uid)
        if args.output:
            with args.output.open('xb') as stream:
                stream.write(output)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Préparation interrompue : {error}\n')

if __name__ == '__main__':
    main()
