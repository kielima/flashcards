import { FSRS, generatorParameters, createEmptyCard, Rating } from 'ts-fsrs';

const params = generatorParameters({ enable_fuzz: true });
const fsrs = new FSRS(params);

function toCard(reviewState) {
  if (!reviewState) return createEmptyCard();
  return {
    ...reviewState,
    due:         new Date(reviewState.due),
    last_review: reviewState.last_review ? new Date(reviewState.last_review) : undefined
  };
}

export function scheduleCard(reviewState, rating) {
  const card = toCard(reviewState);
  const now = new Date();
  const scheduling = fsrs.repeat(card, now);
  const result = scheduling[rating].card;
  return {
    due:            result.due,
    stability:      result.stability,
    difficulty:     result.difficulty,
    elapsed_days:   result.elapsed_days,
    scheduled_days: result.scheduled_days,
    reps:           result.reps,
    lapses:         result.lapses,
    state:          result.state,
    last_review:    result.last_review
  };
}

export function previewIntervals(reviewState) {
  const card = toCard(reviewState);
  const now = new Date();
  const scheduling = fsrs.repeat(card, now);
  return {
    again: scheduling[Rating.Again].card.due,
    hard:  scheduling[Rating.Hard].card.due,
    good:  scheduling[Rating.Good].card.due,
    easy:  scheduling[Rating.Easy].card.due
  };
}

export function formatInterval(date) {
  const now = new Date();
  const diffMs = date - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);

  if (diffMin < 1)  return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24)   return `${diffH}h`;
  if (diffD === 1)  return '1 dia';
  return `${diffD} dias`;
}

export { Rating };
