
export type CardStatus = 'new' | 'learning' | 'review';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags: string[];
  createdAt: number;
  dueDate: number; // timestamp
  interval: number; // days
  ease: number; // factor
  status: CardStatus;
  deckId: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  folder?: string;
  cardIds: string[];
}

export interface AppState {
  decks: Record<string, Deck>;
  cards: Record<string, Flashcard>;
  folders: string[];
}

export enum ViewMode {
  DASHBOARD = 'DASHBOARD',
  STUDY = 'STUDY',
  DECK_VIEW = 'DECK_VIEW',
  EDIT_CARD = 'EDIT_CARD',
  SEARCH = 'SEARCH'
}
