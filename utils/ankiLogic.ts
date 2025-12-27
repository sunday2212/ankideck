
import { Flashcard, CardStatus } from '../types';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

/**
 * Simplified SM2 Spaced Repetition Logic
 */
export const scheduleCard = (card: Flashcard, rating: Rating): Flashcard => {
  let { interval, ease, status } = card;
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (rating === 'again') {
    interval = 0; // Reset
    ease = Math.max(1.3, ease - 0.2);
    status = 'learning';
  } else {
    if (status === 'new') {
      if (rating === 'hard') interval = 1;
      else if (rating === 'good') interval = 2;
      else if (rating === 'easy') interval = 4;
      status = 'learning';
    } else if (status === 'learning') {
      if (rating === 'hard') interval = Math.max(1, interval * 1.2);
      else if (rating === 'good') interval = Math.max(2, interval * 1.5);
      else if (rating === 'easy') interval = Math.max(4, interval * 2.0);
      status = 'review';
    } else {
      // Review mode
      if (rating === 'hard') {
        ease = Math.max(1.3, ease - 0.15);
        interval = Math.max(1, interval * 1.2);
      } else if (rating === 'good') {
        interval = interval * ease;
      } else if (rating === 'easy') {
        ease += 0.15;
        interval = interval * ease * 1.3;
      }
    }
  }

  return {
    ...card,
    interval,
    ease,
    status,
    dueDate: now + (interval * ONE_DAY)
  };
};
