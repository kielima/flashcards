import Dexie from 'dexie';

export const db = new Dexie('FSRSApp');

db.version(1).stores({
  libraries: '++id, name, createdAt',
  cards:     '++id, libraryId, createdAt, *tags',
  reviews:   '++id, cardId, due, state, last_review',
  settings:  'key'
});

// ── Libraries ────────────────────────────────────────

export async function listLibraries() {
  return db.libraries.orderBy('createdAt').toArray();
}

export async function getLibrary(id) {
  return db.libraries.get(Number(id));
}

export async function createLibrary(data) {
  return db.libraries.add({ ...data, createdAt: new Date() });
}

export async function updateLibrary(id, data) {
  return db.libraries.update(Number(id), data);
}

export async function deleteLibrary(id) {
  const numId = Number(id);
  const cards = await db.cards.where('libraryId').equals(numId).toArray();
  const cardIds = cards.map(c => c.id);
  await db.transaction('rw', db.libraries, db.cards, db.reviews, async () => {
    if (cardIds.length) await db.reviews.where('cardId').anyOf(cardIds).delete();
    await db.cards.where('libraryId').equals(numId).delete();
    await db.libraries.delete(numId);
  });
}

// ── Cards ────────────────────────────────────────────

export async function listCards(libraryId) {
  return db.cards.where('libraryId').equals(Number(libraryId)).toArray();
}

export async function getCard(id) {
  return db.cards.get(Number(id));
}

export async function createCard(data) {
  return db.cards.add({ ...data, createdAt: new Date() });
}

export async function updateCard(id, data) {
  return db.cards.update(Number(id), data);
}

export async function deleteCard(id) {
  const numId = Number(id);
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.reviews.where('cardId').equals(numId).delete();
    await db.cards.delete(numId);
  });
}

export async function getLibraryTags(libraryId) {
  const cards = await listCards(libraryId);
  const tagSet = new Set();
  cards.forEach(c => (c.tags || []).forEach(t => tagSet.add(t)));
  return [...tagSet].sort();
}

// ── Reviews ──────────────────────────────────────────

export async function getReviewState(cardId) {
  return db.reviews.where('cardId').equals(Number(cardId)).first();
}

export async function saveReviewState(cardId, state) {
  const numId = Number(cardId);
  const existing = await db.reviews.where('cardId').equals(numId).first();
  if (existing) {
    await db.reviews.update(existing.id, { ...state, cardId: numId });
  } else {
    await db.reviews.add({ ...state, cardId: numId });
  }
}

// ── Due counts ───────────────────────────────────────

export async function getDueCount(libraryId) {
  const cards = await listCards(libraryId);
  const now = new Date();
  let due = 0;
  for (const card of cards) {
    const r = await getReviewState(card.id);
    if (r && r.state !== 0 && new Date(r.due) <= now) due++;
  }
  return due;
}

export async function getNewCount(libraryId) {
  const cards = await listCards(libraryId);
  let newCount = 0;
  for (const card of cards) {
    const r = await getReviewState(card.id);
    if (!r || r.state === 0) newCount++;
  }
  return newCount;
}

// ── Settings ─────────────────────────────────────────

export async function getSettings() {
  const rows = await db.settings.toArray();
  const result = { maxNewPerDay: 20, desiredRetention: 0.9 };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function saveSetting(key, value) {
  await db.settings.put({ key, value });
}

export async function getTodayNewCount() {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.settings.get('newCardsToday');
  if (!row || row.value.date !== today) return 0;
  return row.value.count;
}

export async function incrementTodayNewCount() {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.settings.get('newCardsToday');
  let count = 1;
  if (row && row.value.date === today) count = row.value.count + 1;
  await db.settings.put({ key: 'newCardsToday', value: { date: today, count } });
}

// ── Export / Import ──────────────────────────────────

export async function exportDeck(libraryId) {
  const library = await getLibrary(libraryId);
  const cards = await listCards(libraryId);
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    library: {
      name: library.name,
      description: library.description || '',
      icon: library.icon || '📚',
      color: library.color || '#5B6EF5'
    },
    cards: cards.map(c => ({
      front: c.front,
      back: c.back,
      tags: c.tags || []
    }))
  };
}

export async function importDeck(data, mode = 'new') {
  const { library: lib, cards } = data;
  let libraryId;

  if (mode === 'replace') {
    const existing = await db.libraries.where('name').equals(lib.name).first();
    if (existing) {
      await db.transaction('rw', db.cards, db.reviews, async () => {
        const oldCards = await db.cards.where('libraryId').equals(existing.id).toArray();
        const oldIds = oldCards.map(c => c.id);
        if (oldIds.length) await db.reviews.where('cardId').anyOf(oldIds).delete();
        await db.cards.where('libraryId').equals(existing.id).delete();
      });
      libraryId = existing.id;
    } else {
      libraryId = await createLibrary({
        name: lib.name, description: lib.description || '',
        icon: lib.icon || '📚', color: lib.color || '#5B6EF5'
      });
    }
  } else {
    let name = lib.name;
    const existing = await db.libraries.where('name').equals(name).first();
    if (existing) name = name + ' (importado)';
    libraryId = await createLibrary({
      name, description: lib.description || '',
      icon: lib.icon || '📚', color: lib.color || '#5B6EF5'
    });
  }

  for (const card of cards) {
    await createCard({
      libraryId,
      front: card.front,
      back: card.back,
      tags: card.tags || []
    });
  }
  return libraryId;
}

export async function exportBackup() {
  const libraries = await db.libraries.toArray();
  const cards = await db.cards.toArray();
  const reviews = await db.reviews.toArray();
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    libraries, cards, reviews
  };
}

export async function importBackup(data) {
  await db.transaction('rw', db.libraries, db.cards, db.reviews, async () => {
    await db.libraries.clear();
    await db.cards.clear();
    await db.reviews.clear();
    await db.libraries.bulkAdd(data.libraries);
    await db.cards.bulkAdd(data.cards);
    if (data.reviews?.length) await db.reviews.bulkAdd(data.reviews);
  });
}

// ── Sample deck seed ─────────────────────────────────

export async function seedIfEmpty() {
  const count = await db.libraries.count();
  if (count > 0) return;
  try {
    const res = await fetch('./decks/hsk1-mandarim.deck.json');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    await importDeck(data, 'new');
  } catch {
    // Silently skip seed if file is unreachable (e.g. file:// protocol)
  }
}
