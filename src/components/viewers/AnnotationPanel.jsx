import React from 'react';
import { X, Highlighter, Trash2 } from 'lucide-react';

const HIGHLIGHT_COLORS = [
  { key: 'yellow', label: 'Vàng', class: 'highlight-yellow', color: '#FACC15' },
  { key: 'green', label: 'Xanh lá', class: 'highlight-green', color: '#22C55E' },
  { key: 'pink', label: 'Hồng', class: 'highlight-pink', color: '#F472B6' },
];

export default function AnnotationPanel({
  open,
  onClose,
  annotations,
  onDelete,
  onHighlightText,
  activeSelection,
}) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[80%] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-foreground">Ghi chú & Highlight</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Add highlight for selected text */}
        {activeSelection && (
          <div className="p-4 border-b bg-blue-50/50">
            <p className="text-xs text-muted-foreground mb-2">Văn bản đã chọn:</p>
            <p className="text-sm text-foreground line-clamp-3 mb-3 italic">"{activeSelection}"</p>
            <div className="flex gap-2">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.key}
                  onClick={() => onHighlightText(color.key, activeSelection)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-white transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: color.color }}
                  />
                  <span className="text-xs text-muted-foreground">{color.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Annotations list */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Highlighter size={36} className="mb-3 opacity-40" />
              <p className="text-sm">Chưa có ghi chú nào</p>
              <p className="text-xs mt-1">Bôi đen văn bản trong tài liệu để tạo highlight</p>
            </div>
          ) : (
            annotations.map((ann) => (
              <div
                key={ann.id}
                className="group relative p-3 rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: HIGHLIGHT_COLORS.find(c => c.key === ann.color)?.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground break-words">{ann.text}</p>
                    {ann.note && (
                      <p className="text-xs text-muted-foreground mt-1 break-words">{ann.note}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onDelete(ann.id)}
                    className="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { HIGHLIGHT_COLORS };