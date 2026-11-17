import copy
import json
import unittest
from pathlib import Path

from validate_controller_manifest import validate_manifest

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'controller/profile-manifest.json').read_text())
CATALOGUE = json.loads((ROOT / 'data/plugins.json').read_text())


class ControllerManifestTests(unittest.TestCase):
    def test_real_manifest_links_waves_f6(self):
        self.assertEqual(validate_manifest(MANIFEST, CATALOGUE), [])

    def test_unknown_plugin_is_rejected(self):
        invalid = copy.deepcopy(MANIFEST)
        invalid['links'][0]['pluginId'] = 'plugin-inexistant'
        self.assertTrue(any('absent du catalogue' in error for error in validate_manifest(invalid, CATALOGUE)))

    def test_mismatched_profile_id_is_rejected(self):
        invalid = copy.deepcopy(MANIFEST)
        invalid['links'][0]['profiles'][0]['profileId'] = 'profil-inexistant'
        self.assertTrue(any('ne correspond pas au fichier' in error for error in validate_manifest(invalid, CATALOGUE)))

    def test_path_outside_profiles_is_rejected(self):
        invalid = copy.deepcopy(MANIFEST)
        invalid['links'][0]['profiles'][0]['profilePath'] = '../data/plugins.json'
        self.assertTrue(any('controller/Profiles' in error for error in validate_manifest(invalid, CATALOGUE)))

    def test_host_name_must_match_verified_metadata(self):
        invalid = copy.deepcopy(MANIFEST)
        invalid['links'][0]['profiles'][0]['variants'][0]['host']['pluginName'] = 'Nom inventé'
        self.assertTrue(any('ne correspond pas aux métadonnées' in error for error in validate_manifest(invalid, CATALOGUE)))


if __name__ == '__main__':
    unittest.main()
