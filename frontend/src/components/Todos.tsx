import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useAction, type AppState } from '../lib/api';
import { useToast } from './ui';

// A plain to-do list: no XP, no history. Ticked items stay (dimmed) until midnight, then the server deletes them.

export function TodoList({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const [text, setText] = useState('');
  const err = { onError: (e: Error) => toast(e.message, 'bad') };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    action.mutate({ path: '/todos', body: { text } }, { ...err, onSuccess: () => setText('') });
  };

  return (
    <div>
      <form onSubmit={add} className="flex gap-2">
        <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="What do you want to do?" autoFocus aria-label="New to-do" />
        <button type="submit" disabled={!text.trim() || action.isPending} aria-label="Add to-do"
          className="shrink-0 rounded-xl border border-line px-3 text-accent disabled:opacity-40"><Plus size={18} /></button>
      </form>

      {s.todos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing on the list.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {s.todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <button onClick={() => action.mutate({ method: 'PUT', path: `/todos/${t.id}`, body: { done: !t.done } }, err)}
                aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`} aria-pressed={t.done}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${t.done ? 'border-good bg-good/20 text-good' : 'border-line'}`}>
                {t.done && <Check size={13} />}
              </button>
              <span className={`min-w-0 flex-1 break-words text-sm ${t.done ? 'text-muted' : ''}`}>{t.text}</span>
              <button onClick={() => action.mutate({ method: 'DELETE', path: `/todos/${t.id}` }, err)} aria-label={`Delete "${t.text}"`}
                className="shrink-0 rounded-lg p-1 text-muted hover:text-bad"><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">No XP, just a list. Ticked items disappear at midnight.</p>
    </div>
  );
}
