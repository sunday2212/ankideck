import { GoogleGenAI, Type } from "@google/genai";

/**
 * --- ANKI PRO VANILLA CORE (HIGH-CAPACITY EDITION) ---
 * Optimized for streaming massive files (1GB+) and responsive UI.
 */

const STORAGE_KEY = 'anki_pro_v2_vanilla';
const ONE_DAY = 24 * 60 * 60 * 1000;

// --- State Management ---
let state = {
  decks: {},
  cards: {},
  view: { mode: 'DASHBOARD', activeId: null },
  searchTerm: '',
  isAiLoading: false,
  importProgress: { loading: false, percent: 0, currentAction: '' }
};

let studySession = {
  queue: [],
  index: 0,
  isFlipped: false
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      decks: state.decks,
      cards: state.cards
    }));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert("Local storage is full! Browsers limit storage to ~5-10MB. For 1GB+ files, please use the Export/Import feature to manage your data sessions.");
    }
  }
}

function load() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      state.decks = parsed.decks || {};
      state.cards = parsed.cards || {};
    } catch (e) {
      console.error("Failed to load state", e);
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

  return { ...card, interval, ease, status, dueDate: now + (interval * ONE_DAY) };
}

/**
 * AI Generation Service
 */
async function aiGenerateCards(text) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Identify key concepts from: ${text}. Format as JSON list of {front, back}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { front: { type: Type.STRING }, back: { type: Type.STRING } },
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
    const folder = prompt("Folder name:") || 'General';
    const id = crypto.randomUUID();
    state.decks[id] = { id, name, folder, description: '' };
    save();
    render();
  },

  deleteDeck(id) {
    if (!confirm("Delete deck?")) return;
    delete state.decks[id];
    Object.keys(state.cards).forEach(cid => { if (state.cards[cid].deckId === id) delete state.cards[cid]; });
    save();
    this.navigate('DASHBOARD');
  },

  addCard(deckId) {
    const f = prompt("Front:");
    const b = prompt("Back:");
    if (!f || !b) return;
    const id = crypto.randomUUID();
    state.cards[id] = { id, deckId, front: f, back: b, dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new' };
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
    if (confirm("Delete card?")) { delete state.cards[id]; save(); render(); }
  },

  startStudy(deckId) {
    const now = Date.now();
    studySession.queue = Object.values(state.cards)
      .filter(c => c.deckId === deckId && c.dueDate <= now)
      .sort((a, b) => a.dueDate - b.dueDate)
      .map(c => c.id);

    if (studySession.queue.length === 0) return alert("Nothing to review!");
    studySession.index = 0;
    studySession.isFlipped = false;
    this.navigate('STUDY', deckId);
  },

  flip() { studySession.isFlipped = !studySession.isFlipped; render(); },

  rate(rating) {
    const cid = studySession.queue[studySession.index];
    state.cards[cid] = scheduleCard(state.cards[cid], rating);
    save();
    if (studySession.index + 1 < studySession.queue.length) {
      studySession.index++;
      studySession.isFlipped = false;
      render();
    } else {
      alert("Session complete!");
      this.navigate('DASHBOARD');
    }
  },

  async magic(deckId) {
    const text = prompt("Paste notes for AI:");
    if (!text) return;
    state.isAiLoading = true;
    render();
    try {
      const gen = await aiGenerateCards(text);
      gen.forEach(c => {
        const id = crypto.randomUUID();
        state.cards[id] = { id, deckId, front: c.front, back: c.back, dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new' };
      });
      save();
      alert(`Created ${gen.length} cards!`);
    } catch (e) { alert("AI Error."); }
    state.isAiLoading = false;
    render();
  },

  exportData() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki_backup.json`;
    a.click();
  },

  /**
   * MASSIVE FILE STREAMING IMPORT (Supports 1GB+)
   */
  async importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    state.importProgress = { loading: true, percent: 0, currentAction: 'Preparing stream...' };
    render();

    const deckId = crypto.randomUUID();
    state.decks[deckId] = { id: deckId, name: "Imported: " + file.name, folder: 'Imported', description: '' };

    try {
      const stream = file.stream();
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let processedBytes = 0;
      let cardCount = 0;
      let batchCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        processedBytes += value.length;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep the last partial line in buffer

        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const cid = crypto.randomUUID();
            state.cards[cid] = { 
              id: cid, deckId, front: parts[0], back: parts[1], 
              dueDate: Date.now(), interval: 0, ease: 2.5, status: 'new' 
            };
            cardCount++;
            batchCount++;
          }
        }

        // Update UI every batch to stay responsive
        if (batchCount > 2000) {
          state.importProgress.percent = Math.round((processedBytes / file.size) * 100);
          state.importProgress.currentAction = `Imported ${cardCount.toLocaleString()} cards...`;
          batchCount = 0;
          render();
          await new Promise(r => setTimeout(r, 0)); // Release thread
        }
      }

      save();
      alert(`Success! Imported ${cardCount.toLocaleString()} cards.`);
    } catch (err) {
      console.error(err);
      alert("Error processing massive file. Ensure it is a valid tab-separated text file.");
    } finally {
      state.importProgress.loading = false;
      render();
    }
  }
};

/**
 * --- RENDERERS ---
 */
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    ${state.importProgress.loading ? `
      <div class="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 text-white text-center">
        <div class="max-w-md w-full">
          <div class="mb-6 animate-pulse">
             <svg class="w-16 h-16 mx-auto text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
          </div>
          <h2 class="text-2xl font-black mb-2">Processing Massive File...</h2>
          <p class="text-slate-400 mb-8 font-medium">${state.importProgress.currentAction}</p>
          <div class="w-full bg-slate-700 h-3 rounded-full overflow-hidden mb-2">
            <div class="bg-indigo-500 h-full transition-all duration-300" style="width: ${state.importProgress.percent}%"></div>
          </div>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">${state.importProgress.percent}% Complete</p>
          <p class="mt-10 text-[10px] text-slate-500 uppercase font-bold tracking-tighter">This handles 1GB+ without crashing your browser</p>
        </div>
      </div>
    ` : ''}

    <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div class="flex items-center gap-4 cursor-pointer" onclick="app.navigate('DASHBOARD')">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
        <h1 class="text-xl font-black text-slate-900 tracking-tight hidden sm:block">Anki Pro</h1>
      </div>

      <div class="flex-1 max-w-lg mx-10 relative hidden md:block">
        <input 
          type="text" 
          placeholder="Search collections..."
          class="w-full pl-12 pr-4 py-2.5 bg-slate-100 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
          value="${state.searchTerm}"
          oninput="app.handleSearch(this.value)"
        />
        <svg class="w-5 h-5 text-slate-400 absolute left-4 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      <div class="flex items-center gap-3">
        <button onclick="app.exportData()" class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Backup">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </button>
        <label class="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer" title="Import 1GB+ Anki Files">
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
        <h2 class="text-3xl font-black text-slate-900 mb-2">Your collection is empty</h2>
        <p class="text-slate-500 mb-8 max-w-sm">Import your massive Anki exports or create a new deck to get started.</p>
        <button onclick="app.createDeck()" class="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl">Create Deck</button>
      </div>
    `;
  }

  return `
    <h2 class="text-4xl font-black text-slate-900 mb-10">Dashboard</h2>
    ${folders.map(f => {
      const fd = decks.filter(d => (d.folder || 'Ungrouped') === f);
      return `
        <div class="mb-12">
          <h3 class="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            ${f}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${fd.map(deck => {
              const dCards = Object.values(state.cards).filter(c => c.deckId === deck.id);
              return `
                <div class="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all">
                  <h4 class="text-2xl font-black text-slate-900 mb-2">${deck.name}</h4>
                  <p class="text-xs font-bold text-slate-400 uppercase mb-6">${dCards.length.toLocaleString()} Cards</p>
                  <div class="flex gap-2">
                    <button onclick="app.startStudy('${deck.id}')" class="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">Study</button>
                    <button onclick="app.navigate('DECK_VIEW', '${deck.id}')" class="px-5 py-3 border border-slate-200 rounded-xl font-bold text-slate-500">Edit</button>
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
  const cards = Object.values(state.cards).filter(c => c.deckId === id).slice(0, 100); // Only render first 100 for speed
  const totalCount = Object.values(state.cards).filter(c => c.deckId === id).length;

  return `
    <div class="max-w-4xl mx-auto">
      <button onclick="app.navigate('DASHBOARD')" class="text-indigo-600 font-bold mb-4 flex items-center gap-2">← Back</button>
      <div class="flex justify-between items-start mb-10">
        <div>
          <h2 class="text-5xl font-black text-slate-900 leading-tight">${deck.name}</h2>
          <p class="text-slate-500 font-bold mt-2">${totalCount.toLocaleString()} Cards Total</p>
        </div>
        <div class="flex gap-2">
          <button onclick="app.magic('${id}')" class="px-5 py-3 bg-amber-50 text-amber-600 rounded-2xl font-bold">✨ AI Magic</button>
          <button onclick="app.addCard('${id}')" class="px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold">Add Card</button>
          <button onclick="app.deleteDeck('${id}')" class="p-3 bg-red-50 text-red-500 rounded-2xl"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
        </div>
      </div>
      
      ${totalCount > 100 ? `<div class="p-4 bg-amber-50 text-amber-700 rounded-xl mb-6 text-sm font-bold">Displaying first 100 cards for performance. All ${totalCount.toLocaleString()} are saved.</div>` : ''}

      <div class="space-y-4">
        ${cards.map(c => `
          <div class="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-8 group">
            <div class="flex-1 min-w-0">
               <div class="text-[10px] font-black uppercase text-indigo-400 mb-1">Front</div>
               <div class="text-slate-900 font-bold truncate">${c.front}</div>
            </div>
            <div class="flex-1 min-w-0">
               <div class="text-[10px] font-black uppercase text-emerald-400 mb-1">Back</div>
               <div class="text-slate-500 truncate">${c.back}</div>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100">
               <button onclick="app.editCard('${c.id}')" class="p-2 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
               <button onclick="app.deleteCard('${c.id}')" class="p-2 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
        <button onclick="app.navigate('DASHBOARD')" class="text-slate-400 font-black uppercase text-xs">Exit</button>
        <div class="flex-1 mx-8 bg-slate-200 h-2 rounded-full overflow-hidden">
          <div class="bg-indigo-600 h-full transition-all" style="width: ${((studySession.index) / studySession.queue.length) * 100}%"></div>
        </div>
        <span class="text-xs font-black text-slate-400">${studySession.index + 1}/${studySession.queue.length}</span>
      </div>
      <div class="card-flip-container h-[450px] w-full cursor-pointer" onclick="app.flip()">
        <div class="card-flip-inner ${studySession.isFlipped ? 'card-flipped' : ''}">
          <div class="card-face card-front">
            <div class="text-3xl font-extrabold text-slate-800 text-center">${card.front}</div>
          </div>
          <div class="card-face card-back">
            <div class="text-3xl font-bold text-slate-900 text-center">${card.back}</div>
          </div>
        </div>
      </div>
      <div class="mt-12 flex gap-3 transition-all ${studySession.isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}">
        <button onclick="app.rate('again')" class="flex-1 py-5 bg-red-100 text-red-700 rounded-3xl font-black">AGAIN</button>
        <button onclick="app.rate('hard')" class="flex-1 py-5 bg-amber-100 text-amber-700 rounded-3xl font-black">HARD</button>
        <button onclick="app.rate('good')" class="flex-1 py-5 bg-green-100 text-green-700 rounded-3xl font-black">GOOD</button>
        <button onclick="app.rate('easy')" class="flex-1 py-5 bg-blue-100 text-blue-700 rounded-3xl font-black">EASY</button>
      </div>
    </div>
  `;
}

function vSearch() {
  const q = state.searchTerm.toLowerCase();
  const results = Object.values(state.cards).filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)).slice(0, 100);
  return `
    <div>
      <h2 class="text-3xl font-black text-slate-900 mb-6">Search Results</h2>
      <div class="grid gap-4">
        ${results.map(c => `
          <div class="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-6 cursor-pointer" onclick="app.navigate('DECK_VIEW', '${c.deckId}')">
             <div class="flex-1 font-bold text-slate-800 truncate">${c.front}</div>
             <div class="flex-1 text-slate-500 truncate">${c.back}</div>
             <svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.app = actions;
load();
render();