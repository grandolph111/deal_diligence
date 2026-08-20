import type { ReactNode } from 'react';
import './scroll-list.css';

interface ScrollListProps {
  /** Total items in the underlying data set — drives the "showing N of M" line. */
  total: number;
  /** Items actually rendered as children. Defaults to `total`. */
  rendered?: number;
  /** Rows visible before scrolling. */
  cap?: number;
  /** Height of one row, in px, used to derive the scroll viewport. */
  rowHeight?: number;
  /** Singular noun for the count line, e.g. "document". */
  noun?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A list that grows to a fixed number of rows and then scrolls.
 *
 * The point is that it never hides data silently. Deals routinely carry
 * hundreds of documents and entity types, and the previous pattern here was a
 * bare `.slice(0, 12)` — the reader had no way to tell a complete list from a
 * truncated one. Capping the *viewport* rather than the data keeps the page
 * scannable while the count line states exactly what is in the box.
 */
export function ScrollList({
  total,
  rendered,
  cap = 10,
  rowHeight = 40,
  noun = 'item',
  className,
  children,
}: ScrollListProps) {
  const shown = rendered ?? total;
  const scrolls = shown > cap;
  const withheld = total - shown;

  return (
    <div className={`scroll-list${className ? ` ${className}` : ''}`}>
      <div
        className={`scroll-list__viewport${scrolls ? ' scroll-list__viewport--scrolls' : ''}`}
        style={scrolls ? { maxHeight: `${cap * rowHeight}px` } : undefined}
        // Keyboard users must be able to reach the overflow; a scroll container
        // with no focusable child is otherwise a keyboard trap in reverse.
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? 'group' : undefined}
        aria-label={scrolls ? `Scrollable list of ${shown} ${noun}s` : undefined}
      >
        {children}
      </div>
      {(scrolls || withheld > 0) && (
        <p className="scroll-list__count">
          {withheld > 0
            ? `Showing ${shown} of ${total} ${noun}${total === 1 ? '' : 's'}`
            : `${total} ${noun}${total === 1 ? '' : 's'} · scroll for more`}
        </p>
      )}
    </div>
  );
}
