import React from 'react';
import { getFileType } from '@/lib/fileTypes';
import { FileText, Sheet, Presentation, File } from 'lucide-react';

const ICON_MAP = {
  FileText,
  Sheet,
  Presentation,
  File,
};

export default function FileIcon({ filename, size = 40 }) {
  const type = getFileType(filename);
  const Icon = ICON_MAP[type.icon] || File;
  const iconSize = Math.floor(size * 0.5);

  return (
    <div
      className="flex items-center justify-center rounded-xl flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: type.bg, color: type.color }}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </div>
  );
}