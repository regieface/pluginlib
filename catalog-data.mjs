import { normalizeClassification } from './classification.mjs';
import { productDescription } from './descriptions.mjs';

export async function loadPluginCatalog() {
  async function read(name, fallback) {
    try {
      const response = await fetch(new URL(`./data/${name}.json`, import.meta.url), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Données du catalogue indisponibles (${name}).`);
      return await response.json();
    } catch (error) {
      if (fallback === undefined) throw error;
      return fallback;
    }
  }
  const [{ plugins }, { plans = [] }, descriptions] = await Promise.all([
    read('plugins'), read('subscriptions', { plans: [] }), read('descriptions-fr', {})
  ]);
  return {
    plans,
    plugins: plugins.map(plugin => ({
      ...normalizeClassification(plugin),
      presentation: productDescription(plugin, descriptions)
    }))
  };
}
