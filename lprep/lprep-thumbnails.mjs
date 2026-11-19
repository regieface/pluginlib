import { localThumbnail, thumbnailUrl } from './lprep-catalog-view.mjs';
import { THUMBNAIL_CACHE } from './lprep-thumbnail-cache.mjs';

function startCache() {
  if (!navigator.serviceWorker) return Promise.resolve(false);
  const workers = navigator.serviceWorker;
  return workers.register('./thumbnail-worker.mjs', { type: 'module' }).then(() => {
    if (workers.controller) return true;
    return new Promise(resolve => {
      const complete = () => {
        clearTimeout(timer);
        workers.removeEventListener('controllerchange', complete);
        resolve(Boolean(workers.controller));
      };
      const timer = setTimeout(complete, 3500);
      workers.addEventListener('controllerchange', complete, { once: true });
      if (workers.controller) complete();
    });
  }).catch(() => false);
}

export function createThumbnailView(catalogBase) {
  const ready = startCache();
  const readyCallbacks = new WeakMap();
  async function load(art) {
    const cached = await ready;
    if (!art.isConnected) return;
    const raw = art.dataset.thumbnail;
    const source = cached ? thumbnailUrl(raw, catalogBase) : localThumbnail(raw, catalogBase);
    if (!source) return;
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      art.querySelector('span').hidden = true;
      image.classList.add('ready');
      readyCallbacks.get(art)?.();
    };
    image.onerror = () => {
      image.remove();
      if (cached) globalThis.caches.open(THUMBNAIL_CACHE)
        .then(cache => cache.delete(source)).catch(() => {});
    };
    art.append(image);
    image.src = source;
  }

  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      void load(target);
    }
  });
  return {
    create(plugin, { onReady } = {}) {
      const art = document.createElement('div');
      art.className = 'plugin-art';
      const placeholder = document.createElement('span');
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = plugin.name;
      art.append(placeholder);
      if (thumbnailUrl(plugin.image, catalogBase)) {
        art.dataset.thumbnail = plugin.image;
        if (onReady) readyCallbacks.set(art, onReady);
        observer.observe(art);
      }
      return art;
    },
    clear(container) {
      for (const art of container.querySelectorAll('[data-thumbnail]')) observer.unobserve(art);
    }
  };
}
