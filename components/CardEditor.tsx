
import React, { useState } from 'react';
import { Flashcard } from '../types';

interface CardEditorProps {
  card?: Partial<Flashcard>;
  onSave: (card: Partial<Flashcard>) => void;
  onCancel: () => void;
  title: string;
}

const CardEditor: React.FC<CardEditorProps> = ({ card, onSave, onCancel, title }) => {
  const [front, setFront] = useState(card?.front || '');
  const [back, setBack] = useState(card?.back || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!front || !back) return;
    onSave({ front, back });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-xl font-bold mb-4 text-slate-800">{title}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Front (Question)</label>
          <textarea
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="What is the capital of France?"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Back (Answer)</label>
          <textarea
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Paris"
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md transition-all"
          >
            Save Card
          </button>
        </div>
      </form>
    </div>
  );
};

export default CardEditor;
