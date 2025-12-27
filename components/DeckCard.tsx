
import React from 'react';
import { Deck, Flashcard } from '../types';

interface DeckCardProps {
  deck: Deck;
  cards: Flashcard[];
  onStudy: (deckId: string) => void;
  onView: (deckId: string) => void;
}

const DeckCard: React.FC<DeckCardProps> = ({ deck, cards, onStudy, onView }) => {
  const now = Date.now();
  const dueCount = cards.filter(c => c.dueDate <= now).length;
  const newCount = cards.filter(c => c.status === 'new').length;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{deck.name}</h3>
          <p className="text-sm text-slate-500 line-clamp-1">{deck.description || 'No description'}</p>
        </div>
        <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded text-slate-600">
          {cards.length} cards
        </span>
      </div>
      
      <div className="flex gap-4 mb-5 text-sm">
        <div className="flex flex-col">
          <span className="text-blue-600 font-bold">{newCount}</span>
          <span className="text-slate-400 text-xs uppercase tracking-wider">New</span>
        </div>
        <div className="flex flex-col">
          <span className="text-green-600 font-bold">{dueCount}</span>
          <span className="text-slate-400 text-xs uppercase tracking-wider">Due</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onStudy(deck.id)}
          className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          disabled={cards.length === 0}
        >
          Study Now
        </button>
        <button
          onClick={() => onView(deck.id)}
          className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
        >
          Edit
        </button>
      </div>
    </div>
  );
};

export default DeckCard;
