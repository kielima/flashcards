import { listLibraries, exportDeck, importDeck, exportBackup, importBackup, getSettings, saveSetting } from '../db.js';
import { showModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render() {
  setTitle('Configurações');
  const settings = await getSettings();

  vc().innerHTML = `
    <div class="app-header">
      <a href="#/" class="back-btn">←</a>
      <h1>Configurações</h1>
    </div>
    <div class="settings-container">

      <div class="settings-section">
        <h3>Exportar deck</h3>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Deck</strong>
              <span>Selecione qual exportar</span>
            </div>
            <select class="input select" id="export-deck-select" style="width:auto;min-width:140px"></select>
          </div>
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Exportar como .deck.json</strong>
              <span>Apenas conteúdo, sem histórico de revisões</span>
            </div>
            <button class="btn btn-primary btn-sm" id="export-deck-btn">Exportar</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Importar deck</h3>
        <div class="import-area" id="import-deck-area">
          <div class="import-icon">📥</div>
          <strong>Clique para selecionar arquivo</strong>
          <span>.deck.json</span>
        </div>
        <input type="file" id="import-deck-file" accept=".json" style="display:none">
        <div class="import-preview" id="import-deck-preview"></div>
        <div id="import-deck-actions" style="margin-top:10px;display:none;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="import-deck-confirm">Confirmar importação</button>
          <button class="btn btn-ghost btn-sm" id="import-deck-cancel">Cancelar</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Backup completo</h3>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Exportar tudo</strong>
              <span>Todas as decks, cards e histórico de revisões</span>
            </div>
            <button class="btn btn-ghost btn-sm" id="export-backup-btn">Backup</button>
          </div>
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Restaurar backup</strong>
              <span>Substitui todos os dados atuais</span>
            </div>
            <button class="btn btn-ghost btn-sm" id="import-backup-btn">Restaurar</button>
          </div>
        </div>
        <input type="file" id="import-backup-file" accept=".json" style="display:none">
      </div>

      <div class="settings-section">
        <h3>Configurações FSRS</h3>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Novos cards por dia</strong>
              <span>Máximo de cards novos introduzidos por dia</span>
            </div>
            <input class="input" id="max-new-input" type="number" min="0" max="9999" value="${settings.maxNewPerDay ?? 20}" style="width:80px;text-align:right">
          </div>
          <div class="settings-row">
            <div class="settings-row-label">
              <strong>Retenção desejada</strong>
              <span>Percentual alvo de acerto na revisão (%)</span>
            </div>
            <input class="input" id="retention-input" type="number" min="70" max="97" value="${Math.round((settings.desiredRetention ?? 0.9) * 100)}" style="width:80px;text-align:right">
          </div>
          <div class="settings-row">
            <button class="btn btn-ghost btn-sm" id="reset-settings-btn">Redefinir para padrões</button>
          </div>
        </div>
      </div>

    </div>
  `;

  await loadExportSelect();
  bindEvents();
}

async function loadExportSelect() {
  const sel = document.getElementById('export-deck-select');
  if (!sel) return;
  const libs = await listLibraries();
  sel.innerHTML = libs.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('') ||
    '<option value="">Nenhuma deck</option>';
}

let importDeckData = null;

function bindEvents() {
  // Export deck
  document.getElementById('export-deck-btn').addEventListener('click', async () => {
    const sel = document.getElementById('export-deck-select');
    if (!sel.value) { showToast('Nenhuma deck disponível', 'error'); return; }
    const libs = await listLibraries();
    const lib = libs.find(l => l.id == sel.value);
    const data = await exportDeck(sel.value);
    downloadJSON(data, `${(lib?.name || 'deck').toLowerCase().replace(/\s+/g,'-')}.deck.json`);
    showToast('Deck exportado!', 'success');
  });

  // Import deck - file trigger
  const importArea = document.getElementById('import-deck-area');
  const importFile = document.getElementById('import-deck-file');
  importArea.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const err = validateDeck(data);
      if (err) { showToast(err, 'error'); return; }
      importDeckData = data;
      showDeckPreview(data);
    } catch {
      showToast('Arquivo inválido ou corrompido', 'error');
    }
  });

  document.getElementById('import-deck-confirm').addEventListener('click', async () => {
    if (!importDeckData) return;
    const libs = await listLibraries();
    const sameName = libs.find(l => l.name === importDeckData.library.name);
    let mode = 'new';
    if (sameName) {
      const choice = await showModal({
        title: 'Deck já existe',
        body: `<p style="color:var(--text-secondary);font-size:14px">Já existe uma deck chamada "<strong>${escHtml(importDeckData.library.name)}</strong>". Como deseja importar?</p>`,
        buttons: [
          { label: 'Cancelar', className: 'btn-ghost', value: null },
          { label: 'Importar como nova', className: 'btn-ghost', value: 'new' },
          { label: 'Substituir cards', className: 'btn-primary', value: 'replace' }
        ]
      });
      if (!choice) return;
      mode = choice;
    }
    await importDeck(importDeckData, mode);
    showToast(`${importDeckData.cards.length} cards importados!`, 'success');
    importDeckData = null;
    document.getElementById('import-deck-preview').classList.remove('visible');
    document.getElementById('import-deck-actions').style.display = 'none';
    document.getElementById('import-deck-file').value = '';
  });

  document.getElementById('import-deck-cancel').addEventListener('click', () => {
    importDeckData = null;
    document.getElementById('import-deck-preview').classList.remove('visible');
    document.getElementById('import-deck-actions').style.display = 'none';
    document.getElementById('import-deck-file').value = '';
  });

  // Export backup
  document.getElementById('export-backup-btn').addEventListener('click', async () => {
    const data = await exportBackup();
    const date = new Date().toISOString().slice(0,10);
    downloadJSON(data, `fsrs-backup-${date}.json`);
    showToast('Backup exportado!', 'success');
  });

  // Import backup
  document.getElementById('import-backup-btn').addEventListener('click', () => {
    document.getElementById('import-backup-file').click();
  });
  document.getElementById('import-backup-file').addEventListener('change', async () => {
    const file = document.getElementById('import-backup-file').files[0];
    if (!file) return;
    const confirm = await showModal({
      title: 'Restaurar backup?',
      body: '<p style="color:var(--text-secondary);font-size:14px">Isso substituirá <strong>todos</strong> os dados atuais (decks, cards e histórico). Esta ação não pode ser desfeita.</p>',
      buttons: [
        { label: 'Cancelar', className: 'btn-ghost', value: null },
        { label: 'Restaurar', className: 'btn-danger', value: 'restore' }
      ]
    });
    if (confirm !== 'restore') return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.libraries || !data.cards) { showToast('Backup inválido', 'error'); return; }
      await importBackup(data);
      showToast('Backup restaurado!', 'success');
      location.hash = '#/';
    } catch {
      showToast('Erro ao restaurar backup', 'error');
    }
  });

  // FSRS settings
  document.getElementById('max-new-input').addEventListener('change', async e => {
    const val = Math.min(9999, Math.max(0, Number(e.target.value) || 0));
    e.target.value = val;
    await saveSetting('maxNewPerDay', val);
    showToast('Salvo');
  });

  document.getElementById('retention-input').addEventListener('change', async e => {
    const val = Math.min(97, Math.max(70, Number(e.target.value) || 90));
    e.target.value = val;
    await saveSetting('desiredRetention', val / 100);
    showToast('Salvo');
  });

  document.getElementById('reset-settings-btn').addEventListener('click', async () => {
    await saveSetting('maxNewPerDay', 20);
    await saveSetting('desiredRetention', 0.9);
    document.getElementById('max-new-input').value = 20;
    document.getElementById('retention-input').value = 90;
    showToast('Configurações redefinidas');
  });
}

function showDeckPreview(data) {
  const preview = document.getElementById('import-deck-preview');
  preview.innerHTML = `
    <strong>${escHtml(data.library.name)}</strong> &nbsp;
    <span style="color:var(--text-secondary)">${data.library.icon || '📚'}</span> &nbsp;
    <span style="color:var(--text-secondary);font-size:13px">${data.cards.length} card${data.cards.length !== 1 ? 's' : ''}</span>
  `;
  preview.classList.add('visible');
  const actions = document.getElementById('import-deck-actions');
  actions.style.display = 'flex';
}

function validateDeck(data) {
  if (data.version !== 1) return 'Versão do arquivo não suportada';
  if (!data.library?.name?.trim()) return 'Nome da deck ausente';
  if (!Array.isArray(data.cards)) return 'Formato de cards inválido';
  for (const c of data.cards) {
    if (typeof c.front !== 'string' || typeof c.back !== 'string') return 'Card com frente ou verso inválido';
  }
  // Sanitize
  if (data.library.icon && data.library.icon.length > 2) data.library.icon = data.library.icon.slice(0, 2);
  if (!data.library.icon) data.library.icon = '📚';
  if (!/^#[0-9a-fA-F]{6}$/.test(data.library.color || '')) data.library.color = '#5B6EF5';
  data.cards.forEach(c => { if (!Array.isArray(c.tags)) c.tags = []; });
  return null;
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
