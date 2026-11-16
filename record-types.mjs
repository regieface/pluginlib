// Les fiches hors périmètre restent archivées avec leur identifiant de collection.
export const RECORD_TYPES={effect:'Effets / utilitaires',instrument:'Instruments',bundle:'Packs de plugins',application:'Applications / installateurs',module:'Modules / extensions',hardware:'Matériel audio',unknown:'Type à vérifier'};
export function auditRecordType(plugin){
 const evidence=plugin.recordTypeEvidence;
 if(evidence?.method==='reviewed-source'&&RECORD_TYPES[evidence.type]&&evidence.url){plugin.recordType=evidence.type;return plugin;}
 plugin.recordType=plugin.category!=='other'?'effect':'unknown';
 plugin.recordTypeEvidence=plugin.recordType==='effect'?{type:'effect',method:'product-family',url:plugin.categoryEvidence?.url,excerpt:plugin.categoryEvidence?.excerpt}:undefined;
 return plugin;
}
