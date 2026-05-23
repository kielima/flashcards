import { listLibraries, createLibrary, getDueCount, getNewCount } from '../db.js';
import { showModal, buildForm } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render() {
  setTitle(null);
  vc().innerHTML = `
    <div class="app-header">
      <h1>📚 Flashcards</h1>
      <button class="btn btn-primary btn-sm" id="new-lib-btn">+ Nova Biblioteca</button>
      <a href="#/settings" class="btn btn-icon" title="Configurações" style="font-size:20px;">⚙️</a>
    </div>
    <div class="home-container">
      <div class="library-grid" id="lib-grid">
        <div style="color:var(--text-secondary);font-size:14px;grid-column:1/-1;padding:20px 0">Carregando…</div>
      </div>
    </div>
  `;

  document.getElementById('new-lib-btn').addEventListener('click', openCreateModal);
  await loadLibraries();
}

async function loadLibraries() {
  const grid = document.getElementById('lib-grid');
  if (!grid) return;

  const libs = await listLibraries();

  if (!libs.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📭</div>
        <strong>Nenhuma biblioteca ainda</strong>
        <p>Clique em "Nova Biblioteca" para começar.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  for (const lib of libs) {
    const due = await getDueCount(lib.id);
    const newCount = await getNewCount(lib.id);

    const card = document.createElement('a');
    card.href = `#/library/${lib.id}`;
    card.className = 'library-card';
    card.innerHTML = `
      <div class="library-card-icon" style="background:${lib.color}22;color:${lib.color}">${lib.icon || '📚'}</div>
      <div class="library-card-name">${escHtml(lib.name)}</div>
      <div class="library-card-counts">
        <span class="due-badge${due === 0 ? ' hidden' : ''}">${due} para revisar</span>
        <span class="new-count">${newCount} novo${newCount !== 1 ? 's' : ''} · ${(await import('../db.js').then(m => m.listCards(lib.id))).length} total</span>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function openCreateModal(libData = null) {
  const isEdit = !!libData;
  const form = buildForm([
    { name: 'name',        label: 'Nome',      type: 'text',  placeholder: 'Ex: Anatomia, Japonês…', required: true, default: libData?.name || '' },
    { name: 'description', label: 'Descrição', type: 'text',  placeholder: 'Opcional', default: libData?.description || '' },
    { name: 'icon',        label: 'Ícone (emoji)', type: 'text', placeholder: '📚', maxlength: 2, default: libData?.icon || '' },
    { name: 'color',       label: 'Cor',       type: 'color', default: libData?.color || '#5B6EF5' }
  ]);

  const result = await showModal({
    title: isEdit ? 'Editar biblioteca' : 'Nova biblioteca',
    body: form,
    buttons: [
      { label: 'Cancelar', className: 'btn-ghost', value: null },
      { label: isEdit ? 'Salvar' : 'Criar', className: 'btn-primary', value: 'save' }
    ]
  });

  if (result !== 'save') return;

  const vals = form.getValues();
  if (!vals.name.trim()) { showToast('Nome obrigatório', 'error'); return; }

  const data = {
    name:        vals.name.trim(),
    description: vals.description.trim(),
    icon:        (vals.icon.trim() || '📚').slice(0, 2),
    color:       vals.color || '#5B6EF5'
  };

  if (isEdit) {
    await (await import('../db.js')).updateLibrary(libData.id, data);
    showToast('Biblioteca atualizada');
  } else {
    await createLibrary(data);
    showToast('Biblioteca criada!', 'success');
  }

  await loadLibraries();
}

export { openCreateModal };

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
