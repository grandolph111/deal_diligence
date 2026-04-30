import { useRef, useState } from 'react';

interface RenameableTitleProps {
  value: string;
  onSave: (newValue: string) => void;
  tag?: 'h1' | 'h2' | 'h3';
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export function RenameableTitle({
  value,
  onSave,
  tag: Tag = 'h1',
  className,
  style,
  placeholder = 'Untitled',
}: RenameableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const caretPos = useRef<number | null>(null);
  const escaped = useRef(false);

  function startEditing(e: React.MouseEvent) {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
    const range = !caret ? doc.caretRangeFromPoint?.(e.clientX, e.clientY) : null;
    caretPos.current = caret ? caret.offset : range ? range.startOffset : null;
    escaped.current = false;
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    if (escaped.current) {
      escaped.current = false;
      return;
    }
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
  }

  if (editing) {
    return (
      <input
        ref={(el) => {
          if (!el) return;
          el.focus();
          if (caretPos.current !== null) {
            el.setSelectionRange(caretPos.current, caretPos.current);
          }
        }}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            escaped.current = true;
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={`renameable-title-input ${className ?? ''}`}
        style={{ ...style, width: `${Math.max(draft.length, placeholder.length) + 1}ch` }}
      />
    );
  }

  return (
    <Tag
      className={`renameable-title ${className ?? ''}`}
      style={{ ...style, cursor: 'text' }}
      onClick={startEditing}
      title="Click to rename"
    >
      {value || placeholder}
    </Tag>
  );
}
