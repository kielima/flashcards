import { getLibrary, listCards, getReviewState, saveReviewState, incrementTodayNewCount } from '../db.js';
import { scheduleCard, previewIntervals, formatInterval, Rating } from '../fsrs.js';
import { renderInto } from '../components/card-renderer.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render(libraryId) {
  const lib = await getLibrary(libraryId);
  if (!lib) { location.hash = '#/'; return; }

  setTitle(`Flashcard — ${lib.name}`);

  const allCards = await listCards(libraryId);
  if (!allCards.length) {
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Modo flashcard</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">🃏</div>
        <h2>Nenhum card ainda</h2>
        <p>Adicione cards à biblioteca antes de praticar.</p>
        <a href="#/library/${libraryId}" class="btn btn-primary">Voltar</a>
      </div>`;
    return;
  }

  const items = shuffle(await Promise.all(allCards.map(async c => {
    const review = (await getReviewState(c.id)) ?? null;
    return { card: c, review, isNew: !review || review.state === 0 };
  })));

  let index = 0;
  let phase = 'question';
  const results = { remembered: 0, forgotten: 0 };
  let kbHandler = null;

  function pct() { return Math.round((index / items.length) * 100); }

  function buildShell() {
    vc().innerHTML = `
      <div class="typing-wrapper">
        <div class="review-header">
          <a href="#/library/${libraryId}" class="back-btn" style="font-size:22px;background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0">←</a>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" id="prog-fill" style="width:${pct()}%"></div>
          </div>
          <span class="progress-label" id="prog-label">${index + 1} / ${items.length}</span>
        </div>
        <div class="typing-card-area" id="card-area"></div>
        <div class="typing-footer" id="footer"></div>
      </div>`;
  }

  function attachKeyboard() {
    if (kbHandler) document.removeEventListener('keydown', kbHandler);
    kbHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (phase === 'question') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipToAnswer(); }
      } else if (phase === 'answer') {
        if (e.key === '1') advanceCard(Rating.Again);
        else if (e.key === '2' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceCard(Rating.Good); }
      }
    };
    document.addEventListener('keydown', kbHandler);
    window.addEventListener('hashchange', () => {
      if (kbHandler) { document.removeEventListener('keydown', kbHandler); kbHandler = null; }
    }, { once: true });
  }

  function showQuestion() {
    phase = 'question';
    const { card } = items[index];

    document.getElementById('prog-fill').style.width = pct() + '%';
    document.getElementById('prog-label').textContent = `${index + 1} / ${items.length}`;

    document.getElementById('card-area').innerHTML = `
      <div class="typing-card" id="typing-card">
        <div id="card-front" class="rendered"></div>
      </div>`;

    renderInto(document.getElementById('card-front'), card.front);

    document.getElementById('footer').innerHTML =
      `<button class="btn btn-ghost show-answer-btn" id="reveal-btn">Mostrar resposta</button>`;

    document.getElementById('reveal-btn').addEventListener('click', flipToAnswer);
    attachKeyboard();
  }

  async function flipToAnswer() {
    if (phase !== 'question') return;
    phase = 'answer';

    const cardEl = document.getElementById('typing-card');
    const { card, review } = items[index];
    const intervals = previewIntervals(review);

    cardEl.style.transform = 'scaleX(0)';
    await wait(180);

    document.getElementById('card-area').innerHTML = `
      <div class="typing-card" id="typing-card">
        <div id="card-front-back" class="rendered"></div>
        <div class="typing-divider"></div>
        <div id="card-back" class="rendered"></div>
      </div>`;

    renderInto(document.getElementById('card-front-back'), card.front);
    renderInto(document.getElementById('card-back'), card.back);

    const newCardEl = document.getElementById('typing-card');
    newCardEl.style.transform = 'scaleX(0)';
    await wait(10);
    newCardEl.style.transform = 'scaleX(1)';

    document.getElementById('footer').innerHTML = `
      <div class="flashcard-rating-row">
        <button class="rating-btn again" id="forgot-btn">
          <span>Não lembrei</span>
          <span class="interval">${formatInterval(intervals.again)}</span>
        </button>
        <button class="rating-btn good" id="remembered-btn">
          <span>Lembrei</span>
          <span class="interval">${formatInterval(intervals.good)}</span>
        </button>
      </div>`;

    document.getElementById('forgot-btn').addEventListener('click', () => advanceCard(Rating.Again));
    document.getElementById('remembered-btn').addEventListener('click', () => advanceCard(Rating.Good));
    attachKeyboard();
  }

  async function advanceCard(rating) {
    if (kbHandler) { document.removeEventListener('keydown', kbHandler); kbHandler = null; }

    const { card, review, isNew } = items[index];
    const newState = scheduleCard(review, rating);
    await saveReviewState(card.id, newState);
    if (isNew) await incrementTodayNewCount();

    if (rating === Rating.Again) results.forgotten++;
    else results.remembered++;

    index++;
    if (index >= items.length) showComplete();
    else showQuestion();
  }

  function showComplete() {
    const total = items.length;
    const pctScore = Math.round((results.remembered / total) * 100);
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Resultado</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">${pctScore >= 80 ? '🎉' : pctScore >= 50 ? '📚' : '💪'}</div>
        <h2>${pctScore >= 80 ? 'Excelente!' : pctScore >= 50 ? 'Bom trabalho!' : 'Continue praticando!'}</h2>
        <p>${results.remembered} de ${total} lembrados (${pctScore}%)</p>
        <div class="stats-row">
          <span class="stat-chip good">✓ Lembrei: ${results.remembered}</span>
          <span class="stat-chip again">✗ Não lembrei: ${results.forgotten}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px">
          <button class="btn btn-primary" id="retry-btn">Tentar novamente</button>
          <a href="#/library/${libraryId}" class="btn btn-ghost">Voltar à biblioteca</a>
        </div>
      </div>`;

    document.getElementById('retry-btn').addEventListener('click', () => render(libraryId));
  }

  buildShell();
  showQuestion();
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
