"use client";

import { useState, useCallback } from "react";

function fmt(n: number, decimals = 1): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface EditableCellProps {
  value: number | null;
  sprintId: string;
  field: "commitmentSP" | "completedSP";
  canEdit: boolean;
  onSaved: () => void;
}

export function EditableCell({
  value,
  sprintId,
  field,
  canEdit,
  onSaved,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback(() => {
    if (!canEdit) return;
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
  }, [canEdit, value]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const numVal = draft.trim() === "" ? null : Number(draft);
    if (numVal !== null && (isNaN(numVal) || numVal < 0)) {
      setSaving(false);
      return;
    }
    try {
      await fetch(`/api/sprints/${sprintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: numVal }),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [draft, sprintId, field, onSaved]);

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        step="1"
        className="w-16 rounded bg-slate-800 border border-slate-600 text-right text-xs px-1.5 py-0.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#E31837]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        autoFocus
        disabled={saving}
      />
    );
  }

  if (!canEdit) {
    return (
      <span className="text-slate-400 tabular-nums">
        {value !== null ? fmt(value, 0) : <span className="text-slate-600">&mdash;</span>}
      </span>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="text-slate-300 tabular-nums hover:text-slate-100 hover:underline decoration-dotted cursor-pointer"
      title={`Click to edit ${field === "commitmentSP" ? "commitment" : "completed"} SP`}
    >
      {value !== null ? fmt(value, 0) : <span className="text-slate-600">—</span>}
    </button>
  );
}
