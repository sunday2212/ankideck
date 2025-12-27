import { GoogleGenAI, Type } from "@google/genai";

/**
 * --- ANKI PRO VANILLA CORE ---
 * A self-contained Spaced Repetition Flashcard Application.
 */

// --- Constants & Configuration ---
const STORAGE_KEY = 'anki_pro_v2_vanilla';
const ONE_DAY = 24 * 60 * 60 * 1000;

// --- State Management ---
let state = {
  decks: {},
  cards: {},
  view: { mode: 'DASHBOARD', activeId: null },
  searchTerm: '',
  isAiLoading: false
};

// Study Session Locals (Not Persisted)
let studySession = {
  queue: [],
  index: 0,
  isFlipped: false
};

/**
 * Persists current application state to LocalStorage
 */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    decks: state.decks,
    cards: state.cards
  }));
}

/**
 * Loads application state from LocalStorage
 */
function load() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      state.decks = parsed.decks || {};
      state.cards = parsed.cards || {};
    } catch (e) {
      console.error("Failed to load saved state", e);
    }
  }
}

/**
 * SM2 Spaced Repetition Algorithm
 */
function scheduleCard(card, rating) {
  let { interval, ease, status } = card;
  const now = Date.now();

  if (rating === 'again') {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    status = 'learning';
  } else {
    if (status === 'new') {
      interval = rating === 'hard' ? 1 : rating === 'good' ? 2 : 4;
      status = 'learning';
    } else if (status === 'learning') {
      const mult = rating === 'hard' ? 1.2 : rating === 'good' ? 1.5 : 2.0;
      interval = Math.max(1, Math.ceil(interval * mult));
      status = 'review';
    } else {
      if (rating === 'hard') {
        ease = Math.max(1.3, ease - 0.15);
        interval = Math.max(1, Math.ceil(interval * 1.2));
      } else if (rating === 'good') {
        interval = Math.ceil(interval * ease);
      } else if (rating === 'easy') {
        ease += 0.15;
        interval = Math.ceil(interval * ease * 1.3);
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

/**
 * AI Generation Service
 */
async function aiGenerateCards(text) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the text provided, generate a list of 5-10 concise flashcards.
    Return only valid JSON.
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

/**
 * --- UI ACTIONS ---
 */
const actions = {
  navigate(mode, activeId = null) {
    state.view = { mode, activeId };
    state.searchTerm = '';
    render();
  },

  handleSearch(val) {
    state.searchTerm = val;
    if (val.trim()) state.view.mode = 'SEARCH';
    else if (state.view.mode === 'SEARCH') state.view.mode = 'DASHBOARD';
    render();
  },

  createDeck() {
    const name = prompt("Deck name:");
    if (!name) return;
    const folder = prompt("Folder name (optional):") || 'General';
    const id = crypto.randomUUID();
    state.decks[id] = { id, name, folder, description: '' };
    save();
    render();
  },

  editDeck(id) {
    const deck = state.decks[id];
    const n = prompt("Rename deck:", deck.name);
    if (!n) return;
    const f = prompt("Change folder:", deck.folder);
    state.decks[id] = { ...deck, name: n, folder: f || 'General' };
    save();
    render();
  },

  deleteDeck(id) {
    if (!confirm("Delete this deck and ALL cards?")) return;
    delete state.decks[id];
    Object.keys(state.cards).forEach(cid => {
      if (state.cards[cid].deckId === id) delete state.cards[cid];
    });
    save();
    this.navigate('DASHBOARD');
  },

  addCard(deckId) {
    const front = prompt("Front side text:");
    const back = prompt("Back side text:");
    if (!front || !back) return;
    const id = crypto.randomUUID();
    state.cards[id] = {
      id, deckId, front, back,
      dueDate: Date.now(),
      interval: 0,
      ease: 2.5,
      status: 'new'
    };
    save();
    render();
  },

  editCard(id) {
    const c = state.cards[id];
    const f = prompt("Edit Front:", c.front);
    const b = prompt("Edit Back:", c.back);
    if (!f || !b) return;
    state.cards[id] = { ...c, front: f, back: b };
    save();
    render();
  },

  deleteCard(id) {
    if (!confirm("Delete card?")) return;
    delete state.cards[id];
    save();
    render();
  },

  startStudy(deckId) {
    const now = Date.now();
    studySession.queue = Object.values(state.cards)
      .filter(c => c.deckId === deckId && c.dueDate <= now)
      .sort((a, b) => a.dueDate - b.dueDate)
      .map(c => c.id);

    if (studySession.queue.length === 0) {
      alert("All caught up! No cards due in this deck.");
      return;
    }

    studySession.index = 0;
    studySession.isFlipped = false;
    this.navigate('STUDY', deckId);
  },

  flip() {
    studySession.isFlipped = !studySession.isFlipped;
    render();
  },

  rate(rating) {
    const cid = studySession.queue[studySession.index];
    state.cards[cid] = scheduleCard(state.cards[cid], rating);
    save();

    if (studySession.index + 1 < studySession.queue.length) {
      studySession.index++;
      studySession.isFlipped = false;
      render();
    } else {
      alert("Session complete! Great progress.");
      this.navigate('DASHBOARD');
    }
  },

  async magic(deckId) {
    const text = prompt("Paste your notes to generate cards with AI:");
    if (!text) return;

    state.isAiLoading = true;
    render();

    try {
      const generated = await aiGenerateCards(text);
      generated.forEach(c => {
        const id = crypto.randomUUID();
        state.cards[id] = {
          id, deckId, front: c.front, back: c.back,
          dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new'
        };
      });
      save();
      alert(`Created ${generated.length} cards!`);
    } catch (e) {
      alert("AI Error. Check your connection or API Key.");
    } finally {
      state.isAiLoading = false;
      render();
    }
  },

  exportData() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki_pro_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  },

  importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target.result;
      try {
        const data = JSON.parse(raw);
        if (data.decks && data.cards) {
          state.decks = { ...state.decks, ...data.decks };
          state.cards = { ...state.cards, ...data.cards };
          save();
          alert("Import successful!");
          render();
        }
      } catch (err) {
        // Try TSV fallback
        const lines = raw.split('\n');
        const deckId = crypto.randomUUID();
        state.decks[deckId] = { id: deckId, name: "Imported " + file.name, folder: 'Imported', description: '' };
        lines.forEach(l => {
          const parts = l.split('\t');
          if (parts.length >= 2) {
            const cid = crypto.randomUUID();
            state.cards[cid] = { id: cid, deckId, front: parts[0], back: parts[1], dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new' };
          }
        });
        save();
        alert("Text import complete.");
        render();
      }
    };
    reader.readAsText(file);
  }
};

/**
 * --- RENDERERS ---
 */
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div class="flex items-center gap-4 cursor-pointer" onclick="app.navigate('DASHBOARD')">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
        <h1 class="text-xl font-extrabold text-slate-900 tracking-tight hidden sm:block">Anki Pro</h1>
      </div>

      <div class="flex-1 max-w-lg mx-10 relative hidden md:block">
        <input 
          type="text" 
          placeholder="Search your collection..."
          class="w-full pl-12 pr-4 py-2 bg-slate-100 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          value="${state.searchTerm}"
          oninput="app.handleSearch(this.value)"
        />
        <svg class="w-5 h-5 text-slate-400 absolute left-4 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="app.exportData()" class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Backup Collection">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </button>
        <label class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer" title="Import File">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          <input type="file" class="hidden" onchange="app.importData(event)" />
        </label>
      </div>
    </header>

    <main id="app-render-target" class="flex-1 p-6 md:p-12 max-w-7xl mx-auto w-full overflow-y-auto custom-scrollbar">
      ${renderCurrentView()}
    </main>
  `;
}

function renderCurrentView() {
  switch (state.view.mode) {
    case 'DASHBOARD': return vDashboard();
    case 'DECK_VIEW': return vDeckDetail(state.view.activeId);
    case 'STUDY': return vStudy();
    case 'SEARCH': return vSearch();
    default: return '<div>404</div>';
  }
}

function vDashboard() {
  const decks = Object.values(state.decks);
  const folders = [...new Set(decks.map(d => d.folder || 'Ungrouped'))].sort();

  if (decks.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 text-indigo-300">
           <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">No decks found</h2>
        <p class="text-slate-500 mb-8 max-w-sm">Create a new deck or import an existing Anki collection to start your learning journey.</p>
        <button onclick="app.createDeck()" class="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all">
          Create New Deck
        </button>
      </div>
    `;
  }

  return `
    <div class="flex justify-between items-end mb-10">
      <div>
        <h2 class="text-4xl font-black text-slate-900 tracking-tight">Your Library</h2>
        <p class="text-slate-500 font-medium mt-1">Consistency is the key to mastery.</p>
      </div>
      <button onclick="app.createDeck()" class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 flex items-center gap-2 hover:bg-indigo-700 transition-all">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
        New Deck
      </button>
    </div>

    ${folders.map(folder => {
      const fDecks = decks.filter(d => (d.folder || 'Ungrouped') === folder);
      return `
        <div class="mb-12">
          <div class="flex items-center gap-2 mb-6 group">
            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest">${folder}</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${fDecks.map(deck => {
              const dCards = Object.values(state.cards).filter(c => c.deckId === deck.id);
              const due = dCards.filter(c => c.dueDate <= Date.now()).length;
              const isNew = dCards.filter(c => c.status === 'new').length;
              return `
                <div class="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative overflow-hidden">
                  <div class="flex justify-between items-start mb-4">
                    <h4 class="text-2xl font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors truncate pr-2">${deck.name}</h4>
                    <span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase">${dCards.length} Cards</span>
                  </div>
                  
                  <div class="flex gap-6 mb-8">
                    <div class="flex flex-col">
                      <span class="text-xl font-black text-blue-600">${isNew}</span>
                      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">New</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="text-xl font-black text-green-600">${due}</span>
                      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Due</span>
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <button onclick="app.startStudy('${deck.id}')" class="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all ${dCards.length === 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}">
                      Study Now
                    </button>
                    <button onclick="app.navigate('DECK_VIEW', '${deck.id}')" class="px-4 py-3 bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl text-sm font-bold hover:bg-slate-100 transition-all">
                      Open
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

function vDeckDetail(id) {
  const deck = state.decks[id];
  const cards = Object.values(state.cards).filter(c => c.deckId === id);

  return `
    <div class="max-w-4xl mx-auto">
      <div class="mb-12">
        <button onclick="app.navigate('DASHBOARD')" class="text-indigo-600 font-bold text-sm flex items-center gap-1 mb-4 hover:translate-x-[-4px] transition-transform">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          Library
        </button>
        <div class="flex flex-col md:flex-row justify-between items-start gap-6">
          <div>
            <h2 class="text-5xl font-black text-slate-900 leading-tight">${deck.name}</h2>
            <div class="flex gap-2 mt-4">
               <span class="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-xs font-black uppercase">${deck.folder || 'No Folder'}</span>
               <span class="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-lg text-xs font-black uppercase">${cards.length} Total Cards</span>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="app.magic('${id}')" class="px-5 py-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-2xl font-bold flex items-center gap-2 hover:bg-amber-100 transition-all ${state.isAiLoading ? 'opacity-50 cursor-wait' : ''}">
               ${state.isAiLoading ? 'Magic-ing...' : '✨ AI Cards'}
            </button>
            <button onclick="app.addCard('${id}')" class="px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Add Card</button>
            <button onclick="app.editDeck('${id}')" class="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></button>
            <button onclick="app.deleteDeck('${id}')" class="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        ${cards.length === 0 ? '<div class="p-20 text-center border-4 border-dashed border-slate-100 rounded-3xl text-slate-300 font-bold italic">Deck is currently empty</div>' : 
          cards.map(c => `
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-8 group hover:border-indigo-200 transition-all">
            <div class="flex-1 min-w-0">
               <div class="text-[10px] font-black uppercase text-indigo-400 tracking-tighter mb-1">Front</div>
               <div class="text-slate-900 font-bold truncate leading-tight">${c.front}</div>
            </div>
            <div class="hidden md:block w-px h-10 bg-slate-100"></div>
            <div class="flex-1 min-w-0">
               <div class="text-[10px] font-black uppercase text-emerald-400 tracking-tighter mb-1">Back</div>
               <div class="text-slate-500 truncate leading-tight">${c.back}</div>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <button onclick="app.editCard('${c.id}')" class="p-2 text-slate-400 hover:text-indigo-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
               <button onclick="app.deleteCard('${c.id}')" class="p-2 text-slate-400 hover:text-red-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function vStudy() {
  const cid = studySession.queue[studySession.index];
  const card = state.cards[cid];

  return `
    <div class="max-w-2xl mx-auto py-10">
      <div class="flex items-center justify-between mb-10">
        <button onclick="app.navigate('DASHBOARD')" class="text-slate-400 font-black hover:text-indigo-600 transition-colors uppercase text-xs">Exit Session</button>
        <div class="flex-1 mx-8 bg-slate-200 h-2 rounded-full overflow-hidden shadow-inner">
          <div class="bg-indigo-600 h-full transition-all duration-500 ease-out" style="width: ${((studySession.index) / studySession.queue.length) * 100}%"></div>
        </div>
        <span class="text-xs font-black text-slate-400 uppercase tracking-tighter">${studySession.index + 1} / ${studySession.queue.length}</span>
      </div>

      <div class="card-flip-container h-[450px] w-full cursor-pointer" onclick="app.flip()">
        <div class="card-flip-inner ${studySession.isFlipped ? 'card-flipped' : ''}">
          <div class="card-face card-front flex-col gap-6">
            <span class="text-[10px] font-black uppercase text-indigo-300 tracking-[0.3em] absolute top-10">Question</span>
            <div class="text-3xl md:text-4xl font-extrabold text-slate-800 text-center leading-snug">${card.front}</div>
          </div>
          <div class="card-face card-back flex-col gap-6">
            <span class="text-[10px] font-black uppercase text-emerald-400 tracking-[0.3em] absolute top-10">Answer</span>
            <div class="text-3xl md:text-4xl font-bold text-slate-900 text-center leading-snug">${card.back}</div>
          </div>
        </div>
      </div>

      <div class="mt-12 flex gap-3 transition-all ${studySession.isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-4'}">
        <button onclick="app.rate('again')" class="flex-1 py-5 bg-red-100 text-red-700 rounded-3xl font-black hover:bg-red-200 active:scale-95 transition-all text-sm">AGAIN</button>
        <button onclick="app.rate('hard')" class="flex-1 py-5 bg-amber-100 text-amber-700 rounded-3xl font-black hover:bg-amber-200 active:scale-95 transition-all text-sm">HARD</button>
        <button onclick="app.rate('good')" class="flex-1 py-5 bg-green-100 text-green-700 rounded-3xl font-black hover:bg-green-200 active:scale-95 transition-all text-sm">GOOD</button>
        <button onclick="app.rate('easy')" class="flex-1 py-5 bg-blue-100 text-blue-700 rounded-3xl font-black hover:bg-blue-200 active:scale-95 transition-all text-sm">EASY</button>
      </div>

      ${!studySession.isFlipped ? `<div class="text-center mt-10 text-slate-300 font-bold uppercase tracking-widest text-xs animate-pulse">Click card to reveal answer</div>` : ''}
    </div>
  `;
}

function vSearch() {
  const query = state.searchTerm.toLowerCase();
  const results = Object.values(state.cards).filter(c => 
    c.front.toLowerCase().includes(query) || c.back.toLowerCase().includes(query)
  );

  return `
    <div>
      <div class="flex items-center justify-between mb-10">
        <div>
          <h2 class="text-3xl font-black text-slate-900">Search results</h2>
          <p class="text-slate-500 font-medium">Found ${results.length} cards matching "${state.searchTerm}"</p>
        </div>
        <button onclick="app.handleSearch('')" class="text-indigo-600 font-bold hover:underline">Clear</button>
      </div>

      <div class="grid gap-4">
        ${results.map(c => `
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 group cursor-pointer hover:border-indigo-300 transition-all" onclick="app.navigate('DECK_VIEW', '${c.deckId}')">
             <div class="w-24 truncate text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
               ${state.decks[c.deckId]?.name || 'Unknown'}
             </div>
             <div class="flex-1 font-bold text-slate-800 truncate">${c.front}</div>
             <div class="flex-1 text-slate-500 truncate">${c.back}</div>
             <svg class="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Initialize Application
window.app = actions;
load();
render();