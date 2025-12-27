
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Constants ---
type CardStatus = 'new' | 'learning' | 'review';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  dueDate: number;
  interval: number;
  ease: number;
  status: CardStatus;
  deckId: string;
}

interface Deck {
  id: string;
  name: string;
  description: string;
  folder: string;
}

interface AppState {
  decks: Record<string, Deck>;
  cards: Record<string, Flashcard>;
  view: {
    mode: 'DASHBOARD' | 'DECK_VIEW' | 'STUDY' | 'SEARCH';
    activeId?: string;
  };
  searchTerm: string;
}

const STORAGE_KEY = 'anki_vanilla_pro_v1';

// --- State Management ---
let state: AppState = {
  decks: {},
  cards: {},
  view: { mode: 'DASHBOARD' },
  searchTerm: ''
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    state = { ...state, ...JSON.parse(saved) };
    // Always start at dashboard on refresh
    state.view = { mode: 'DASHBOARD' };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Spaced Repetition Logic (SM2) ---
function scheduleCard(card: Flashcard, rating: 'again' | 'hard' | 'good' | 'easy'): Flashcard {
  let { interval, ease, status } = card;
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (rating === 'again') {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    status = 'learning';
  } else {
    if (status === 'new') {
      interval = rating === 'hard' ? 1 : rating === 'good' ? 2 : 4;
      status = 'learning';
    } else if (status === 'learning') {
      const multiplier = rating === 'hard' ? 1.2 : rating === 'good' ? 1.5 : 2.0;
      interval = Math.max(1, interval * multiplier);
      status = 'review';
    } else {
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
}

// --- AI Service ---
async function generateCardsFromText(text: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract at least 5 key concepts and their definitions from the text below. 
    Format as JSON list of objects with "front" and "back" keys.
    Text: ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ["front", "back"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

// --- Rendering Engine ---
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <header class="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-4 cursor-pointer" onclick="window.app.navigate('DASHBOARD')">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg transform hover:rotate-6 transition-transform">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 hidden sm:block">Anki Pro</h1>
      </div>

      <div class="flex-1 max-w-lg mx-12 relative hidden md:block">
        <input 
          type="text" 
          placeholder="Search your collection..."
          class="w-full pl-12 pr-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
          value="${state.searchTerm}"
          oninput="window.app.handleSearch(this.value)"
        />
        <svg class="w-5 h-5 text-slate-400 absolute left-4 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      <div class="flex items-center gap-3">
        <button onclick="window.app.exportData()" class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Export Collection">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </button>
        <label class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer" title="Import Collection (.json or .txt)">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          <input type="file" class="hidden" onchange="window.app.handleImport(event)" />
        </label>
      </div>
    </header>

    <main id="app-content" class="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full overflow-y-auto custom-scrollbar">
      ${renderView()}
    </main>
  `;
}

function renderView() {
  switch (state.view.mode) {
    case 'DASHBOARD': return renderDashboard();
    case 'DECK_VIEW': return renderDeckView(state.view.activeId!);
    case 'STUDY': return renderStudyView(state.view.activeId!);
    case 'SEARCH': return renderSearchView();
    default: return '<div>Not Found</div>';
  }
}

function renderDashboard() {
  const decks = Object.values(state.decks);
  const folders = [...new Set(decks.map(d => d.folder || 'Ungrouped'))].sort();
  
  if (decks.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 mb-2">Welcome to your new library</h2>
        <p class="text-slate-500 mb-8 max-w-sm">Create your first deck or import an existing collection to start learning with spaced repetition.</p>
        <button onclick="window.app.createDeck()" class="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all">
          Create First Deck
        </button>
      </div>
    `;
  }

  return `
    <div class="flex justify-between items-end mb-10">
      <div>
        <h2 class="text-3xl font-black text-slate-900 tracking-tight">Dashboard</h2>
        <p class="text-slate-500 mt-1">Select a deck to start your daily review.</p>
      </div>
      <button onclick="window.app.createDeck()" class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
        New Deck
      </button>
    </div>

    ${folders.map(folder => {
      const folderDecks = decks.filter(d => (d.folder || 'Ungrouped') === folder);
      return `
        <div class="mb-12">
          <div class="flex items-center gap-2 mb-6 group cursor-pointer" onclick="window.app.renameFolder('${folder}')">
            <svg class="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <h3 class="text-lg font-bold text-slate-800 uppercase tracking-widest">${folder}</h3>
            <span class="text-xs text-slate-400 font-medium ml-1">(${folderDecks.length})</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${folderDecks.map(deck => {
              const deckCards = Object.values(state.cards).filter(c => c.deckId === deck.id);
              const due = deckCards.filter(c => c.dueDate <= Date.now()).length;
              const isNew = deckCards.filter(c => c.status === 'new').length;
              return `
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group">
                  <div class="flex justify-between items-start mb-4">
                    <h4 class="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate pr-2">${deck.name}</h4>
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">${deckCards.length} cards</span>
                  </div>
                  <p class="text-sm text-slate-500 mb-6 line-clamp-2 h-10">${deck.description || 'No description provided'}</p>
                  
                  <div class="flex gap-4 mb-6">
                    <div class="flex flex-col">
                      <span class="text-blue-600 font-bold">${isNew}</span>
                      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">New</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="text-green-600 font-bold">${due}</span>
                      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Due</span>
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <button onclick="window.app.startStudy('${deck.id}')" class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-700 active:scale-95 transition-all ${deckCards.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}">
                      Study
                    </button>
                    <button onclick="window.app.navigate('DECK_VIEW', '${deck.id}')" class="px-4 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-100 transition-all">
                      Edit
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderDeckView(deckId: string) {
  const deck = state.decks[deckId];
  const cards = Object.values(state.cards).filter(c => c.deckId === deckId);
  
  return `
    <div class="animate-in slide-in-from-bottom-2 duration-300">
      <div class="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
        <div>
          <button onclick="window.app.navigate('DASHBOARD')" class="text-indigo-600 font-bold flex items-center gap-1 mb-2 hover:translate-x-[-4px] transition-transform">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </button>
          <h2 class="text-3xl font-black text-slate-900">${deck.name}</h2>
          <div class="flex gap-2 mt-2">
            <span class="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded font-medium">${deck.folder || 'No Folder'}</span>
            <span class="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium">${cards.length} cards</span>
          </div>
        </div>
        
        <div class="flex gap-2 flex-wrap">
          <button onclick="window.app.magicCards('${deckId}')" class="px-5 py-2.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-100 transition-all">
            ✨ AI Magic
          </button>
          <button onclick="window.app.addCard('${deckId}')" class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all">
            Add Card
          </button>
          <button onclick="window.app.editDeck('${deckId}')" class="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">
            Settings
          </button>
          <button onclick="window.app.deleteDeck('${deckId}')" class="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all">
            Delete
          </button>
        </div>
      </div>

      <div class="space-y-4">
        ${cards.length === 0 ? `
          <div class="p-20 text-center border-2 border-dashed border-slate-200 rounded-3xl">
            <p class="text-slate-400 font-medium">This deck is currently empty.</p>
          </div>
        ` : cards.map(card => `
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 group hover:border-indigo-200 transition-all">
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-black uppercase text-indigo-400 tracking-tighter mb-1">Front</div>
              <div class="text-slate-800 font-medium truncate">${card.front}</div>
            </div>
            <div class="hidden md:block w-px h-8 bg-slate-100"></div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-black uppercase text-green-400 tracking-tighter mb-1">Back</div>
              <div class="text-slate-600 truncate">${card.back}</div>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="window.app.editCard('${card.id}')" class="p-2 text-slate-400 hover:text-indigo-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
              <button onclick="window.app.deleteCard('${card.id}')" class="p-2 text-slate-400 hover:text-red-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Internal study state (not persisted)
let studyQueue: string[] = [];
let currentIndex = 0;
let isFlipped = false;

function renderStudyView(deckId: string) {
  const cardId = studyQueue[currentIndex];
  const card = state.cards[cardId];

  return `
    <div class="max-w-3xl mx-auto py-10 w-full animate-in zoom-in-95 duration-300">
      <div class="flex items-center justify-between mb-8">
        <button onclick="window.app.navigate('DASHBOARD')" class="text-slate-500 font-bold hover:text-indigo-600 transition-colors flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Exit Session
        </button>
        <div class="flex-1 mx-8 bg-slate-200 h-2 rounded-full overflow-hidden shadow-inner">
          <div class="bg-indigo-600 h-full transition-all duration-500" style="width: ${((currentIndex) / studyQueue.length) * 100}%"></div>
        </div>
        <span class="text-sm font-bold text-slate-400">${currentIndex + 1} / ${studyQueue.length}</span>
      </div>

      <div class="card-flip-container h-[420px] w-full cursor-pointer group" onclick="window.app.flipCard()">
        <div id="study-card-inner" class="card-flip-inner ${isFlipped ? 'card-flipped' : ''}">
          <div class="card-face card-front border-slate-200 flex-col gap-4">
            <span class="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-300 absolute top-8">Question</span>
            <div class="text-3xl font-semibold text-slate-800 text-center leading-relaxed">${card.front}</div>
          </div>
          <div class="card-face card-back border-indigo-100 flex-col gap-4">
             <span class="text-[10px] uppercase tracking-[0.2em] font-black text-green-300 absolute top-8">Answer</span>
             <div class="text-3xl font-medium text-slate-900 text-center leading-relaxed">${card.back}</div>
          </div>
        </div>
      </div>

      <div id="study-controls" class="mt-12 flex gap-4 transition-all duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-4'}">
        <button onclick="window.app.rateCard('again')" class="flex-1 py-4 bg-red-100 text-red-700 rounded-2xl font-black hover:bg-red-200 active:scale-95 transition-all">AGAIN</button>
        <button onclick="window.app.rateCard('hard')" class="flex-1 py-4 bg-amber-100 text-amber-700 rounded-2xl font-black hover:bg-amber-200 active:scale-95 transition-all">HARD</button>
        <button onclick="window.app.rateCard('good')" class="flex-1 py-4 bg-green-100 text-green-700 rounded-2xl font-black hover:bg-green-200 active:scale-95 transition-all">GOOD</button>
        <button onclick="window.app.rateCard('easy')" class="flex-1 py-4 bg-blue-100 text-blue-700 rounded-2xl font-black hover:bg-blue-200 active:scale-95 transition-all">EASY</button>
      </div>

      ${!isFlipped ? `
        <div class="text-center mt-8 animate-bounce text-slate-400 font-bold tracking-tight">
          Click card to show answer
        </div>
      ` : ''}
    </div>
  `;
}

function renderSearchView() {
  const query = state.searchTerm.toLowerCase();
  const results = Object.values(state.cards).filter(c => 
    c.front.toLowerCase().includes(query) || c.back.toLowerCase().includes(query)
  );

  return `
    <div class="animate-in fade-in duration-300">
      <div class="flex items-center justify-between mb-10">
        <div>
          <h2 class="text-3xl font-black text-slate-900">Search Results</h2>
          <p class="text-slate-500">Found ${results.length} cards matching "${state.searchTerm}"</p>
        </div>
        <button onclick="window.app.handleSearch('')" class="text-indigo-600 font-bold hover:underline">Clear Search</button>
      </div>

      <div class="grid gap-4">
        ${results.map(card => `
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 group cursor-pointer hover:border-indigo-400" onclick="window.app.navigate('DECK_VIEW', '${card.deckId}')">
             <div class="w-32 truncate text-xs font-black text-slate-400 uppercase bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
               ${state.decks[card.deckId]?.name || 'Unknown'}
             </div>
             <div class="flex-1 truncate text-slate-800 font-medium">${card.front}</div>
             <div class="flex-1 truncate text-slate-500">${card.back}</div>
             <svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </div>
        `).join('')}
        ${results.length === 0 ? '<div class="text-center py-20 text-slate-400 italic">No matches found.</div>' : ''}
      </div>
    </div>
  `;
}

// --- App Controller (Exposed to window) ---
const controller = {
  navigate(mode: AppState['view']['mode'], activeId?: string) {
    state.view = { mode, activeId };
    state.searchTerm = '';
    render();
  },

  handleSearch(term: string) {
    state.searchTerm = term;
    if (term.length > 0) {
      state.view = { mode: 'SEARCH' };
    } else if (state.view.mode === 'SEARCH') {
      state.view = { mode: 'DASHBOARD' };
    }
    render();
  },

  createDeck() {
    const name = prompt("Enter deck name:");
    if (!name) return;
    const folder = prompt("Folder name (optional):") || 'General';
    const id = crypto.randomUUID();
    state.decks[id] = { id, name, description: '', folder };
    saveState();
    render();
  },

  editDeck(deckId: string) {
    const deck = state.decks[deckId];
    const newName = prompt("New name:", deck.name);
    if (!newName) return;
    const newFolder = prompt("New folder:", deck.folder);
    state.decks[deckId] = { ...deck, name: newName, folder: newFolder || 'General' };
    saveState();
    render();
  },

  deleteDeck(deckId: string) {
    if (!confirm("Delete this deck and all its cards? This cannot be undone.")) return;
    delete state.decks[deckId];
    Object.keys(state.cards).forEach(cid => {
      if (state.cards[cid].deckId === deckId) delete state.cards[cid];
    });
    saveState();
    this.navigate('DASHBOARD');
  },

  addCard(deckId: string) {
    const front = prompt("Front text:");
    const back = prompt("Back text:");
    if (!front || !back) return;
    const id = crypto.randomUUID();
    state.cards[id] = {
      id, deckId, front, back,
      dueDate: Date.now(),
      interval: 0,
      ease: 2.5,
      status: 'new'
    };
    saveState();
    render();
  },

  editCard(cardId: string) {
    const card = state.cards[cardId];
    const front = prompt("Edit Front:", card.front);
    const back = prompt("Edit Back:", card.back);
    if (!front || !back) return;
    state.cards[cardId] = { ...card, front, back };
    saveState();
    render();
  },

  deleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    delete state.cards[cardId];
    saveState();
    render();
  },

  startStudy(deckId: string) {
    const now = Date.now();
    studyQueue = Object.values(state.cards)
      .filter(c => c.deckId === deckId && c.dueDate <= now)
      .sort((a, b) => a.dueDate - b.dueDate)
      .map(c => c.id);
    
    if (studyQueue.length === 0) {
      alert("No cards due for review in this deck! Great job.");
      return;
    }

    currentIndex = 0;
    isFlipped = false;
    this.navigate('STUDY', deckId);
  },

  flipCard() {
    isFlipped = !isFlipped;
    render();
  },

  rateCard(rating: 'again' | 'hard' | 'good' | 'easy') {
    const cardId = studyQueue[currentIndex];
    state.cards[cardId] = scheduleCard(state.cards[cardId], rating);
    saveState();

    if (currentIndex + 1 < studyQueue.length) {
      currentIndex++;
      isFlipped = false;
      render();
    } else {
      alert("Session completed! See you tomorrow.");
      this.navigate('DASHBOARD');
    }
  },

  renameFolder(oldName: string) {
    const newName = prompt("Rename folder to:", oldName);
    if (!newName || newName === oldName) return;
    Object.values(state.decks).forEach(deck => {
      if (deck.folder === oldName) deck.folder = newName;
    });
    saveState();
    render();
  },

  async magicCards(deckId: string) {
    const text = prompt("Paste text (article, notes, etc.) to auto-generate cards:");
    if (!text) return;
    
    // Quick UI feedback
    const btn = document.activeElement as HTMLButtonElement;
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
      const cards = await generateCardsFromText(text);
      cards.forEach((c: any) => {
        const id = crypto.randomUUID();
        state.cards[id] = {
          id, deckId, front: c.front, back: c.back,
          dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new'
        };
      });
      saveState();
      alert(`Successfully generated ${cards.length} cards!`);
    } catch (e) {
      alert("Failed to generate cards. Please check your API key.");
    } finally {
      btn.innerText = originalText;
      btn.disabled = false;
      render();
    }
  },

  exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki_pro_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  },

  handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Try JSON first
      try {
        const data = JSON.parse(content);
        if (data.decks && data.cards) {
          state = { ...state, ...data };
          saveState();
          alert("Collection imported!");
          render();
          return;
        }
      } catch (e) {}

      // Fallback to Tab-Separated Values (Standard Anki Export)
      try {
        const lines = content.split('\n');
        const deckName = prompt("Importing TSV file. New deck name:", "Imported Deck") || "Imported Deck";
        const deckId = crypto.randomUUID();
        state.decks[deckId] = { id: deckId, name: deckName, description: 'Imported from text file', folder: 'Imported' };
        
        let count = 0;
        lines.forEach(line => {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const id = crypto.randomUUID();
            state.cards[id] = {
              id, deckId, front: parts[0], back: parts[1],
              dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new'
            };
            count++;
          }
        });
        saveState();
        alert(`Imported ${count} cards successfully!`);
        render();
      } catch (e) {
        alert("Failed to parse file. Use JSON or Tab-Separated (.txt) files.");
      }
    };
    reader.readAsText(file);
  }
};

// --- Initialization ---
// @ts-ignore
window.app = controller;
loadState();
render();
