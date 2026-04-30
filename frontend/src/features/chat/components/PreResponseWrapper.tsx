import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface PreResponseWrapperProps {
  isStreaming: boolean;
  children?: React.ReactNode;
}

/**
 * Collapsible disclosure wrapper shown while the AI is generating a response.
 * Displays "Working…" with a bouncing-dot animation while streaming, then
 * collapses to "Completed" once the response arrives. Users can toggle it open
 * to see the inner content (tool steps, reasoning) at any time.
 */
export function PreResponseWrapper({ isStreaming, children }: PreResponseWrapperProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [userToggled, setUserToggled] = useState(false);
  const hasStreamedRef = useRef(false);

  useEffect(() => {
    if (isStreaming) hasStreamedRef.current = true;
    if (userToggled) return;
    // Auto-collapse once streaming finishes so the response feels clean
    if (!isStreaming && hasStreamedRef.current) {
      setIsOpen(false);
    }
  }, [isStreaming, userToggled]);

  const label = isStreaming ? 'Working' : 'Completed';

  return (
    <div className="pre-response-wrapper">
      <button
        type="button"
        className="pre-response-toggle"
        onClick={() => {
          setUserToggled(true);
          setIsOpen((v) => !v);
        }}
      >
        <span className="pre-response-label">
          {label}
          {isStreaming && (
            <span className="pre-response-dots" aria-hidden="true">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`pre-response-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && children && (
        <div className="pre-response-body">{children}</div>
      )}
    </div>
  );
}
