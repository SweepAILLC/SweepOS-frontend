'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CLIENT_SEARCH_SUGGESTION_LIMIT,
  clientDisplayName,
  clientMatchesBoardSearch,
} from '@/lib/clientBoardSearch';
import type { Client } from '@/types/client';

export type ClientSearchComboboxProps = {
  clients: Client[];
  loading?: boolean;
  clientId: string;
  onClientIdChange: (clientId: string) => void;
  /** Change when the parent modal opens to reset search text and dropdown. */
  resetKey?: string | number | boolean;
  inputId?: string;
  label?: string;
};

export default function ClientSearchCombobox({
  clients,
  loading = false,
  clientId,
  onClientIdChange,
  resetKey,
  inputId = 'client-search',
  label = 'Client',
}: ClientSearchComboboxProps) {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const suggestionsId = `${inputId}-suggestions`;

  useEffect(() => {
    setQuery('');
    setDropdownOpen(false);
  }, [resetKey]);

  const suggestions = useMemo(() => {
    const q = query.trim();
    const matches = q ? clients.filter((c) => clientMatchesBoardSearch(c, q)) : clients;
    return matches.slice(0, CLIENT_SEARCH_SUGGESTION_LIMIT);
  }, [clients, query]);

  const selectClient = (c: Client) => {
    const name = clientDisplayName(c);
    const labelText = c.email ? `${name} (${c.email})` : name;
    onClientIdChange(c.id);
    setQuery(labelText);
    setDropdownOpen(false);
  };

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-autocomplete="list"
          aria-controls={suggestionsId}
          disabled={loading}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onClientIdChange('');
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setDropdownOpen(false), 150);
          }}
          placeholder="Search by name, email, phone…"
          className="w-full rounded-md glass-input sm:text-sm"
        />
        {clientId && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">Client selected</p>
        )}
        {dropdownOpen && !loading && (
          <ul
            id={suggestionsId}
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No clients found</li>
            ) : (
              suggestions.map((c) => {
                const name = clientDisplayName(c);
                return (
                  <li key={c.id} role="option" aria-selected={clientId === c.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700/80"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectClient(c)}
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
                      {c.email && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                          {c.email}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
        {loading && <p className="mt-1 text-xs text-gray-500">Loading clients…</p>}
      </div>
    </div>
  );
}
