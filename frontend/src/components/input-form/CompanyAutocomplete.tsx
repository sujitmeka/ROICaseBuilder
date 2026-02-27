"use client";

import { useState, useEffect, useRef } from "react";

const POPULAR_COMPANIES = [
  { name: "Nike", ticker: "NKE", exchange: "NYSE" },
  { name: "Apple", ticker: "AAPL", exchange: "NASDAQ" },
  { name: "Amazon", ticker: "AMZN", exchange: "NASDAQ" },
  { name: "Walmart", ticker: "WMT", exchange: "NYSE" },
  { name: "Target", ticker: "TGT", exchange: "NYSE" },
  { name: "Starbucks", ticker: "SBUX", exchange: "NASDAQ" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function CompanyAutocomplete({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof POPULAR_COMPANIES>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (value.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filtered = POPULAR_COMPANIES.filter((c) =>
        c.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
      setIsOpen(filtered.length > 0);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  return (
    <div className="relative">
      <input
        id="companyName"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        placeholder="e.g., Nike, Warby Parker, Stripe..."
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg"
        >
          {suggestions.map((company) => (
            <li
              key={company.name}
              role="option"
              aria-selected={false}
              onClick={() => {
                onChange(company.name);
                setIsOpen(false);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
            >
              <span className="font-medium">{company.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {company.exchange}: {company.ticker}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
