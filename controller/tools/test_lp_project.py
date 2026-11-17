import copy
import json
from pathlib import Path
import struct
import unittest
from lp_project import Node, Variant, FormatError, dumps, loads, packed_int
from prepare_lp_project import prepare, PreparationError

ROOT = Path(__file__).resolve().parents[1]
PROFILE = json.loads((ROOT / 'Profiles/waves-f6.json').read_text())
CATALOGUE = json.loads((ROOT / 'Metadata/waves-f6-au.json').read_text())

def node(kind, **values):
    result = Node(kind)
    for key, value in values.items(): result.set(key, value)
    return result

def fixture():
    root = node('LiveProfessorProjectFile', appVersion='2026.1.0')
    audio = node('AudioMidiHardware', device='Do not alter', rate=48000)
    audio.children.append(node('InputDevice', ID=13, HWname='PluginLib Controller E1', Enabled=True))
    plugin = node('Plugin', pluginTypeName='F6 (m)', pluginTypeId='AudioUnit-F6 (m)-test', pluginUid=42)
    params = node('parameters')
    for p in CATALOGUE['parameters']: params.set(f"P{p['index']}", 0.5)
    snapshot = node('PluginSnapshot', name='Untouched'); snapshot.children.append(params)
    snapshot.properties['opaqueState'] = Variant(b'\x08\x00\xff\x00\xaa')
    plugin.children.append(snapshot)
    root.children = [audio, plugin, node('GlobalSnapshot', ControllerMapId=5000)]
    outer = node('HardwareControllers', ActiveMap=5000)
    collection = node('HardwareControllers')
    mcu = node('HardwareController', ControllerName='Mackie MCU', ControllerType='MackieMCU', uID=1000)
    controls = node('Controls')
    for i in range(1,9):
        c = node('HardwareControl', Name=f'Encoder {i}', id=100+i)
        c.properties['MidiData'] = Variant(bytes([8,0xB0,15+i,0]))
        c.children.append(node('ControlTransform', relativeInputMode=3))
        controls.children.append(c)
    mcu.children.append(controls)
    osc = node('HardwareController', ControllerName='OSC', ControllerType='OSC Controller', uID=2000)
    osc_first = node('HardwareControl', Name='Gain', id=3001, OSCAddressPatern='/pluginlib/waves-f6/e1')
    osc_first.children.append(node('ControlTransform', relativeInputMode=0))
    osc_controls = node('Controls'); osc_controls.children.append(osc_first); osc.children.append(osc_controls)
    collection.children = [mcu, osc]
    maps = node('HardwareCtrlMaps'); active = node('HardwareCtrlMap', mapId=5000)
    assignments = node('Assignments')
    for parent, ctl, mode in [(1000,101,3),(2000,3001,0)]:
        assignment = node('Assignment', ParentControllerId=parent, ControllerId=ctl, ControllableId='Processor42', ParameterId=12, selectMode=True)
        assignment.children.append(node('Transform', relativeInputMode=mode, selectMode=True))
        assignments.children.append(assignment)
    active.children.append(assignments); maps.children.append(active)
    outer.children = [collection,maps]; root.children.append(outer)
    return root

class CodecChecks(unittest.TestCase):
    def test_lossless_variants_and_opaque_state(self):
        root=fixture()
        for key, value in [('negative',-8),('large',3.25),('yes',True),('no',False),('unicode','Fréquence')]: root.set(key,value)
        root.properties['int64']=Variant(b'\x06'+struct.pack('<q',2**45))
        root.properties['future']=Variant(b'\x63\x00\x12')
        encoded=dumps(root); self.assertEqual(dumps(loads(encoded)),encoded)
        self.assertEqual(loads(encoded).get('int64'),2**45)
    def test_reject_truncated_and_trailing(self):
        source=dumps(fixture())
        for bad in [source[:-1], source+b'\x00', b'a\x00\x05', b'a\x00'+packed_int(-1), b'no-null']:
            with self.assertRaises(FormatError): loads(bad)
    def test_compressed_integer_overflow(self):
        with self.assertRaises(FormatError): packed_int(2**40)

class PreparationChecks(unittest.TestCase):
    def test_eight_pairs_and_preserved_sections(self):
        root=fixture(); original=dumps(root)
        legacy=copy.deepcopy(PROFILE); legacy.pop('banks',None)
        result,report=prepare(original,legacy,CATALOGUE)
        new=loads(result)
        self.assertEqual(report['addedOSCControls'],7)
        self.assertEqual(report['addedAssignments'],14)
        self.assertEqual([dumps(n) for n in root.children if n.kind!='HardwareControllers'],[dumps(n) for n in new.children if n.kind!='HardwareControllers'])
        assignments=[n for n in new.walk() if n.kind=='Assignment']
        self.assertEqual(len(assignments),16)
        for parent,mode in [(1000,3),(2000,0)]:
            group=[n for n in assignments if n.get('ParentControllerId')==parent]
            self.assertEqual({n.get('ParameterId') for n in group},{10,11,12,13,14,15,16,81})
            self.assertTrue(all(n.get('ControllableId')=='Processor42' for n in group))
            self.assertTrue(all(n.children[0].get('relativeInputMode')==mode for n in group))
        self.assertEqual(original,dumps(root))
    def test_six_bands_have_distinct_targets_and_shared_output(self):
        original=dumps(fixture()); result,report=prepare(original,PROFILE,CATALOGUE)
        self.assertEqual(report['addedMIDIControls'],35)
        self.assertEqual(report['addedOSCControls'],42)
        self.assertEqual(report['addedAssignments'],84)
        new=loads(result)
        self.assertEqual(len([n for n in new.walk() if n.kind=='Assignment']),86)
        for band in range(1,7):
            gain=next(x for x in report['mappings'] if x['name']==f'Band {band} Gain')
            self.assertEqual(gain['parameterIndex'],12+(band-1)*12)
            self.assertEqual(gain['cc'],16+(band-1)*8)
        self.assertEqual(len([x for x in report['mappings'] if x['name']=='OUT']),1)
        self.assertEqual(len({x['osc'] for x in report['mappings']}),43)
    def test_frequency_gain_order_keeps_existing_lp_routes(self):
        _, report = prepare(dumps(fixture()), PROFILE, CATALOGUE)
        for band in range(1, 7):
            prefix = '/pluginlib/waves-f6/' + (f'band{band}/' if band > 1 else '')
            for encoder, name, cc, index, address in [
                (1, 'Freq', 17, 10, 'e2'), (2, 'Q', 18, 11, 'e3'), (3, 'Gain', 16, 12, 'e1')
            ]:
                row = next(x for x in report['mappings'] if x['name'] == f'Band {band} {name}')
                self.assertEqual(row['encoder'], encoder)
                self.assertEqual(row['cc'], cc + (band - 1) * 8)
                self.assertEqual(row['parameterIndex'], index + (band - 1) * 12)
                self.assertEqual(row['osc'], prefix + address)

    def test_serialized_effective_frequency_gain_routes_all_banks(self):
        # Inspecter le ValueTree relu, pas les libellés ni le rapport du générateur.
        output, _ = prepare(dumps(fixture()), PROFILE, CATALOGUE)
        root = loads(output)
        controllers = {n.get('ControllerType'): n for n in root.walk()
                       if n.kind == 'HardwareController'}
        outer = next(n for n in root.children if n.kind == 'HardwareControllers')
        active = next(n for n in outer.walk() if n.kind == 'HardwareCtrlMap'
                      and n.get('mapId') == outer.get('ActiveMap'))
        assignments = next(n for n in active.children if n.kind == 'Assignments').children
        for band in range(1, 7):
            prefix = '/pluginlib/waves-f6/' + (f'band{band}/' if band > 1 else '')
            for encoder, cc, parameter, suffix in [(1, 17, 10, 'e2'), (2, 18, 11, 'e3'), (3, 16, 12, 'e1'), (4, 19, 13, 'e4'), (5, 20, 14, 'e5'), (6, 21, 15, 'e6'), (7, 22, 16, 'e7')]:
                cc += (band - 1) * 8
                parameter += (band - 1) * 12
                control = next(c for c in PROFILE['banks'][band - 1]['encoders'] if c['id'] == encoder)
                self.assertEqual(control['midi']['number'], cc)
                self.assertEqual(control['feedbackAddress'], prefix + suffix)
                for kind in ['MackieMCU', 'OSC Controller']:
                    controller = controllers[kind]
                    hardware = next(n for n in controller.walk() if n.kind == 'HardwareControl' and
                                    (n.properties.get('MidiData') is not None and
                                     n.properties['MidiData'].payload == bytes([8, 0xB0, cc, 0])
                                     if kind == 'MackieMCU' else n.get('OSCAddressPatern') == prefix + suffix))
                    matches = [a for a in assignments if a.get('ParentControllerId') == controller.get('uID')
                               and a.get('ControllerId') == hardware.get('id')]
                    self.assertEqual(len(matches), 1)
                    self.assertEqual(matches[0].get('ControllableId'), 'Processor42')
                    self.assertEqual(matches[0].get('ParameterId'), parameter)

    def test_idempotent_generation(self):
        first,_=prepare(dumps(fixture()),PROFILE,CATALOGUE)
        second,report=prepare(first,PROFILE,CATALOGUE)
        self.assertEqual(first,second); self.assertEqual(report['addedAssignments'],0)
    def test_wrong_anchor_refused(self):
        root=fixture(); next(n for n in root.walk() if n.kind=='Assignment').set('ParameterId',13)
        with self.assertRaises(PreparationError): prepare(dumps(root),PROFILE,CATALOGUE)
    def test_conflict_refused(self):
        root=fixture(); assignments=next(n for n in root.walk() if n.kind=='Assignments')
        conflict=copy.deepcopy(assignments.children[0]); conflict.set('ControllerId',102); conflict.set('ParameterId',999)
        assignments.children.append(conflict)
        with self.assertRaises(PreparationError): prepare(dumps(root),PROFILE,CATALOGUE)
    def test_multiple_instances_require_target(self):
        root=fixture(); plugin=copy.deepcopy(next(n for n in root.walk() if n.kind=='Plugin'));plugin.set('pluginUid',43);root.children.append(plugin)
        with self.assertRaises(PreparationError): prepare(dumps(root),PROFILE,CATALOGUE)
        result,report=prepare(dumps(root),PROFILE,CATALOGUE,42); self.assertEqual(report['instanceUID'],42)
    def test_unknown_parameter_and_changed_catalogue(self):
        bad=copy.deepcopy(PROFILE);bad['encoders'][1]['hostParameter']='Invented'
        with self.assertRaises(PreparationError): prepare(dumps(fixture()),bad,CATALOGUE)
        cat=copy.deepcopy(CATALOGUE);cat['parameters'].pop()
        with self.assertRaises(PreparationError): prepare(dumps(fixture()),PROFILE,cat)
    def test_wrong_plugin_format_refused(self):
        root=fixture();next(n for n in root.walk() if n.kind=='Plugin').set('pluginTypeId','VST3-F6')
        with self.assertRaises(PreparationError): prepare(dumps(root),PROFILE,CATALOGUE)

if __name__=='__main__': unittest.main()
