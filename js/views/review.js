import { getLibrary, listCards, getReviewState, saveReviewState, getSettings, getTodayNewCount, incrementTodayNewCount } from '../db.js';
import { scheduleCard, previewIntervals, formatInterval, Rating } from '../fsrs.js';
import { renderInto } from '../components/card-renderer.js';
import { setTitle } from '../ui.js';

const vc = () => document.getElementById('view-container');

export async function render(libraryId) {
  const lib = await getLibrary(libraryId);
  if (!lib) { location.hash = '#/'; return; }

  setTitle(`Revisar — ${lib.name}`);

  const queue = await buildQueue(libraryId);

  if (!queue.length) {
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Revisão</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">✅</div>
        <h2>Nada para revisar!</h2>
        <p>Todos os cards estão em dia. Volte mais tarde.</p>
        <a href="#/library/${libraryId}" class="btn btn-primary">Voltar à biblioteca</a>
      </div>
    `;
    return;
  }

  let current = 0;
  let answered = false;
  let waitingForContinue = false;
  const results = { again: 0, hard: 0, good: 0, easy: 0 };

  function showCard() {
    if (current >= queue.length) {
      showComplete();
      return;
    }

    answered = false;
    waitingForContinue = false;
    const { card, review } = queue[current];
    const intervals = previewIntervals(review);
    const total = queue.length;
    const pct = Math.round((current / total) * 100);

    vc().innerHTML = `
      <div class="review-wrapper">
        <div class="review-header">
          <a href="#/library/${libraryId}" class="back-btn" style="font-size:22px;background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0">←</a>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="progress-label">${current + 1} / ${total}</span>
        </div>

        <div class="review-card-area" id="review-card-area">
          <div class="review-card">
            <div class="review-front rendered" id="review-front"></div>
            <div class="review-divider" id="review-divider"></div>
            <div class="review-back" id="review-back">
              <div class="answer-section rendered" id="answer-content"></div>
              <div class="explanation-handle" id="explanation-handle">
                <span class="handle-pill"></span>
                <span class="handle-text">puxar para ver explicação</span>
              </div>
              <div class="explanation-wrapper" id="explanation-wrapper">
                <div class="explanation-label">Explicação</div>
                <div class="rendered" id="explanation-content"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="review-footer">
          <button class="btn btn-ghost show-answer-btn" id="show-answer-btn">Mostrar resposta</button>
          <div class="rating-buttons" id="rating-buttons" style="display:none">
            <button class="rating-btn again" data-rating="${Rating.Again}">
              Again <span class="interval">${formatInterval(intervals.again)}</span>
            </button>
            <button class="rating-btn hard" data-rating="${Rating.Hard}">
              Hard <span class="interval">${formatInterval(intervals.hard)}</span>
            </button>
            <button class="rating-btn good" data-rating="${Rating.Good}">
              Good <span class="interval">${formatInterval(intervals.good)}</span>
            </button>
            <button class="rating-btn easy" data-rating="${Rating.Easy}">
              Easy <span class="interval">${formatInterval(intervals.easy)}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    renderInto(document.getElementById('review-front'), card.front);

    document.getElementById('show-answer-btn').addEventListener('click', revealAnswer);

    document.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => rate(Number(btn.dataset.rating)));
    });

    setupKeyboard();
  }

  function revealAnswer() {
    if (answered) return;
    answered = true;
    const { card } = queue[current];

    document.getElementById('show-answer-btn').style.display = 'none';
    document.getElementById('rating-buttons').style.display = 'grid';
    document.getElementById('review-divider').classList.add('visible');

    const back = document.getElementById('review-back');
    back.classList.add('visible');
    renderInto(document.getElementById('answer-content'), card.back);

    if (card.explanation) {
      document.getElementById('explanation-handle').classList.add('visible');
      setupSwipeReveal(card);
    }
  }

  function revealExplanation() {
    const wrapper = document.getElementById('explanation-wrapper');
    if (wrapper.classList.contains('visible')) return;
    document.getElementById('explanation-handle').classList.remove('visible');
    wrapper.classList.add('visible');
    renderInto(document.getElementById('explanation-content'), queue[current].card.explanation);
  }

  function setupSwipeReveal(card) {
    if (!card.explanation) return;
    const area = document.getElementById('review-card-area');
    let startY = 0;
    const onTouchStart = (e) => { startY = e.touches[0].clientY; };
    const onTouchEnd = (e) => {
      if (e.changedTouches[0].clientY - startY < -40) revealExplanation();
    };
    area.addEventListener('touchstart', onTouchStart, { passive: true });
    area.addEventListener('touchend', onTouchEnd, { passive: true });
    document.getElementById('explanation-handle').addEventListener('click', revealExplanation);
  }

  async function rate(rating) {
    const { card, review, isNew } = queue[current];

    if (rating === Rating.Again && card.explanation) {
      waitingForContinue = true;
      revealExplanation();
      document.getElementById('rating-buttons').style.display = 'none';
      const footer = document.querySelector('.review-footer');
      const continueBtn = document.createElement('button');
      continueBtn.className = 'btn btn-primary show-answer-btn';
      continueBtn.textContent = 'Continuar';
      footer.appendChild(continueBtn);
      continueBtn.addEventListener('click', () => advanceCard(rating));
      return;
    }

    await advanceCard(rating);
  }

  async function advanceCard(rating) {
    const { card, review, isNew } = queue[current];
    const newState = scheduleCard(review, rating);

    await saveReviewState(card.id, newState);
    if (isNew) await incrementTodayNewCount();

    const key = ['again','hard','good','easy'][rating - 1];
    if (key) results[key]++;

    current++;
    showCard();
  }

  function setupKeyboard() {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!answered) revealAnswer();
      } else if (answered && !waitingForContinue) {
        if (e.key === '1') rate(Rating.Again);
        else if (e.key === '2') advanceCard(Rating.Hard);
        else if (e.key === '3') advanceCard(Rating.Good);
        else if (e.key === '4') advanceCard(Rating.Easy);
      } else if (waitingForContinue && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        advanceCard(Rating.Again);
      }
    };
    document.addEventListener('keydown', handler, { once: false });
    // Clean up on navigation
    window.addEventListener('hashchange', () => document.removeEventListener('keydown', handler), { once: true });
  }

  function showComplete() {
    const total = results.again + results.hard + results.good + results.easy;
    vc().innerHTML = `
      <div class="app-header">
        <a href="#/library/${libraryId}" class="back-btn">←</a>
        <h1>Sessão completa</h1>
      </div>
      <div class="review-complete">
        <div class="complete-icon">🎉</div>
        <h2>Sessão completa!</h2>
        <p>${total} card${total !== 1 ? 's' : ''} revisado${total !== 1 ? 's' : ''}</p>
        <div class="stats-row">
          ${results.again ? `<span class="stat-chip again">Again: ${results.again}</span>` : ''}
          ${results.hard  ? `<span class="stat-chip hard">Hard: ${results.hard}</span>` : ''}
          ${results.good  ? `<span class="stat-chip good">Good: ${results.good}</span>` : ''}
          ${results.easy  ? `<span class="stat-chip easy">Easy: ${results.easy}</span>` : ''}
        </div>
        <a href="#/library/${libraryId}" class="btn btn-primary">Voltar à biblioteca</a>
      </div>
    `;
  }

  showCard();
}

async function buildQueue(libraryId) {
  const settings = await getSettings();
  const maxNew = settings.maxNewPerDay ?? 20;
  const todayNew = await getTodayNewCount();
  const allowedNew = Math.max(0, maxNew - todayNew);

  const cards = await listCards(libraryId);
  const now = new Date();

  const dueItems = [];
  const newItems = [];

  for (const card of cards) {
    const review = await getReviewState(card.id);
    if (!review || review.state === 0) {
      newItems.push({ card, review: review ?? null, isNew: true });
    } else if (new Date(review.due) <= now) {
      dueItems.push({ card, review, isNew: false });
    }
  }

  // Sort due cards by due date ascending
  dueItems.sort((a, b) => new Date(a.review.due) - new Date(b.review.due));

  const selectedNew = newItems.slice(0, allowedNew);

  // Interleave new cards among due cards
  const queue = [...dueItems];
  const step = dueItems.length > 0 ? Math.max(1, Math.floor(dueItems.length / (selectedNew.length + 1))) : 0;
  selectedNew.forEach((item, i) => {
    const pos = Math.min(step * (i + 1) + i, queue.length);
    queue.splice(pos, 0, item);
  });

  if (!dueItems.length) return shuffle(selectedNew);
  return queue;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
