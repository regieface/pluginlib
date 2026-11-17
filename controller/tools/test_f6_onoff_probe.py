import copy
import struct
import unittest
from lp_project import dumps, loads, Variant
from test_lp_project import fixture, CATALOGUE, PROFILE
from prepare_lp_project import prepare, PreparationError
from prepare_f6_onoff_probe import prepare_probe, IDS

class OnOffProbeChecks(unittest.TestCase):
    def source(self):
        r=fixture()
        osc=next(n for n in r.walk() if n.get('ControllerType')=='OSC Controller')
        osc.set('OSChostIp','127.0.0.1');osc.set('OSCOutPort',9001)
        for n in osc.walk():
            if n.kind=='ControlTransform': n.set('relativeInputMode',0)
        return prepare(dumps(r),PROFILE,CATALOGUE)[0]
    def test_preserves_all_existing_controls_assignments_and_audio(self):
        root=loads(self.source()); root.properties['unrelatedLargeId']=Variant(b'\x06'+struct.pack('<q',2**40))
        src=dumps(root); out,report=prepare_probe(src,CATALOGUE)
        before,after=loads(src),loads(out)
        self.assertEqual(report['preservedAssignments'],86)
        self.assertEqual(report['addedMIDIControls'],0)
        for kind in ['Assignment','HardwareControl']:
            originals=[dumps(n) for n in before.walk() if n.kind==kind]
            new=[dumps(n) for n in after.walk() if n.kind==kind]
            self.assertEqual(len(new),len(originals)+6)
            self.assertTrue(all(n in new for n in originals))
        self.assertEqual([dumps(n) for n in before.children if n.kind!='HardwareControllers'],[dumps(n) for n in after.children if n.kind!='HardwareControllers'])
        for identifier in IDS:
            self.assertEqual(len([n for n in after.walk() if n.kind=='Assignment' and n.get('ParameterId')==identifier]),1)
        self.assertTrue(all(r['polarity']=='unknown' for r in report['mappings']))
        with self.assertRaises(PreparationError):prepare_probe(out,CATALOGUE)
    def test_reject_wrong_catalogue_or_ambiguous_instance(self):
        bad=copy.deepcopy(CATALOGUE);bad['parameters'][8]['id']=9
        with self.assertRaises(PreparationError):prepare_probe(self.source(),bad)
        root=loads(self.source()); root.children.append(copy.deepcopy(next(n for n in root.walk() if n.get('pluginTypeName')=='F6 (m)')))
        with self.assertRaises(PreparationError):prepare_probe(dumps(root),CATALOGUE)
