import React, { useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export default function SearchBar({ searchText, onSearchChange, matchCount, currentMatch, onPrev, onNext }) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    if (expanded) {
      onSearchChange('');
      setExpanded(false);
    } else {
      setExpanded(true);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleExpand}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          expanded ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
        }`}
        aria-label="Tìm kiếm"
      >
        {expanded ? <X size={18} /> : <Search size={18} />}
      </button>
      {expanded && (
        <div className="flex items-center gap-1 flex-1 min-w-0 animate-in fade-in slide-in-from-right-2 duration-200">
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm trong tài liệu..."
            autoFocus
            className="flex-1 min-w-0 px-3 h-9 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchText && (
            <>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap px-1">
                {currentMatch}/{matchCount}
              </span>
              <button
                onClick={onPrev}
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"
                aria-label="Kết quả trước"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={onNext}
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"
                aria-label="Kết quả sau"
              >
                <ChevronDown size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}