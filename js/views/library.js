import { getLibrary, listCards, getReviewState, getDueCount, getNewCount, deleteLibrary, exportDeck } from '../db.js';
import { showModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render(libraryId) {
  const lib = await getLibrary(libraryId);
  if (!lib) { location.hash = '#/'; return; }

  setTitle(lib.name);
  document.documentElement.style.setProperty('--deck-color', lib.color || '#5B6EF5');

  const due = await getDueCount(libraryId);

  vc().innerHTML = `
    <div class="app-header">
      <a href="#/" class="back-btn">←</a>
      <div class="library-card-icon" style="background:${lib.color}33;color:${lib.color};width:32px;height:32px;border-radius:8px;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lib.icon || '📚'}
      </div>
      <h1 style="flex:1;font-size:16px;">${escHtml(lib.name)}</h1>
      <button class="btn btn-icon" id="menu-btn" style="font-size:20px;">⋯</button>
    </div>

    <div class="library-header">
      <button class="btn btn-primary review-cta${due > 0 ? ' visible' : ''}" id="review-btn">
        ▶ Revisar agora (${due} card${due !== 1 ? 's' : ''})
      </button>
      <button class="btn btn-ghost" id="typing-btn" style="width:100%;border-radius:var(--radius)">
        ⌨ Modo digitação
      </button>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="cards">Cards</button>
      <button class="tab-btn" data-tab="stats">Estatísticas</button>
    </div>

    <div id="tab-cards" class="tab-panel active"></div>
    <div id="tab-stats" class="tab-panel"></div>

    <button class="fab" id="add-card-btn" title="Novo card">+</button>
  `;

  document.getElementById('review-btn').addEventListener('click', () => {
    location.hash = `#/library/${libraryId}/review`;
  });

  document.getElementById('typing-btn').addEventListener('click', () => {
    location.hash = `#/library/${libraryId}/typing`;
  });

  document.getElementById('add-card-btn').addEventListener('click', () => {
    location.hash = `#/library/${libraryId}/card/new`;
  });

  document.getElementById('menu-btn').addEventListener('click', () => openMenu(lib, libraryId));

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'stats') renderStats(libraryId);
    });
  });

  await renderCardsList(libraryId);
}

async function renderCardsList(libraryId) {
  const panel = document.getElementById('tab-cards');
  if (!panel) return;

  const cards = await listCards(libraryId);

  if (!cards.length) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon">🃏</div><strong>Nenhum card ainda</strong><p>Clique em + para criar o primeiro.</p></div>`;
    return;
  }

  const list = document.createElement('div');
  list.className = 'card-list';

  cards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'card-item';
    const frontText = card.front.replace(/[#*_`$]/g, '').slice(0, 80);
    item.innerHTML = `
      <div class="card-item-content">
        <div class="card-item-front">${escHtml(frontText)}</div>
        <div class="card-item-tags">${(card.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>
      </div>
      <button class="btn btn-icon" style="flex-shrink:0" data-edit="${card.id}">✏️</button>
    `;
    item.querySelector('[data-edit]').addEventListener('click', e => {
      e.stopPropagation();
      location.hash = `#/library/${card.libraryId}/card/${card.id}`;
    });
    item.addEventListener('click', () => {
      location.hash = `#/library/${card.libraryId}/card/${card.id}`;
    });
    list.appendChild(item);
  });

  panel.innerHTML = '';
  panel.appendChild(list);
}

async function renderStats(libraryId) {
  const panel = document.getElementById('tab-stats');
  if (!panel || panel.dataset.loaded) return;
  panel.dataset.loaded = '1';

  const cards = await listCards(libraryId);
  let newCards = 0, learning = 0, mature = 0, young = 0;
  let nextDue = null;
  const now = new Date();

  for (const card of cards) {
    const r = await getReviewState(card.id);
    if (!r || r.state === 0) { newCards++; continue; }
    if (r.state === 1 || r.state === 3) { learning++; continue; }
    if (r.state === 2) {
      if ((r.scheduled_days || 0) >= 21) mature++;
      else young++;
    }
    const due = new Date(r.due);
    if (due > now && (!nextDue || due < nextDue)) nextDue = due;
  }

  panel.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${cards.length}</div><div class="stat-label">Total de cards</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--text-secondary)">${newCards}</div><div class="stat-label">Novos (não revisados)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--color-hard)">${learning}</div><div class="stat-label">Em aprendizado</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--color-good)">${mature}</div><div class="stat-label">Maduros (≥21d)</div></div>
      <div class="stat-card" style="grid-column:1/-1">
        <div class="stat-value" style="font-size:16px">${nextDue ? nextDue.toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' }) : '—'}</div>
        <div class="stat-label">Próxima revisão agendada</div>
      </div>
    </div>
  `;
}

async function openMenu(lib, libraryId) {
  const result = await showModal({
    menuItems: [
      { icon: '✏️', label: 'Editar biblioteca',  value: 'edit' },
      { icon: '📤', label: 'Exportar deck',       value: 'export' },
      { icon: '🗑️', label: 'Excluir biblioteca',  value: 'delete', danger: true },
      { icon: '✕',  label: 'Cancelar',            value: null,     cancel: true }
    ]
  });

  if (result === 'edit') {
    const { openCreateModal } = await import('./home.js');
    await openCreateModal(lib);
    render(libraryId);
  } else if (result === 'export') {
    const data = await exportDeck(libraryId);
    downloadJSON(data, `${lib.name.toLowerCase().replace(/\s+/g, '-')}.deck.json`);
    showToast('Deck exportado!', 'success');
  } else if (result === 'delete') {
    const confirm = await showModal({
      title: 'Excluir biblioteca?',
      body: `<p style="color:var(--text-secondary);font-size:14px">Isso excluirá "<strong>${escHtml(lib.name)}</strong>" e todos os seus cards e histórico de revisões. Esta ação não pode ser desfeita.</p>`,
      buttons: [
        { label: 'Cancelar', className: 'btn-ghost', value: null },
        { label: 'Excluir', className: 'btn-danger', value: 'delete' }
      ]
    });
    if (confirm === 'delete') {
      await deleteLibrary(libraryId);
      showToast('Biblioteca excluída');
      location.hash = '#/';
    }
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
