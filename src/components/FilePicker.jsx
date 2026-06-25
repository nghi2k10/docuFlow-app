import React, { useRef } from 'react';
import { Upload, FolderOpen } from 'lucide-react';
import { ACCEPTED_EXTENSIONS } from '@/lib/fileTypes';

export default function FilePicker({ onFileSelect, large = false }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const openPicker = () => inputRef.current?.click();

  if (large) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleChange}
        />
        <button
          onClick={openPicker}
          className="w-full flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-slate-300 hover:border-primary hover:bg-blue-50/50 transition-colors active:scale-[0.99] transition-transform"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="text-primary" size={28} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Mở tài liệu</p>
            <p className="text-sm text-muted-foreground mt-1">PDF, Word, Excel, PowerPoint</p>
          </div>
        </button>
      </>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={openPicker}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 active:scale-[0.98] transition-all min-h-[44px]"
      >
        <FolderOpen size={18} />
        Mở File
      </button>
    </>
  );
}