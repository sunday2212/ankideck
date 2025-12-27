
import React, { useState, useEffect, useMemo } from 'react';
import { ViewMode, AppState, Deck, Flashcard, CardStatus } from './types';
import { scheduleCard, Rating } from './utils/ankiLogic';
import { generateCardsFromText } from './services/geminiService';
import DeckCard from './components/DeckCard';
import CardEditor from './components/CardEditor';

const STORAGE_KEY = 'anki_pro_data';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { decks: {}, cards: {}, folders: [] };
  });

  const [view, setView] = useState<ViewMode>(ViewMode.DASHBOARD);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [studyCards, setStudyCards] = useState<string[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Derived state
  // Cast Object.values to Deck[] to resolve 'unknown' type issues
  const deckList = useMemo(() => Object.values(state.decks) as Deck[], [state.decks]);
  const activeDeck = activeDeckId ? state.decks[activeDeckId] : null;
  const activeDeckCards = useMemo(() => {
    if (!activeDeckId) return [];
    // Cast Object.values to Flashcard[] to resolve 'unknown' type issues
    return (Object.values(state.cards) as Flashcard[]).filter(c => c.deckId === activeDeckId);
  }, [state.cards, activeDeckId]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    // Cast Object.values to Flashcard[] to resolve 'unknown' type issues
    return (Object.values(state.cards) as Flashcard[]).filter(c => 
      c.front.toLowerCase().includes(lower) || c.back.toLowerCase().includes(lower)
    );
  }, [state.cards, searchTerm]);

  // Handlers
  const createDeck = () => {
    const name = prompt("Enter deck name:");
    if (!name) return;
    const id = crypto.randomUUID();
    setState(prev => ({
      ...prev,
      decks: {
        ...prev.decks,
        [id]: { id, name, description: '', cardIds: [] }
      }
    }));
  };

  const deleteDeck = (id: string) => {
    if (!confirm("Delete this deck and all its cards?")) return;
    const { [id]: _, ...remainingDecks } = state.decks;
    const remainingCards = { ...state.cards };
    Object.keys(remainingCards).forEach(cid => {
      if (remainingCards[cid].deckId === id) delete remainingCards[cid];
    });
    setState(prev => ({ ...prev, decks: remainingDecks, cards: remainingCards }));
    setView(ViewMode.DASHBOARD);
  };

  const startStudy = (deckId: string) => {
    const now = Date.now();
    // Cast Object.values to Flashcard[] to avoid 'unknown' errors for properties like deckId and dueDate
    const cardsToStudy = (Object.values(state.cards) as Flashcard[])
      .filter(c => c.deckId === deckId && c.dueDate <= now)
      .sort((a, b) => a.dueDate - b.dueDate)
      .map(c => c.id);
    
    if (cardsToStudy.length === 0) {
      alert("No cards due for review!");
      return;
    }
    
    setStudyCards(cardsToStudy);
    setStudyIndex(0);
    setIsFlipped(false);
    setActiveDeckId(deckId);
    setView(ViewMode.STUDY);
  };

  const handleRating = (rating: Rating) => {
    const cardId = studyCards[studyIndex];
    const card = state.cards[cardId];
    const updatedCard = scheduleCard(card, rating);
    
    setState(prev => ({
      ...prev,
      cards: { ...prev.cards, [cardId]: updatedCard }
    }));

    if (studyIndex + 1 < studyCards.length) {
      setStudyIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      alert("Session Finished!");
      setView(ViewMode.DASHBOARD);
    }
  };

  const saveNewCard = (data: Partial<Flashcard>) => {
    if (!activeDeckId) return;
    const id = crypto.randomUUID();
    const newCard: Flashcard = {
      id,
      deckId: activeDeckId,
      front: data.front || '',
      back: data.back || '',
      tags: [],
      createdAt: Date.now(),
      dueDate: Date.now(),
      interval: 0,
      ease: 2.5,
      status: 'new'
    };
    setState(prev => ({
      ...prev,
      cards: { ...prev.cards, [id]: newCard },
      decks: {
        ...prev.decks,
        [activeDeckId]: {
          ...prev.decks[activeDeckId],
          cardIds: [...prev.decks[activeDeckId].cardIds, id]
        }
      }
    }));
  };

  const generateWithAi = async () => {
    const text = prompt("Paste text to generate flashcards from:");
    if (!text || !activeDeckId) return;
    setIsAiLoading(true);
    try {
      const generated = await generateCardsFromText(text);
      generated.forEach(card => saveNewCard(card));
      alert(`Generated ${generated.length} cards!`);
    } catch (e) {
      alert("AI Generation failed. Check API Key.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setState(data);
        alert("Data imported successfully!");
      } catch (e) {
        alert("Invalid file format. Please upload a valid Anki JSON export.");
      }
    };
    reader.readAsText(file);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki_pro_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView(ViewMode.DASHBOARD)}>
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 hidden sm:block">AnkiWeb Pro</h1>
        </div>

        <div className="flex-1 max-w-md mx-8 relative hidden md:block">
          <input 
            type="text" 
            placeholder="Search all cards..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if(e.target.value) setView(ViewMode.SEARCH);
            }}
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={exportData} className="p-2 text-slate-500 hover:text-indigo-600 transition-colors" title="Export JSON">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          </button>
          <label className="p-2 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer" title="Import JSON">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <input type="file" className="hidden" accept=".json" onChange={importData} />
          </label>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-6xl mx-auto w-full">
        {view === ViewMode.DASHBOARD && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Your Decks</h2>
              <button 
                onClick={createDeck}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                New Deck
              </button>
            </div>
            {deckList.length === 0 ? (
              <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
                <p className="text-slate-500 mb-4">No decks yet. Create your first deck to start learning!</p>
                <button onClick={createDeck} className="text-indigo-600 font-bold hover:underline">Get Started</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {deckList.map(deck => (
                  <DeckCard 
                    key={deck.id} 
                    deck={deck} 
                    // Explicitly cast Object.values to Flashcard[]
                    cards={(Object.values(state.cards) as Flashcard[]).filter(c => c.deckId === deck.id)}
                    onStudy={startStudy}
                    onView={(id) => { setActiveDeckId(id); setView(ViewMode.DECK_VIEW); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === ViewMode.DECK_VIEW && activeDeck && (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <button onClick={() => setView(ViewMode.DASHBOARD)} className="text-indigo-600 text-sm font-semibold mb-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  Back to Dashboard
                </button>
                <h2 className="text-3xl font-bold text-slate-900">{activeDeck.name}</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={generateWithAi}
                  disabled={isAiLoading}
                  className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200 transition-all flex items-center gap-2"
                >
                  {isAiLoading ? 'Generating...' : '✨ Magic Cards (AI)'}
                </button>
                <button 
                  onClick={() => setView(ViewMode.EDIT_CARD)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 transition-all"
                >
                  Add Card
                </button>
                <button 
                  onClick={() => deleteDeck(activeDeck.id)}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-all"
                >
                  Delete Deck
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              {activeDeckCards.map(card => (
                <div key={card.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800 text-sm uppercase text-xs tracking-wide mb-1 text-indigo-500">Front</div>
                    <div className="text-slate-900">{card.front}</div>
                  </div>
                  <div className="w-px h-10 bg-slate-100 hidden md:block"></div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800 text-sm uppercase text-xs tracking-wide mb-1 text-emerald-500">Back</div>
                    <div className="text-slate-900">{card.back}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                        const newFront = prompt("New front text:", card.front);
                        const newBack = prompt("New back text:", card.back);
                        if(newFront && newBack) {
                            setState(prev => ({
                                ...prev,
                                cards: { ...prev.cards, [card.id]: { ...card, front: newFront, back: newBack } }
                            }));
                        }
                    }} className="p-2 text-slate-400 hover:text-indigo-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => {
                        if(confirm("Delete card?")) {
                            const { [card.id]: _, ...remainingCards } = state.cards;
                            setState(prev => ({ ...prev, cards: remainingCards }));
                        }
                    }} className="p-2 text-slate-400 hover:text-red-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              {activeDeckCards.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic">No cards in this deck yet.</div>
              )}
            </div>
          </div>
        )}

        {view === ViewMode.EDIT_CARD && (
          <CardEditor 
            title="Add New Flashcard"
            onSave={(data) => { saveNewCard(data); setView(ViewMode.DECK_VIEW); }}
            onCancel={() => setView(ViewMode.DECK_VIEW)}
          />
        )}

        {view === ViewMode.STUDY && studyCards.length > 0 && (
          <div className="max-w-2xl mx-auto py-12 w-full">
             <div className="mb-8 flex justify-between items-center">
                <button onClick={() => setView(ViewMode.DASHBOARD)} className="text-slate-500 hover:text-indigo-600 font-medium">Exit Study</button>
                <div className="bg-slate-200 h-2 flex-1 mx-4 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-300" 
                      style={{ width: `${((studyIndex + 1) / studyCards.length) * 100}%` }}
                    />
                </div>
                <span className="text-slate-500 font-medium">{studyIndex + 1} / {studyCards.length}</span>
             </div>

             <div className="card-flip-container cursor-pointer w-full min-h-[400px]" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`relative w-full h-full card-flip-inner min-h-[400px] ${isFlipped ? 'card-flipped' : ''}`}>
                    {/* Front */}
                    <div className="absolute inset-0 card-face bg-white rounded-3xl border border-slate-200 shadow-xl flex items-center justify-center p-12 text-center text-3xl font-medium text-slate-800">
                        {state.cards[studyCards[studyIndex]].front}
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 card-face card-back bg-indigo-50 rounded-3xl border-2 border-indigo-200 shadow-xl flex items-center justify-center p-12 text-center text-3xl font-medium text-slate-900">
                        {state.cards[studyCards[studyIndex]].back}
                    </div>
                </div>
             </div>

             <div className={`mt-12 flex gap-4 transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <button onClick={() => handleRating('again')} className="flex-1 py-4 bg-red-100 text-red-700 rounded-2xl font-bold hover:bg-red-200 active:scale-95 transition-all">Again</button>
                <button onClick={() => handleRating('hard')} className="flex-1 py-4 bg-amber-100 text-amber-700 rounded-2xl font-bold hover:bg-amber-200 active:scale-95 transition-all">Hard</button>
                <button onClick={() => handleRating('good')} className="flex-1 py-4 bg-green-100 text-green-700 rounded-2xl font-bold hover:bg-green-200 active:scale-95 transition-all">Good</button>
                <button onClick={() => handleRating('easy')} className="flex-1 py-4 bg-blue-100 text-blue-700 rounded-2xl font-bold hover:bg-blue-200 active:scale-95 transition-all">Easy</button>
             </div>
             
             {!isFlipped && (
               <p className="text-center mt-6 text-slate-400 font-medium animate-bounce">Click card to show answer</p>
             )}
          </div>
        )}

        {view === ViewMode.SEARCH && (
          <div>
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => { setSearchTerm(''); setView(ViewMode.DASHBOARD); }} className="text-indigo-600 font-bold">Clear Search</button>
              <h2 className="text-2xl font-bold">Search Results: "{searchTerm}"</h2>
            </div>
            <div className="grid gap-4">
               {searchResults.map(card => (
                  <div key={card.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                     <div className="w-24 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded uppercase truncate">
                        {state.decks[card.deckId]?.name || 'Unknown'}
                     </div>
                     <div className="flex-1">
                        <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Front</div>
                        <div className="text-slate-800">{card.front}</div>
                     </div>
                     <div className="flex-1">
                        <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Back</div>
                        <div className="text-slate-800">{card.back}</div>
                     </div>
                     <button onClick={() => { setActiveDeckId(card.deckId); setView(ViewMode.DECK_VIEW); }} className="p-2 bg-slate-100 rounded-lg hover:bg-indigo-600 hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                     </button>
                  </div>
               ))}
               {searchResults.length === 0 && (
                 <div className="text-center py-12 text-slate-400">No cards found matching your search.</div>
               )}
            </div>
          </div>
        )}
      </main>

      {/* Persistent Call to Action (Floating Mobile Nav) */}
      <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3">
        <button onClick={createDeck} className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
    </div>
  );
};

export default App;
