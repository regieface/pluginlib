import { stripHtml, decode } from './parse.mjs';

// Les lignes d'une table de téléchargements restent des produits distincts.
// Les bundles ne sont pas éclatés en variantes artificielles.
export function parseDownloadTable(html, url) {
  const sections = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)];
  const out = [];
  for (const [, heading, body] of sections) {
    const label = stripHtml(heading);
    if (!/latest versions|legacy.*discontinued/i.test(label)) continue;
    for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripHtml(m[1]));
      if (!cells[0] || /plug-in|series/i.test(cells[0])) continue;
      const discontinued = /discontinued/i.test(label);
      out.push({ name: cells[0], description: cells[2] || '', text: cells.join(' '), url: `${url}#${discontinued ? 'legacy-discontinued' : 'latest-versions'}`, image: null,
        metadata: { platforms: ['windows'], catalogStatus: discontinued ? 'discontinued' : 'free',
          platformEvidence: { url, excerpt: 'Requirements: Windows / Win10, VST' },
          statusEvidence: { url, excerpt: label } }, source: 'table téléchargements constructeur' });
    }
  }
  return out;
}

export function parseLSP(html, url) {
  const out = [];
  for (const match of html.matchAll(/<a\b[^>]*data-src="([^"]*bundle\.php\?bundle=([a-z0-9_]+))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = stripHtml((match[3].match(/class="tile-name"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const src = (match[3].match(/<img[^>]*src="([^"]+)"/i) || [])[1];
    if (!name) continue;
    out.push({ name, url: new URL(decode(match[1]), url).href, image: src ? new URL(src, url).href : null,
      description: '', text: name, source: 'catalogue officiel LSP',
      metadata: { platforms: ['linux'], catalogStatus: 'free',
        platformEvidence: { url: new URL('/', url).href, excerpt: 'Open-source plugins for GNU/Linux; VST2 / LinuxVST, VST3, LV2, CLAP.' },
        statusEvidence: { url: new URL('/', url).href, excerpt: 'Currently project is developed and maintained by LSP Project Team.' } } });
  }
  return out;
}

export function parseChow(html, url) {
  const out = [];
  const parts = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)];
  for (const [, title, body] of parts) {
    const name = stripHtml(title);
    if (!/Chow|BYOD/i.test(name) || /Kick|VCV|Multiverse/i.test(name) || !/releases\/download\//.test(body)) continue;
    const platforms = [];
    for (const [id, token] of [['macos', '-Mac-'], ['windows', '-Win-'], ['linux', '-Linux-']]) if (body.includes(token)) platforms.push(id);
    const description = stripHtml((body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
    const image = (body.match(/<img[^>]*src="([^"]+)"/i) || [])[1];
    out.push({ name, description: description.slice(0, 220), text: description, url: `${url}#${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      image: image ? new URL(image, url).href : null, source: 'téléchargements officiels ChowDSP',
      metadata: { platforms, catalogStatus: 'free', platformEvidence: { url, excerpt: 'Windows / Mac / Linux: liens de téléchargement par produit.' }, statusEvidence: { url, excerpt: 'Versions publiées disponibles en téléchargement avec code source.' } } });
  }
  return out;
}

export function parseAirwindowsPosts(posts) {
  const out = [];
  for (const post of posts) {
    const name = stripHtml(post.title?.rendered || '');
    const html = post.content?.rendered || '';
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Un article ne devient une fiche que s'il propose son propre binaire .zip.
    const downloads = [...html.matchAll(/href=["']([^"']+\.zip(?:\?[^"']*)?)["']/gi)].map((m) => decode(m[1]));
    const ownDownload = downloads.some((u) => {
      const file = new URL(u, post.link).pathname.split('/').pop().replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return file === key;
    });
    if (!key || name.length > 65 || !ownDownload) continue;
    const text = stripHtml(html);
    const description = text.split(/\n/).find((line) => line.length > 35 && !/download|\.zip/i.test(line)) || '';
    const image = (html.match(/<img[^>]*src=["']([^"']+)["']/i) || [])[1];
    out.push({ name, url: post.link, description: description.slice(0, 220), text, image: image ? new URL(image, post.link).href : null,
      metadataText: text, source: 'articles et binaires officiels Airwindows' });
  }
  return out;
}

export function parseWavesfactoryFree(html,url){
 const out=[];for(const m of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)){
  const heading=stripHtml(m[1]),names={'Flash':'Flash','Snare Buzz':'SnareBuzz','SK10':'SK10','Cassette Transport':'Cassette Transport'},name=names[heading];if(!name)continue;
  const prefix=html.slice(0,m.index);const tag=[...prefix.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].at(-1);const image=tag?new URL(tag[1],url).href:null;
  const paragraphs=[...m[2].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(x=>stripHtml(x[1]));const description=paragraphs.find(p=>new RegExp(name.replace('SnareBuzz','SnareBuzz|Snare Buzz'),'i').test(p))||paragraphs.find(p=>p.length>40)||'';
  out.push({name,url:`${url}#${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,image,description:description.slice(0,600),text:description,source:'catalogue gratuit officiel Wavesfactory',metadata:{platforms:['macos','windows'],catalogStatus:'free',platformEvidence:{url,excerpt:'Platforms: macOS, Windows. 64 bit only.'},statusEvidence:{url,excerpt:'Download now our full collection of free plugins!'}}});
 }return out;
}
