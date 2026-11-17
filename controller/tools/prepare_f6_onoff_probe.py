"""Prepare diagnostic OSC routes in a new copy; never open LP or send commands."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from lp_project import loads, dumps
from prepare_lp_project import child, only, PreparationError

IDS = [8, 20, 32, 44, 56, 68]

def prepare_probe(source, catalogue):
    root = loads(source)
    for band, identifier in enumerate(IDS, 1):
        p = only((p for p in catalogue['parameters'] if p['name'] == f'Band {band} On/Off'), 'AU On/Off')
        if (p['id'], p['index'], p['min'], p['max']) != (identifier, identifier, 0, 1):
            raise PreparationError('Catalogue On/Off incompatible')
    plugin = only((n for n in root.walk() if n.kind == 'Plugin' and n.get('pluginTypeName') == 'F6 (m)' and n.get('pluginUid') is not None), 'Instance F6 mono')
    outer = child(root, 'HardwareControllers')
    osc = only((n for n in child(outer, 'HardwareControllers').children if n.get('ControllerType') == 'OSC Controller' and any(c.get('OSCAddressPatern') == '/pluginlib/waves-f6/e1' for c in child(n, 'Controls').children)), 'OSC F6')
    if osc.get('OSChostIp') != '127.0.0.1' or osc.get('OSCOutPort') != 9001:
        raise PreparationError('Sortie de diagnostic attendue : 127.0.0.1:9001')
    controls = child(osc, 'Controls')
    template = only((c for c in controls.children if c.get('OSCAddressPatern') == '/pluginlib/waves-f6/e1'), 'Retour Gain')
    active = only((n for n in child(outer, 'HardwareCtrlMaps').children if n.get('mapId') == outer.get('ActiveMap')), 'Map active')
    assignments = child(active, 'Assignments')
    target = f"Processor{plugin.get('pluginUid')}"
    anchor = only((a for a in assignments.children if a.get('ParentControllerId') == osc.get('uID') and a.get('ControllerId') == template.get('id') and a.get('ControllableId') == target and a.get('ParameterId') == 12), 'Affectation OSC Gain')
    for transform in [child(template, 'ControlTransform'), child(anchor, 'Transform')]:
        if any(transform.get(k) for k in ['Reverse','Toggle','Relative','expCurve']) or transform.get('relativeInputMode') != 0:
            raise PreparationError('Transformation OSC non absolue')
    originals = [dumps(n) for n in assignments.children]
    other = [dumps(n) for n in root.children if n is not outer]
    ids = [v.value for n in root.walk() for k,v in n.properties.items() if k.lower().endswith('id') and type(v.value) is int and 0 <= v.value < 2**31]
    next_id = max(ids) + 1
    if next_id + 5 >= 2**31: raise PreparationError("Identifiants épuisés")
    rows = []
    for band, parameter in enumerate(IDS, 1):
        address = f'/pluginlib/diagnostic/f6/band{band}/onoff'
        if any(n.get('OSCAddressPatern') == address for n in controls.children):
            raise PreparationError('Diagnostic déjà présent')
        c = copy.deepcopy(template)
        c.set('id', next_id); next_id += 1
        c.set('Name', f'Band {band} On/Off diagnostic'); c.set('OSCAddressPatern', address)
        a = copy.deepcopy(anchor); a.set('ControllerId', c.get('id')); a.set('ParameterId', parameter)
        controls.children.append(c); assignments.children.append(a)
        rows.append({'band':band,'parameterID':parameter,'address':address,'polarity':'unknown'})
    assert originals == [dumps(n) for n in assignments.children[:-6]]
    assert other == [dumps(n) for n in root.children if n is not outer]
    result = dumps(root)
    assert dumps(loads(result)) == result
    return result, {'sourceSHA256':hashlib.sha256(source).hexdigest(), 'outputSHA256':hashlib.sha256(result).hexdigest(), 'preservedAssignments':len(originals), 'addedOSCControls':6,'addedAssignments':6,'addedMIDIControls':0,'mappings':rows}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--project',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    catalogue = json.loads((Path(__file__).resolve().parents[1]/'Metadata/waves-f6-au.json').read_text())
    result, report = prepare_probe(args.project.read_bytes(), catalogue)
    with args.output.open('xb') as f: f.write(result)
    print(json.dumps(report,indent=2))
