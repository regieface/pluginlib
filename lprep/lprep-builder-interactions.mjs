export function dropGeometry(orientation, kind, event, bounds) {
  const alongColumns = (orientation === 'vertical') === (kind === 'chain');
  const [position, start, end] = alongColumns
    ? [event.clientX, bounds.left, bounds.right]
    : [event.clientY, bounds.top, bounds.bottom];
  return { after: position >= (start + end) / 2, inside: position >= start && position <= end };
}

export function bindBuilderDrag({ list, orientation, revision, moveChain, movePlugin, insertPlugin }) {
  let source = null, target = null;
  const slot = document.createElement('div');
  slot.className = 'plugin-drop-slot';
  slot.setAttribute('aria-hidden', 'true');

  function clearTarget() {
    slot.remove();
    target?.row.classList.remove('drop-before', 'drop-after');
    target = null;
  }
  function finish() {
    clearTarget();
    source?.element.classList.remove('drag-source');
    list.classList.remove('plugin-drag-active');
    source = null;
  }
  function start(element, data) {
    element.draggable = true;
    element.ondragstart = event => {
      finish();
      source = { ...data, element, revision: revision(), orientation: orientation() };
      element.classList.add('drag-source');
      list.classList.toggle('plugin-drag-active', data.kind !== 'chain');
      event.dataTransfer.effectAllowed = data.kind === 'catalog' ? 'copy' : 'move';
      event.dataTransfer.setData('text/plain', data.label);
    };
    element.ondragend = finish;
  }
  function current(event) {
    if (!source || source.revision !== revision() || source.orientation !== orientation() || !source.element.isConnected) return null;
    const row = event.target.closest('.chain-row');
    if (!row || !list.contains(row)) return null;
    if (source.kind === 'chain') {
      const { after } = dropGeometry(source.orientation, source.kind, event, row.getBoundingClientRect());
      return { row, after, beforeId: after ? row.nextElementSibling?.dataset.chain ?? null : row.dataset.chain };
    }
    const strip = event.target.closest('.plugin-strip');
    if (!strip) return null;
    if (target?.row === row && slot.isConnected) {
      if (dropGeometry(source.orientation, source.kind, event, slot.getBoundingClientRect()).inside) return target;
    }
    const tiles = [...strip.querySelectorAll(':scope > [data-path-plugin]')];
    const before = tiles.find(tile => !dropGeometry(source.orientation, source.kind, event, tile.getBoundingClientRect()).after);
    return { row, strip, anchor: before || strip.querySelector('.independent'),
      beforeId: before?.dataset.pathPlugin ?? null };
  }

  list.ondragenter = list.ondragover = event => {
    const next = current(event);
    if (!next) { clearTarget(); return; }
    event.preventDefault();
    event.dataTransfer.dropEffect = source.kind === 'catalog' ? 'copy' : 'move';
    if (target?.row === next.row && target.beforeId === next.beforeId && target.after === next.after) return;
    clearTarget();
    target = next;
    if (source.kind === 'chain') {
      next.row.classList.add(next.after ? 'drop-after' : 'drop-before');
    } else {
      next.strip.insertBefore(slot, next.anchor);
    }
  };
  list.ondragleave = event => {
    if (!list.contains(event.relatedTarget)) clearTarget();
  };
  list.ondrop = event => {
    const drop = current(event);
    const dragged = source;
    finish();
    if (!drop) return;
    event.preventDefault();
    const chainId = drop.row.dataset.chain;
    if (dragged.kind === 'chain') moveChain(dragged.chainId, drop.beforeId);
    if (dragged.kind === 'plugin') movePlugin(dragged.chainId, dragged.instanceId, drop.beforeId, chainId);
    if (dragged.kind === 'catalog') insertPlugin(dragged.plugin, chainId, drop.beforeId);
  };
  return start;
}

export function bindContextMenu(menu) {
  const action = menu.querySelector('button');
  let origin;
  function close({ restoreFocus = false } = {}) {
    menu.hidden = true;
    if (restoreFocus && origin?.isConnected) origin.focus();
    origin = null;
  }
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (!menu.hidden && event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); }
  });
  window.addEventListener('scroll', () => close(), true);
  window.addEventListener('resize', () => close());
  return (element, label, execute) => {
    element.oncontextmenu = event => {
      event.preventDefault();
      event.stopPropagation();
      origin = element;
      action.textContent = label;
      menu.hidden = false;
      const bounds = element.getBoundingClientRect();
      const x = event.clientX || bounds.left;
      const y = event.clientY || bounds.bottom;
      menu.style.left = `${Math.max(0, Math.min(x, innerWidth - menu.offsetWidth))}px`;
      menu.style.top = `${Math.max(0, Math.min(y, innerHeight - menu.offsetHeight))}px`;
      action.onclick = () => { close({ restoreFocus: true }); execute(); };
      action.focus({ preventScroll: true });
    };
  };
}
