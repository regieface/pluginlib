import unittest, tempfile, json, csv
from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('reconcile_ilok',Path(__file__).with_name('reconcile-ilok.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);audit=module.audit

class ReconciliationTest(unittest.TestCase):
    def test_all_rows_are_accounted_for_without_trial_or_version_grants(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'data').mkdir();(root/'collection-privee').mkdir()
            plugins=[{'id':'pulsar-audio--w495','name':'W495','vendor':'Pulsar Audio'}, {'id':'mcdsp--spc2000','name':'SPC2000','vendor':'McDSP'}, {'id':'softube--other','name':'Other','vendor':'Softube'}, {'id':'v--eq-4','name':'EQ 4','vendor':'V'}]
            (root/'data/plugins.json').write_text(json.dumps({'plugins':plugins}));(root/'collection-privee/pluginlib-ma-collection-ilok.json').write_text(json.dumps({'status':{}}));(root/'collection-privee/releve-collection-ilok.md').write_text('')
            (root/'collection-privee/ilok-policy.json').write_text(json.dumps({'publishers':{'Softube AB':{'subscriptionStatus':'cancelled','retainOwnedIds':[]}}}))
            headers=['Product Name','Publisher Name','Type','License Status','Expiration Date','Subtype']
            rows=[['W495','Pulsar Audio','Trial/Demo','Expired','','Product'],['W495','Pulsar Audio','License','Active','','Product'],['SPC2000','McDSP','Rental','Active','21/09/2027','Product'],['Other','Softube AB','Subscription','Active','','Product'],['EQ 3','V','License','Active','','Product']]
            source=root/'source.csv'
            with source.open('w',newline='') as f:
                f.write('Export title\n');w=csv.writer(f);w.writerow(headers);w.writerows(rows)
            before=source.read_bytes();report,_=audit(source,root)
            self.assertEqual(report['summary']['sourceRows'],5)
            self.assertEqual(sum(report['summary']['rowsByDecision'].values()),5)
            grants={c['id']:c['new'] for c in report['changes']}
            self.assertEqual(grants,{'pulsar-audio--w495':'owned','mcdsp--spc2000':'subscription'})
            self.assertEqual(report['rows'][0]['decision'],'excluded');self.assertEqual(report['rows'][3]['decision'],'owner-cancelled');self.assertEqual(report['rows'][4]['decision'],'unmatched')
            self.assertEqual(source.read_bytes(),before)

if __name__=='__main__':unittest.main()
