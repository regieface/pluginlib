#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = ROOT / 'controller'


def non_empty(value):
    return isinstance(value, str) and value == value.strip() and bool(value)


def safe_path(candidate, directory):
    if not non_empty(candidate) or Path(candidate).is_absolute():
        return None
    resolved = (CONTROLLER / candidate).resolve()
    allowed = (CONTROLLER / directory).resolve()
    return resolved if resolved.is_relative_to(allowed) and resolved != allowed else None


def validate_manifest(manifest, catalogue):
    errors = []
    if not isinstance(manifest, dict) or manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('links'), list):
        return ['Le manifeste doit utiliser schemaVersion 1 et contenir links[].']
    plugin_ids = {item.get('id') for item in catalogue.get('plugins', []) if isinstance(item, dict)}
    linked_plugins, linked_profiles = set(), set()
    for link_index, link in enumerate(manifest['links']):
        at = f'links[{link_index}]'
        if not isinstance(link, dict) or not non_empty(link.get('pluginId')):
            errors.append(f'{at}.pluginId est requis.')
            continue
        plugin_id = link['pluginId']
        if plugin_id not in plugin_ids:
            errors.append(f'{at}.pluginId est absent du catalogue : {plugin_id}')
        if plugin_id in linked_plugins:
            errors.append(f'{at}.pluginId est dupliqué : {plugin_id}')
        linked_plugins.add(plugin_id)
        profiles = link.get('profiles')
        if not isinstance(profiles, list) or not profiles:
            errors.append(f'{at}.profiles doit être non vide.')
            continue
        for profile_index, entry in enumerate(profiles):
            where = f'{at}.profiles[{profile_index}]'
            if not isinstance(entry, dict) or not non_empty(entry.get('profileId')):
                errors.append(f'{where}.profileId est requis.')
                continue
            profile_id = entry['profileId']
            if profile_id in linked_profiles:
                errors.append(f'{where}.profileId est déjà lié : {profile_id}')
            linked_profiles.add(profile_id)
            profile_file = safe_path(entry.get('profilePath'), 'Profiles')
            if not profile_file:
                errors.append(f'{where}.profilePath doit rester dans controller/Profiles/.')
            else:
                try:
                    actual_id = json.loads(profile_file.read_text())['id']
                    if actual_id != profile_id:
                        errors.append(f'{where}.profileId ne correspond pas au fichier : {actual_id}')
                except (OSError, ValueError, KeyError) as error:
                    errors.append(f'{where}.profilePath est illisible : {error}')
            if entry.get('status') not in ('draft', 'verified'):
                errors.append(f'{where}.status doit valoir draft ou verified.')
            variants = entry.get('variants')
            if not isinstance(variants, list) or not variants:
                errors.append(f'{where}.variants doit être non vide.')
                variants = []
            variant_keys = set()
            for variant_index, variant in enumerate(variants):
                variant_at = f'{where}.variants[{variant_index}]'
                if not isinstance(variant, dict) or not non_empty(variant.get('format')) or not non_empty(variant.get('channelLayout')):
                    errors.append(f'{variant_at} exige format et channelLayout.')
                    continue
                host = variant.get('host')
                if not isinstance(host, dict) or not non_empty(host.get('application')) or not non_empty(host.get('pluginName')):
                    errors.append(f'{variant_at}.host exige application et pluginName.')
                    host = {}
                if variant.get('status') not in ('draft', 'verified'):
                    errors.append(f'{variant_at}.status doit valoir draft ou verified.')
                key = (variant['format'], variant['channelLayout'], host.get('application'), host.get('pluginName'))
                if key in variant_keys:
                    errors.append(f'{variant_at} duplique une variante du même profil.')
                variant_keys.add(key)
                if 'metadataPath' in variant:
                    metadata = safe_path(variant['metadataPath'], 'Metadata')
                    if not metadata or not metadata.is_file():
                        errors.append(f'{variant_at}.metadataPath doit désigner un fichier de controller/Metadata/.')
                    else:
                        try:
                            evidence = json.loads(metadata.read_text())
                            if evidence.get('lpPluginName') != host.get('pluginName'):
                                errors.append(f'{variant_at}.host.pluginName ne correspond pas aux métadonnées.')
                            tested = host.get('testedVersion')
                            if tested and evidence.get('observedLPVersion') != tested:
                                errors.append(f'{variant_at}.host.testedVersion ne correspond pas aux métadonnées.')
                        except (OSError, ValueError) as error:
                            errors.append(f'{variant_at}.metadataPath est illisible : {error}')
            unresolved = entry.get('unresolved')
            if not isinstance(unresolved, list):
                errors.append(f'{where}.unresolved doit être un tableau, même vide.')
                unresolved = []
            for missing_index, missing in enumerate(unresolved):
                if not isinstance(missing, dict) or not non_empty(missing.get('field')) or not non_empty(missing.get('reason')):
                    errors.append(f'{where}.unresolved[{missing_index}] exige field et reason.')
    return errors


def load_and_validate():
    manifest = json.loads((CONTROLLER / 'profile-manifest.json').read_text())
    catalogue = json.loads((ROOT / 'data/plugins.json').read_text())
    return validate_manifest(manifest, catalogue)


if __name__ == '__main__':
    problems = load_and_validate()
    if problems:
        raise SystemExit('\n'.join(problems))
    print('Manifeste Controller valide : 1 liaison PluginLib vérifiée.')
