
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
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

const STORAGE_KEY = 'anki_vanilla_pro_storage_v2';

// --- State Management ---
let state: AppState = {
  decks: {},
  cards: {},
  view: { mode: 'DASHBOARD' },
  searchTerm: ''
};

// Internal non-persisted study state
let studyQueue: string[] = [];
let currentIndex = 0;
let isFlipped = false;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
      state.view = { mode: 'DASHBOARD' }; // Always reset view on load
    } catch (e) {
      console.error("Failed to load state", e);
    }
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
    contents: `Identify key facts and concepts from the text and create flashcards. 
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

// --- View Rendering ---
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <header class="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-4 cursor-pointer" onclick="app.navigate('DASHBOARD')">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
        <h1 class="text-xl font-bold text-slate-900 hidden sm:block">Anki Pro</h1>
      </div>

      <div class="flex-1 max-w-lg mx-12 relative hidden md:block">
        <input 
          type="text" 
          placeholder="Search all cards..."
          class="w-full pl-12 pr-4 py-2 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500"
          value="${state.searchTerm}"
          oninput="app.handleSearch(this.value)"
        />
        <svg class="w-5 h-5 text-slate-400 absolute left-4 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="app.exportData()" class="p-2 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors" title="Export">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </button>
        <label class="p-2 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer" title="Import">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          <input type="file" class="hidden" onchange="app.handleImport(event)" />
        </label>
      </div>
    </header>

    <main id="app-content" class="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full overflow-y-auto">
      ${renderView()}
    </main>
  `;
}

function renderView() {
  switch (state.view.mode) {
    case 'DASHBOARD': return renderDashboard();
    case 'DECK_VIEW': return renderDeckView(state.view.activeId!);
    case 'STUDY': return renderStudyView();
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
        <h2 class="text-2xl font-bold text-slate-800 mb-2">Collection is Empty</h2>
        <p class="text-slate-500 mb-8 max-w-xs">Start by creating a new deck or importing your Anki files.</p>
        <button onclick="app.createDeck()" class="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200">
          Create Deck
        </button>
      </div>
    `;
  }

  return `
    <div class="flex justify-between items-center mb-8">
      <h2 class="text-3xl font-black text-slate-900">Dashboard</h2>
      <button onclick="app.createDeck()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-md">
        + New Deck
      </button>
    </div>

    ${folders.map(folder => {
      const folderDecks = decks.filter(d => (d.folder || 'Ungrouped') === folder);
      return `
        <div class="mb-10">
          <div class="flex items-center gap-2 mb-4 group cursor-pointer" onclick="app.renameFolder('${folder}')">
            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <h3 class="text-sm font-black text-slate-500 uppercase tracking-widest">${folder}</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${folderDecks.map(deck => {
              const deckCards = Object.values(state.cards).filter(c => c.deckId === deck.id);
              const due = deckCards.filter(c => c.dueDate <= Date.now()).length;
              return `
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div class="flex justify-between items-start mb-2">
                    <h4 class="text-xl font-bold text-slate-900">${deck.name}</h4>
                    <span class="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">${deckCards.length} cards</span>
                  </div>
                  <div class="flex gap-4 mt-4 mb-6">
                    <div class="text-green-600 font-bold text-sm">Due: ${due}</div>
                    <div class="text-blue-600 font-bold text-sm">New: ${deckCards.filter(c => c.status === 'new').length}</div>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="app.startStudy('${deck.id}')" class="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm active:scale-95 transition-transform ${deckCards.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}">
                      Study
                    </button>
                    <button onclick="app.navigate('DECK_VIEW', '${deck.id}')" class="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold">
                      View
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
      <div class="mb-8">
        <button onclick="app.navigate('DASHBOARD')" class="text-indigo-600 font-bold text-sm flex items-center gap-1 mb-2 hover:translate-x-[-2px] transition-transform">
          ← Dashboard
        </button>
        <div class="flex justify-between items-start">
          <h2 class="text-4xl font-black text-slate-900">${deck.name}</h2>
          <div class="flex gap-2">
            <button onclick="app.magicCards('${deckId}')" class="px-4 py-2 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-bold text-sm">✨ AI Generate</button>
            <button onclick="app.addCard('${deckId}')" class="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md">Add Card</button>
            <button onclick="app.deleteDeck('${deckId}')" class="px-4 py-2 border border-red-100 text-red-500 rounded-xl font-bold text-sm">Delete</button>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        ${cards.map(card => `
          <div class="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 group hover:border-indigo-300 transition-colors">
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-bold uppercase text-slate-400 mb-1">Front</div>
              <div class="text-slate-800 font-medium truncate">${card.front}</div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-bold uppercase text-slate-400 mb-1">Back</div>
              <div class="text-slate-600 truncate">${card.back}</div>
            </div>
            <div class="flex opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="app.editCard('${card.id}')" class="p-2 text-slate-400 hover:text-indigo-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
              <button onclick="app.deleteCard('${card.id}')" class="p-2 text-slate-400 hover:text-red-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
          </div>
        `).join('')}
        ${cards.length === 0 ? '<div class="text-center py-12 text-slate-400 italic">No cards here yet.</div>' : ''}
      </div>
    </div>
  `;
}

function renderStudyView() {
  const cardId = studyQueue[currentIndex];
  const card = state.cards[cardId];

  return `
    <div class="max-w-2xl mx-auto py-10">
      <div class="flex items-center justify-between mb-8">
        <button onclick="app.navigate('DASHBOARD')" class="text-slate-400 font-bold hover:text-slate-600">Cancel</button>
        <div class="flex-1 mx-8 bg-slate-200 h-1.5 rounded-full overflow-hidden">
          <div class="bg-indigo-600 h-full transition-all duration-300" style="width: ${((currentIndex) / studyQueue.length) * 100}%"></div>
        </div>
        <span class="text-xs font-bold text-slate-400">${currentIndex + 1}/${studyQueue.length}</span>
      </div>

      <div class="card-flip-container h-[380px] w-full cursor-pointer" onclick="app.flipCard()">
        <div id="study-card-inner" class="card-flip-inner ${isFlipped ? 'card-flipped' : ''}">
          <div class="card-face card-front border-slate-200">
            <div class="text-2xl font-semibold text-slate-800 text-center">${card.front}</div>
          </div>
          <div class="card-face card-back border-indigo-100">
             <div class="text-2xl font-medium text-slate-900 text-center">${card.back}</div>
          </div>
        </div>
      </div>

      <div id="rating-controls" class="mt-10 flex gap-3 transition-all ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}">
        <button onclick="app.rateCard('again')" class="flex-1 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs hover:bg-red-100 transition-colors">AGAIN</button>
        <button onclick="app.rateCard('hard')" class="flex-1 py-4 bg-amber-50 text-amber-600 rounded-2xl font-black text-xs hover:bg-amber-100 transition-colors">HARD</button>
        <button onclick="app.rateCard('good')" class="flex-1 py-4 bg-green-50 text-green-600 rounded-2xl font-black text-xs hover:bg-green-100 transition-colors">GOOD</button>
        <button onclick="app.rateCard('easy')" class="flex-1 py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-xs hover:bg-blue-100 transition-colors">EASY</button>
      </div>
      
      ${!isFlipped ? `<div class="text-center mt-6 text-slate-300 animate-pulse font-medium">Click to see answer</div>` : ''}
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
      <h2 class="text-3xl font-black text-slate-900 mb-6">Search Results</h2>
      <div class="space-y-4">
        ${results.map(card => `
          <div class="bg-white p-4 rounded-xl border border-slate-200 flex gap-4 cursor-pointer hover:border-indigo-400" onclick="app.navigate('DECK_VIEW', '${card.deckId}')">
             <div class="w-24 truncate text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded self-start">
               ${state.decks[card.deckId]?.name || 'Unknown'}
             </div>
             <div class="flex-1 font-medium text-slate-800">${card.front}</div>
             <div class="flex-1 text-slate-500">${card.back}</div>
          </div>
        `).join('')}
        ${results.length === 0 ? '<div class="text-center py-20 text-slate-400">No matching cards found.</div>' : ''}
      </div>
    </div>
  `;
}

// --- App Controller ---
const controller = {
  navigate(mode: AppState['view']['mode'], activeId?: string) {
    state.view = { mode, activeId };
    state.searchTerm = '';
    render();
  },

  handleSearch(term: string) {
    state.searchTerm = term;
    if (term.length > 0) state.view.mode = 'SEARCH';
    else if (state.view.mode === 'SEARCH') state.view.mode = 'DASHBOARD';
    render();
  },

  createDeck() {
    const name = prompt("Deck name:");
    if (!name) return;
    const folder = prompt("Folder (optional):") || 'General';
    const id = crypto.randomUUID();
    state.decks[id] = { id, name, description: '', folder };
    saveState();
    render();
  },

  deleteDeck(id: string) {
    if (!confirm("Delete this deck and all its cards?")) return;
    delete state.decks[id];
    Object.keys(state.cards).forEach(cid => {
      if (state.cards[cid].deckId === id) delete state.cards[cid];
    });
    saveState();
    this.navigate('DASHBOARD');
  },

  addCard(deckId: string) {
    const front = prompt("Front:");
    const back = prompt("Back:");
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

  editCard(id: string) {
    const card = state.cards[id];
    const front = prompt("Edit Front:", card.front);
    const back = prompt("Edit Back:", card.back);
    if (!front || !back) return;
    state.cards[id] = { ...card, front, back };
    saveState();
    render();
  },

  deleteCard(id: string) {
    if (!confirm("Delete card?")) return;
    delete state.cards[id];
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
      alert("No cards due! You're all caught up.");
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
      alert("Session Complete!");
      this.navigate('DASHBOARD');
    }
  },

  renameFolder(old: string) {
    const n = prompt("Rename folder to:", old);
    if (!n || n === old) return;
    Object.values(state.decks).forEach(d => {
      if (d.folder === old) d.folder = n;
    });
    saveState();
    render();
  },

  async magicCards(deckId: string) {
    const text = prompt("Paste notes/text to generate cards:");
    if (!text) return;
    
    try {
      const btn = document.activeElement as HTMLButtonElement;
      btn.innerText = "...";
      const cards = await generateCardsFromText(text);
      cards.forEach((c: any) => {
        const id = crypto.randomUUID();
        state.cards[id] = {
          id, deckId, front: c.front, back: c.back,
          dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new'
        };
      });
      saveState();
      alert(`Created ${cards.length} cards.`);
    } catch (e) {
      alert("AI Error. Check API Key.");
    } finally {
      render();
    }
  },

  exportData() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki_backup_${Date.now()}.json`;
    a.click();
  },

  handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        const data = JSON.parse(content);
        if (data.decks && data.cards) {
          state = { ...state, ...data };
          saveState();
          render();
        }
      } catch (e) {
        // Fallback to TSV (Standard Anki)
        const lines = content.split('\n');
        const deckId = crypto.randomUUID();
        state.decks[deckId] = { id: deckId, name: "Imported Deck", description: '', folder: 'Imported' };
        lines.forEach(l => {
          const p = l.split('\t');
          if (p.length >= 2) {
            const cid = crypto.randomUUID();
            state.cards[cid] = { id: cid, deckId, front: p[0], back: p[1], dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new' };
          }
        });
        saveState();
        render();
      }
    };
    reader.readAsText(file);
  }
};

// Expose to window for HTML events
// @ts-ignore
window.app = controller;

// --- Initialize ---
loadState();
render();
