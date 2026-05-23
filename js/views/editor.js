import { getCard, createCard, updateCard, deleteCard, getReviewState, getLibraryTags, getLibrary } from '../db.js';
import { renderInto } from '../components/card-renderer.js';
import { showModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render(libraryId, cardId) {
  const lib = await getLibrary(libraryId);
  if (!lib) { location.hash = '#/'; return; }

  const card = cardId ? await getCard(cardId) : null;
  const isEdit = !!card;
  const hasReview = isEdit && !!(await getReviewState(cardId));
  const tags = await getLibraryTags(libraryId);

  setTitle(isEdit ? 'Editar card' : 'Novo card');

  vc().innerHTML = `
    <div class="app-header">
      <a href="#/library/${libraryId}" class="back-btn">←</a>
      <h1>${isEdit ? 'Editar card' : 'Novo card'}</h1>
      ${isEdit ? `<button class="btn btn-icon" id="delete-btn" title="Excluir card" style="font-size:18px">🗑️</button>` : ''}
    </div>
    <div class="editor-container">
      ${hasReview ? `<div class="edit-warning">⚠️ Editar este card não afeta seu histórico de revisões.</div>` : ''}

      <div class="editor-field">
        <label>Frente</label>
        <textarea class="textarea" id="front-input" rows="5" placeholder="Markdown e LaTeX suportados…">${escHtml(card?.front || '')}</textarea>
        <div id="front-preview" class="preview-box"></div>
      </div>

      <div class="editor-field">
        <label>Verso</label>
        <textarea class="textarea" id="back-input" rows="5" placeholder="Markdown e LaTeX suportados…">${escHtml(card?.back || '')}</textarea>
        <div id="back-preview" class="preview-box"></div>
      </div>

      <div class="editor-field">
        <label>Tags</label>
        <div class="tags-input-wrapper" id="tags-wrapper">
          <input class="tag-input" id="tag-input" list="tag-suggestions" placeholder="Adicionar tag, Enter para confirmar…">
          <datalist id="tag-suggestions">
            ${tags.map(t => `<option value="${escHtml(t)}">`).join('')}
          </datalist>
        </div>
      </div>
    </div>

    <div class="editor-footer">
      <a href="#/library/${libraryId}" class="btn btn-ghost">Cancelar</a>
      <button class="btn btn-primary" id="save-btn">Salvar</button>
    </div>
  `;

  // Current tags state
  let currentTags = [...(card?.tags || [])];
  renderTags(currentTags);

  // Tag input handling
  const tagInput = document.getElementById('tag-input');
  const wrapper = document.getElementById('tags-wrapper');

  wrapper.addEventListener('click', () => tagInput.focus());

  tagInput.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
      e.preventDefault();
      addTag(tagInput.value.trim().replace(/,+$/, ''));
      tagInput.value = '';
    } else if (e.key === 'Backspace' && !tagInput.value && currentTags.length) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  });

  tagInput.addEventListener('change', () => {
    if (tagInput.value.trim()) {
      addTag(tagInput.value.trim());
      tagInput.value = '';
    }
  });

  function addTag(t) {
    if (!t || currentTags.includes(t)) return;
    currentTags.push(t);
    renderTags(currentTags);
  }

  function removeTag(t) {
    currentTags = currentTags.filter(x => x !== t);
    renderTags(currentTags);
  }

  function renderTags(tagList) {
    const existingTags = wrapper.querySelectorAll('.tag');
    existingTags.forEach(el => el.remove());
    tagList.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.innerHTML = `${escHtml(t)} <small>×</small>`;
      span.addEventListener('click', () => removeTag(t));
      wrapper.insertBefore(span, tagInput);
    });
  }

  // Live preview
  const frontInput = document.getElementById('front-input');
  const backInput = document.getElementById('back-input');
  const frontPreview = document.getElementById('front-preview');
  const backPreview = document.getElementById('back-preview');

  const updatePreview = (input, preview) => {
    renderInto(preview, input.value);
  };

  frontInput.addEventListener('input', () => updatePreview(frontInput, frontPreview));
  backInput.addEventListener('input',  () => updatePreview(backInput,  backPreview));

  // Initial render
  if (card) {
    updatePreview(frontInput, frontPreview);
    updatePreview(backInput,  backPreview);
  }

  // Save
  document.getElementById('save-btn').addEventListener('click', async () => {
    const front = frontInput.value.trim();
    const back  = backInput.value.trim();
    if (!front) { showToast('A frente do card é obrigatória', 'error'); return; }

    if (tagInput.value.trim()) addTag(tagInput.value.trim());

    const data = { front, back, tags: currentTags, libraryId: Number(libraryId) };

    if (isEdit) {
      await updateCard(cardId, data);
      showToast('Card salvo');
    } else {
      await createCard(data);
      showToast('Card criado!', 'success');
    }
    location.hash = `#/library/${libraryId}`;
  });

  // Delete
  if (isEdit) {
    document.getElementById('delete-btn').addEventListener('click', async () => {
      const confirm = await showModal({
        title: 'Excluir card?',
        body: '<p style="color:var(--text-secondary);font-size:14px">Esta ação não pode ser desfeita.</p>',
        buttons: [
          { label: 'Cancelar', className: 'btn-ghost', value: null },
          { label: 'Excluir',  className: 'btn-danger', value: 'delete' }
        ]
      });
      if (confirm === 'delete') {
        await deleteCard(cardId);
        showToast('Card excluído');
        location.hash = `#/library/${libraryId}`;
      }
    });
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
