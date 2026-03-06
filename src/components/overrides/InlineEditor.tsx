"use client";

import { useState, useCallback } from "react";
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
  const applyOverride = useOverrideStore((s) => s.applyOverride);

  // Callback ref: focuses and selects the input as soon as it mounts
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
      node.select();
    }
  }, []);

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
          className="h-8 w-32 text-sm rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] text-white px-2 focus:border-white focus:ring-1 focus:ring-white focus:outline-none"
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
      className="group flex items-center gap-1.5 text-lg font-semibold text-white hover:text-[#a8a8a8] transition-colors cursor-pointer"
      aria-label={`Click to edit: ${formattedValue}`}
      title="Click to override this value"
    >
      {formattedValue}
      <Pencil className="h-3 w-3 text-[#707070] opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
