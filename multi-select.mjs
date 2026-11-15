// Contrôle natif <details> : sélection multiple au clavier et exclusions explicites.
export function mountMultiSelect(root, { label, emptyLabel = 'Tous', options, getSelection, onChange }) {
  let counts = null, query = '';
  const norm = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const details = document.createElement('details'); details.className = 'multi-select';
  const summary = document.createElement('summary');
  const panel = document.createElement('div'); panel.className = 'multi-panel';
  const toolbar = document.createElement('div'); toolbar.className = 'multi-toolbar';
  const hint = document.createElement('small'); hint.textContent = 'Cocher pour inclure · − pour exclure';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Tout afficher';
  clear.addEventListener('click', () => { onChange({ include: [], exclude: [] }); refresh(); });
  toolbar.append(hint, clear); panel.append(toolbar);
  const list = document.createElement('div'); list.className = 'multi-options';
  const rows = options.map(([value, text, count]) => {
    const row = document.createElement('div'); row.className = 'multi-row';
    const item = document.createElement('label');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    const caption = document.createElement('span'); caption.textContent = `${text}${count != null ? ` (${count})` : ''}`;
    checkbox.addEventListener('change', () => update(value, 'include', checkbox.checked));
    item.append(checkbox, caption);
    const exclude = document.createElement('button'); exclude.type = 'button'; exclude.className = 'exclude-option';
    exclude.addEventListener('click', () => update(value, 'exclude', !getSelection().exclude.includes(value)));
    row.append(item, exclude); list.append(row);
    return { value, text, count, caption, row, checkbox, exclude };
  });
  if (options.length > 8) {
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Chercher dans les choix…'; search.setAttribute('aria-label', `Chercher : ${label}`);
    search.addEventListener('input', () => { query = norm(search.value); refresh(); });
    panel.append(search);
  }
  panel.append(list); details.append(summary, panel); root.replaceChildren(details);
  function update(value, mode, enabled) {
    const selection = getSelection();
    const next = { include: selection.include.filter((v) => v !== value), exclude: selection.exclude.filter((v) => v !== value) };
    if (enabled) next[mode].push(value);
    onChange(next); refresh();
  }
  function refresh(context) {
    if (context?.counts) counts = context.counts;
    const { include, exclude } = getSelection();
    const selected = options.filter(([value]) => include.includes(value)).map(([, text]) => text);
    summary.textContent = selected.length ? `${selected.length === 1 ? selected[0] : `${selected.length} sélectionnés`}${exclude.length ? ` · ${exclude.length} exclus` : ''}` : exclude.length ? `Tous sauf ${exclude.length}` : emptyLabel;
    summary.setAttribute('aria-label', `${label} : ${summary.textContent}`);
    root.closest('.field').classList.toggle('active', !!include.length || !!exclude.length);
    rows.forEach(({ value, text, count, caption, row, checkbox, exclude: button }) => {
      checkbox.checked = include.includes(value);
      const excluded = exclude.includes(value);
      const available = counts ? counts.get(value) || 0 : count;
      const active = checkbox.checked || excluded;
      row.hidden = (counts && available === 0 && !active) || !norm(text).includes(query);
      caption.textContent = `${text}${available != null ? ` (${available})` : ''}`;
      row.classList.toggle('excluded', excluded);
      button.textContent = excluded ? '↶' : '−'; button.setAttribute('aria-pressed', String(excluded));
      button.setAttribute('aria-label', `${excluded ? 'Annuler l’exclusion de' : 'Exclure'} ${text}`); button.title = button.getAttribute('aria-label');
    });
  }
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    document.querySelectorAll('.multi-select[open]').forEach((other) => { if (other !== details) other.open = false; });
    panel.style.left = '0'; panel.style.right = 'auto';
    panel.style.top = 'calc(100% + 6px)'; panel.style.bottom = 'auto';
    if (panel.getBoundingClientRect().right > window.innerWidth - 12) { panel.style.left = 'auto'; panel.style.right = '0'; }
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 12 && details.getBoundingClientRect().top > rect.height + 12) {
      panel.style.top = 'auto'; panel.style.bottom = 'calc(100% + 6px)';
    }
  });
  refresh();
  return refresh;
}
