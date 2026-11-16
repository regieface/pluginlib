"""Rapprochement exact d'un export iLok ; ne modifie jamais le CSV source."""
import argparse, csv, json, re, unicodedata, difflib
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

def norm(value):
    value = unicodedata.normalize('NFKD', value.replace('™', '').replace('®', '')).lower()
    value = re.sub(r'\s+(?:plug-in|plugin|plug)$', '', value)
    return re.sub('[^a-z0-9]', '', value)

PUBLISHERS = {'Softube AB':['Softube'], 'Solid State Logic':['Solid State Logic','Harrison'], 'Slate Digital':['Slate Digital'], 'Eiosis':['Slate Digital','Eiosis'], 'sonible GmbH':['sonible'], 'Universal Audio, Inc.':['Universal Audio'], 'Sonnox Ltd.':['Sonnox'], 'Relab Development ApS':['Relab']}

def keys(name, vendor):
    result={norm(name)}
    prefixes={vendor,'SSL' if vendor=='Solid State Logic' else vendor,'Eiosis' if vendor=='Slate Digital' else vendor}
    for prefix in prefixes:
        short=re.sub(r'^'+re.escape(prefix)+r'[\s:–—-]+','',name,flags=re.I)
        result.add(norm(short))
    return result

def license_status(row):
    if row['Type']=='Trial/Demo': return 'excluded-trial'
    if row['License Status']=='Expired': return 'excluded-expired'
    if row['License Status']=='Subscription suspended': return 'former'
    if row['License Status']=='Active':
        return {'License':'owned','Subscription':'subscription','Rental':'subscription'}.get(row['Type'],'unconfirmed')
    return 'unconfirmed'

def audit(csv_path, root):
    with csv_path.open(encoding='utf-8-sig',newline='') as f:
        next(f); rows=list(csv.DictReader(f))
    plugins=json.loads((root/'data/plugins.json').read_text())['plugins']
    current=json.loads((root/'collection-privee/pluginlib-ma-collection-ilok.json').read_text())
    policy_path=root/'collection-privee/ilok-policy.json'
    policies=json.loads(policy_path.read_text()).get('publishers',{}) if policy_path.exists() else {}
    previous=current.get('status',{}); index=defaultdict(set); by_id={p['id']:p for p in plugins}
    for p in plugins:
        if p.get('duplicateOf'): continue
        for name in [p['name']]+p.get('aliases',[]):
            for key in keys(name,p['vendor']):index[(p['vendor'],key)].add(p['id'])
    # Équivalences déjà documentées dans le relevé initial, sans en inventer de nouvelles.
    reviewed={}
    evidence={}
    alias_path=root/'collection-privee/ilok-equivalences.json'
    if alias_path.exists():
        for alias in json.loads(alias_path.read_text()):
            if alias['id'] in by_id:
                reviewed[(alias['publisher'],alias['name'])]=alias['id']
                evidence[(alias['publisher'],alias['name'])]=alias
    for line in (root/'collection-privee/releve-collection-ilok.md').read_text().splitlines():
        cells=[s.strip() for s in line.strip('|').split('|')]
        if len(cells)!=5 or ' — ' not in cells[0] or ' — ' not in cells[1]: continue
        publisher,name=cells[0].split(' — ',1); vendor,target=cells[1].split(' — ',1)
        candidates=index.get((vendor,norm(target)),set())
        if len(candidates)==1:reviewed.setdefault((publisher,name),next(iter(candidates)))
    results=[]; grants=defaultdict(list)
    for number,row in enumerate(rows,3):
        publisher,name=row['Publisher Name'],row['Product Name']; state=license_status(row)
        candidates=set()
        for vendor in PUBLISHERS.get(publisher,[publisher]):
            for k in keys(name,vendor):candidates |= index.get((vendor,k),set())
        method='exact-name'; old=reviewed.get((publisher,name))
        if old and old in by_id:candidates={old};method='previous-reviewed-mapping'
        mapped=next(iter(candidates)) if len(candidates)==1 else None
        decision='excluded' if state.startswith('excluded-') else 'matched' if mapped else 'ambiguous' if len(candidates)>1 else 'unmatched'
        policy=policies.get(publisher,{})
        if policy.get('subscriptionStatus')=='cancelled' and mapped not in policy.get('retainOwnedIds',[]) and not state.startswith('excluded-'):
            decision='owner-cancelled';state='former'
        record={'line':number,'publisher':publisher,'name':name,'type':row['Type'],'licenseStatus':row['License Status'],'expiration':row['Expiration Date'],'subtype':row['Subtype'],'state':state,'decision':decision,'id':mapped,'method':method if mapped else None}
        if (publisher,name) in evidence:record['mappingEvidence']=evidence[(publisher,name)]
        if decision in ['unmatched','ambiguous']:
            pool=[p for p in plugins if p['vendor'] in PUBLISHERS.get(publisher,[publisher]) and not p.get('duplicateOf')]
            record['suggestions']=[{'id':p['id'],'name':p['name']} for p in sorted(pool,key=lambda p:difflib.SequenceMatcher(None,norm(name),norm(p['name'])).ratio(),reverse=True)[:3] if difflib.SequenceMatcher(None,norm(name),norm(p['name'])).ratio()>.45]
        results.append(record)
        if decision=='matched' and state in ['owned','subscription','former']:grants[mapped].append(record)
    priority={'former':1,'subscription':2,'owned':3};changes=[]
    for id,proofs in grants.items():
        proof=max(proofs,key=lambda p:priority[p['state']]); new=proof['state']; old=previous.get(id)
        if priority.get(old,0)>priority[new]:continue
        if old!=new:changes.append({'id':id,'name':by_id[id]['name'],'vendor':by_id[id]['vendor'],'old':old,'new':new,'sourceLines':[p['line'] for p in proofs if p['state']==new]})
    pending={(r['publisher'],r['name']) for r in results if r['decision'] in ['unmatched','ambiguous'] and r['state'] in ['owned','subscription']}
    groups={(r['publisher'],r['name']) for r in results if (r['publisher'],r['name']) in pending and ('Group' in r['subtype'] or r['name'].startswith('Complete Access:'))}
    summary={'sourceRows':len(rows),'rowsByDecision':dict(Counter(r['decision'] for r in results)),'sourceStates':dict(Counter(r['state'] for r in results)),'distinctGrantedProducts':len(grants),'collectionChanges':len(changes),'unmatchedCurrentProducts':len(pending-groups),'unmatchedCurrentGroups':len(groups),'wavesfactorySourceRows':sum('wavesfactory' in norm(r['publisher']) for r in results)}
    return {'summary':summary,'changes':changes,'rows':results},current

def main():
    parser=argparse.ArgumentParser();parser.add_argument('csv',type=Path);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    report,current=audit(args.csv,args.root);folder=args.root/'collection-privee';folder.mkdir(exist_ok=True)
    if args.apply:
        path=folder/'pluginlib-ma-collection-ilok.json';backup=folder/'pluginlib-ma-collection-ilok-avant-rapprochement-complet.json'
        if not backup.exists():backup.write_bytes(path.read_bytes())
        for c in report['changes']:current['status'][c['id']]=c['new']
        priority={'former':1,'subscription':2,'owned':3}
        details=current.setdefault('licenseDetails',{})
        for r in report['rows']:
            if r['decision']!='matched' or r['state'] not in priority:continue
            old=details.get(r['id'])
            if old and priority.get(old.get('status'),0)>priority[r['state']]:continue
            lines=sorted(set((old.get('sourceLines',[]) if old and old.get('status')==r['state'] else [])+[r['line']]))
            details[r['id']]={'name':r['name'],'publisher':r['publisher'],'status':r['state'],'expiration':r['expiration'],'sourceLines':lines}
        unmatched={}
        for r in report['rows']:
            if r['decision'] not in ['unmatched','ambiguous'] or r['state'] not in ['owned','subscription']:continue
            key=(r['publisher'],r['name']);old=unmatched.get(key)
            if old and priority[old['status']]>=priority[r['state']]:
                if old['status']==r['state']:old['sourceLines'].append(r['line'])
                continue
            unmatched[key]={'publisher':r['publisher'],'name':r['name'],'status':r['state'],'expiration':r['expiration'],'sourceLines':[r['line']],'kind':'group' if 'Group' in r['subtype'] or r['name'].startswith('Complete Access:') else 'product'}
        current['unmatchedLicenses']=list(unmatched.values())
        current['collectionUpdatedOn']=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat();current['ilokAudit']={'sourceDate':'2026-11-15','rowsChecked':report['summary']['sourceRows']}
        path.write_text(json.dumps(current,ensure_ascii=False,indent=1)+'\n')
    (folder/'audit-ilok-complet.json').write_text(json.dumps(report,ensure_ascii=False,indent=1)+'\n')
    md=['# Rapprochement complet iLok au 15 novembre 2026','',f"{report['summary']['sourceRows']} lignes examinées. Le CSV source reste intact. Les numéros ci-dessous correspondent aux lignes du fichier source, en comptant son titre et son en-tête.",'','Les correspondances sont exactes par éditeur et produit, ou reprennent les équivalences du relevé initial. Les suggestions ne sont jamais importées automatiquement. Les versions Native/HD, bundles et versions majeures ne sont pas assimilés. La déclaration d’annulation Softube prime sur cet ancien export : seuls British Class A Drive et Deesser restent possédés.','','## Corrections de collection','','| Plugin | Statut ajouté | Lignes CSV |','|---|---|---|']
    md += [f"| {c['vendor']} — {c['name']} | {c['new']} | {', '.join(map(str,c['sourceLines']))} |" for c in report['changes']]
    md += ['','## Licences actuelles sans correspondance certaine','','| Éditeur | Licence iLok | État | Lignes CSV |','|---|---|---|---|']
    unmatched=defaultdict(list)
    for r in report['rows']:
        if r['decision'] in ['unmatched','ambiguous'] and r['state'] in ['owned','subscription']:unmatched[(r['publisher'],r['name'],r['state'])].append(r['line'])
    md += [f"| {v} | {n} | {s} | {', '.join(map(str,lines))} |" for (v,n,s),lines in sorted(unmatched.items())]
    md += ['','Les essais et droits expirés ne créent pas de licence active. Une ligne non rapprochée reste visible dans ce rapport ; elle n’est pas oubliée ni assimilée arbitrairement à une autre édition. Le détail de chaque ligne, y compris les exclusions et abonnements annulés, est dans audit-ilok-complet.json.','']
    (folder/'audit-ilok-complet.md').write_text('\n'.join(md));print(json.dumps(report['summary'],ensure_ascii=False));print(json.dumps(report['changes'],ensure_ascii=False))
if __name__=='__main__':main()
