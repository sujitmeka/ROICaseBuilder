"use client";

import { useState, useRef, useEffect } from "react";
import { useOverrideStore } from "../../stores/override-store";
import { Pencil } from "lucide-react";

interface Props {
  entryId: string;
  currentValue: number;
  formattedValue: string;
  isOverridden: boolean;
}

export function InlineEditor({
  entryId,
  currentValue,
  formattedValue,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(currentValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const applyOverride = useOverrideStore((s) => s.applyOverride);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleConfirm = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue) && numValue !== currentValue) {
      applyOverride(entryId, numValue, currentValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(String(currentValue));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") handleCancel();
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 w-32 text-sm rounded border border-gray-300 px-2"
          aria-label={`Edit value for ${entryId}`}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setEditValue(String(currentValue));
        setIsEditing(true);
      }}
      className="group flex items-center gap-1.5 text-lg font-semibold hover:text-blue-600 transition-colors cursor-pointer"
      aria-label={`Click to edit: ${formattedValue}`}
      title="Click to override this value"
    >
      {formattedValue}
      <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
