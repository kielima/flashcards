import { getLibrary, listCards } from '../db.js';
import { renderInto } from '../components/card-renderer.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render(libraryId) {
  const lib = await getLibrary(libraryId);
  if (!lib) { location.hash = '#/'; return; }

  setTitle(`Digitação — ${lib.name}`);

  const cards = shuffle(await listCards(libraryId));
  if (!cards.length) {
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Modo digitação</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">🃏</div>
        <h2>Nenhum card ainda</h2>
        <p>Adicione cards à deck antes de praticar.</p>
        <a href="#/library/${libraryId}" class="btn btn-primary">Voltar</a>
      </div>`;
    return;
  }

  let index = 0;
  let correct = 0;
  let phase = 'question'; // 'question' | 'answer'

  function pct() { return Math.round((index / cards.length) * 100); }

  function buildShell() {
    vc().innerHTML = `
      <div class="typing-wrapper">
        <div class="review-header">
          <a href="#/library/${libraryId}" class="back-btn" style="font-size:22px;background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0">←</a>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" id="prog-fill" style="width:${pct()}%"></div>
          </div>
          <span class="progress-label" id="prog-label">${index + 1} / ${cards.length}</span>
        </div>
        <div class="typing-card-area" id="card-area"></div>
        <div class="typing-footer" id="footer"></div>
      </div>`;
  }

  function showQuestion() {
    phase = 'question';
    const card = cards[index];

    document.getElementById('prog-fill').style.width = pct() + '%';
    document.getElementById('prog-label').textContent = `${index + 1} / ${cards.length}`;

    const area = document.getElementById('card-area');
    area.innerHTML = `
      <div class="typing-card" id="typing-card">
        <div id="card-front" class="rendered"></div>
      </div>
      <div class="typing-input-row">
        <input class="input" id="answer-input" type="text" placeholder="Digite sua resposta…" autocomplete="off" autocorrect="off" spellcheck="false">
      </div>`;

    renderInto(document.getElementById('card-front'), card.front);

    document.getElementById('footer').innerHTML =
      `<button class="btn btn-primary" id="confirm-btn">Confirmar</button>`;

    const input = document.getElementById('answer-input');
    setTimeout(() => input.focus(), 50);

    const confirm = () => {
      if (phase !== 'question') return;
      flipToAnswer(card, input.value);
    };

    document.getElementById('confirm-btn').addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  }

  async function flipToAnswer(card, typed) {
    phase = 'answer';
    const cardEl = document.getElementById('typing-card');
    const isCorrect = checkAnswer(typed, card.back);
    if (isCorrect) correct++;

    // Flip out
    cardEl.style.transform = 'scaleX(0)';
    await wait(180);

    // Build back face content
    const area = document.getElementById('card-area');
    area.innerHTML = `
      <div class="typing-card" id="typing-card">
        <div id="card-front-back" class="rendered"></div>
        <div class="typing-divider"></div>
        <div id="card-back" class="rendered"></div>
      </div>
      <div class="result-badge ${isCorrect ? 'correct' : 'wrong'}">
        <span class="result-icon">${isCorrect ? '✓' : '✗'}</span>
        <span>${isCorrect ? 'Correto!' : `Errado — você digitou: "${typed || '(em branco)'}"`}</span>
      </div>`;

    renderInto(document.getElementById('card-front-back'), card.front);
    renderInto(document.getElementById('card-back'), card.back);

    // Flip in
    const newCardEl = document.getElementById('typing-card');
    newCardEl.style.transform = 'scaleX(0)';
    await wait(10);
    newCardEl.style.transform = 'scaleX(1)';

    const isLast = index >= cards.length - 1;
    document.getElementById('footer').innerHTML =
      `<button class="btn btn-primary" id="next-btn">${isLast ? 'Ver resultado' : 'Próximo →'}</button>`;

    document.getElementById('next-btn').addEventListener('click', () => {
      index++;
      if (index >= cards.length) showComplete();
      else showQuestion();
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        document.removeEventListener('keydown', handler);
        e.preventDefault();
        index++;
        if (index >= cards.length) showComplete();
        else showQuestion();
      }
    }, { once: true });
  }

  function showComplete() {
    const total = cards.length;
    const pctScore = Math.round((correct / total) * 100);
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Resultado</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">${pctScore >= 80 ? '🎉' : pctScore >= 50 ? '📚' : '💪'}</div>
        <h2>${pctScore >= 80 ? 'Excelente!' : pctScore >= 50 ? 'Bom trabalho!' : 'Continue praticando!'}</h2>
        <p>${correct} de ${total} corretos (${pctScore}%)</p>
        <div class="stats-row">
          <span class="stat-chip good">✓ Corretas: ${correct}</span>
          <span class="stat-chip again">✗ Erradas: ${total - correct}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px">
          <button class="btn btn-primary" id="retry-btn">Tentar novamente</button>
          <a href="#/library/${libraryId}" class="btn btn-ghost">Voltar à deck</a>
        </div>
      </div>`;

    document.getElementById('retry-btn').addEventListener('click', () => render(libraryId));
  }

  buildShell();
  showQuestion();
}

function checkAnswer(typed, backText) {
  if (!typed.trim()) return false;
  const plain = stripMarkdown(backText);
  const firstPara = plain.split(/\n\n/)[0];
  const parts = firstPara.split(/[\/,;|]/).map(s => s.trim()).filter(Boolean);
  const t = normalize(typed);
  return parts.some(p => {
    const pn = normalize(p);
    return pn === t || pn.includes(t) || t.includes(pn);
  });
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
