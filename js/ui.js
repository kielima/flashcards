import { seedIfEmpty } from './db.js';

const container = () => document.getElementById('view-container');

async function route() {
  const hash = location.hash || '#/';

  // #/library/:id/flashcard
  let m = hash.match(/^#\/library\/(\d+)\/flashcard$/);
  if (m) {
    const { render } = await import('./views/flashcard.js');
    return render(m[1]);
  }

  // #/library/:id/typing
  m = hash.match(/^#\/library\/(\d+)\/typing$/);
  if (m) {
    const { render } = await import('./views/typing.js');
    return render(m[1]);
  }

  // #/library/:id/review
  m = hash.match(/^#\/library\/(\d+)\/review$/);
  if (m) {
    const { render } = await import('./views/review.js');
    return render(m[1]);
  }

  // #/library/:id/card/new
  m = hash.match(/^#\/library\/(\d+)\/card\/new$/);
  if (m) {
    const { render } = await import('./views/editor.js');
    return render(m[1], null);
  }

  // #/library/:id/card/:cid
  m = hash.match(/^#\/library\/(\d+)\/card\/(\d+)$/);
  if (m) {
    const { render } = await import('./views/editor.js');
    return render(m[1], m[2]);
  }

  // #/library/:id
  m = hash.match(/^#\/library\/(\d+)$/);
  if (m) {
    const { render } = await import('./views/library.js');
    return render(m[1]);
  }

  // #/settings
  if (hash === '#/settings') {
    const { render } = await import('./views/settings.js');
    return render();
  }

  // #/ (home)
  const { render } = await import('./views/home.js');
  render();
}

export function navigate(hash) {
  location.hash = hash;
}

export function setTitle(title) {
  document.title = title ? `${title} — Flashcards` : 'FSRS Flashcards';
}

window.addEventListener('hashchange', route);
window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  await seedIfEmpty();
  route();
});
