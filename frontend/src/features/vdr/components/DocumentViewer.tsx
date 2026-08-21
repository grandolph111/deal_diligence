import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Search,
  Loader,
  FileText,
  AlertCircle,
  Calendar,
  HardDrive,
  User,
  Folder,
  Lock,
  Info,
  ChevronUp,
  ChevronDown,
  Tags,
  Link2,
  Sparkles,
} from 'lucide-react';
import type { Document, DocumentEntity, DocumentClause, DocumentType, RiskLevel } from '../../../types/api';
import { ENTITY_TYPE_COLORS, CLAUSE_TYPE_COLORS } from '../../../types/api';
import { EntitiesPanel } from './EntitiesPanel';
import { EntityDetailsModal } from './EntityDetailsModal';
import { ClausesPanel } from './ClausesPanel';
import { ClauseDetailsModal } from './ClauseDetailsModal';
import { ClassificationDropdown } from './ClassificationDropdown';
import { RelatedDocumentsPanel } from './RelatedDocumentsPanel';
import { useEntities } from '../hooks/useEntities';
import { useClauses } from '../hooks/useClauses';
import { documentsService } from '../../../api/services/documents.service';

/** Polling interval for document status updates (in ms) */
const PROCESSING_POLL_INTERVAL = 3000;

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Search match tint — deliberately unlike any entity or clause colour. */
const SEARCH_HIGHLIGHT = 'rgba(250, 204, 21, 0.55)';

/** Fallbacks for types the extractor produced that the palette doesn't name. */
const CLAUSE_FALLBACK_COLOR = '#64748B';
const ENTITY_FALLBACK_COLOR = '#7C3AED';

/** #RRGGBB plus an alpha, for tints that let the page show through. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Fold the typography a PDF renders but an extractor flattens — curly quotes,
 * dashes, non-breaking spaces. Strictly one character for one, so offsets into
 * the folded string still index the original.
 */
function fold(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u00A0\u2007\u202F]/g, ' ');
}

/** Whitespace in a PDF text run never matches whitespace in extracted prose. */
function normalize(text: string): string {
  return fold(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

interface Needle {
  text: string;
  color: string;
}

interface Mark {
  start: number;
  end: number;
  color: string;
}

/** Regex-escape, then let any whitespace in the needle match any (or no) gap. */
function needlePattern(text: string): RegExp {
  const escaped = fold(text)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s*');
  return new RegExp(escaped, 'gi');
}

/**
 * Where a clause sits in one page of text.
 *
 * A clause is a paragraph, and the extracted copy of it is never quite the
 * rendered one — leaders like "(a)", a page number mid-paragraph, a hyphen the
 * extractor dropped. So anchor on the ends rather than demanding the whole
 * thing match: find the opening words, find the closing words, band what lies
 * between. A clause that runs onto the next page finds no closing anchor, and
 * a clause continued from the previous one finds no opening anchor; both are
 * banded to the edge of the page instead.
 */
function locateClause(haystack: string, content: string): { start: number; end: number } | null {
  const words = content.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const anchorAt = (tokens: string[], from: number): { start: number; end: number } | null => {
    let pattern: RegExp;
    try {
      pattern = needlePattern(tokens.join(' '));
    } catch {
      return null;
    }
    pattern.lastIndex = from;
    const match = pattern.exec(haystack);
    return match ? { start: match.index, end: match.index + match[0].length } : null;
  };

  // Longest anchor that still matches: enough words to be unique, few enough
  // that one stray character doesn't sink it.
  const tryAnchors = (pick: (n: number) => string[], from: number) => {
    for (const size of [10, 6, 4]) {
      if (words.length < size) continue;
      const hit = anchorAt(pick(size), from);
      if (hit) return hit;
    }
    return words.length < 4 ? anchorAt(words, from) : null;
  };

  const head = tryAnchors((n) => words.slice(0, n), 0);
  const tail = tryAnchors((n) => words.slice(-n), head ? head.end : 0);

  if (head && tail && tail.end > head.start) return { start: head.start, end: tail.end };
  if (head) {
    // No closing anchor: the clause runs off this page, or its tail was
    // mangled. Its own length is the best bound available.
    return { start: head.start, end: Math.min(head.start + content.length, haystack.length) };
  }
  if (tail) return { start: 0, end: tail.end };
  return null;
}

/**
 * Flatten ranges that may overlap each other into a sorted, disjoint list.
 * Two clauses often quote the same paragraph; the earlier one keeps the shared
 * stretch and the later one keeps whatever it adds.
 */
function flatten(ranges: Mark[]): Mark[] {
  const out: Mark[] = [];
  let covered = -1;

  [...ranges]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .forEach((range) => {
      const start = Math.max(range.start, covered);
      if (range.end <= start) return;
      out.push({ ...range, start });
      covered = range.end;
    });

  return out;
}

/**
 * Lay `over` on top of `under`, keeping only the parts of `under` that nothing
 * covers. Both arrive sorted and free of self-overlap; the result is too.
 */
function mergeLayers(under: Mark[], over: Mark[]): Mark[] {
  if (!over.length) return under;

  const out: Mark[] = [];

  under.forEach((band) => {
    let at = band.start;
    for (const cut of over) {
      if (cut.end <= at) continue;
      if (cut.start >= band.end) break;
      if (cut.start > at) {
        out.push({ start: at, end: cut.start, color: band.color });
      }
      at = cut.end;
      if (at >= band.end) break;
    }
    if (at < band.end) {
      out.push({ start: at, end: band.end, color: band.color });
    }
  });

  return [...out, ...over].sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Where each needle lands in one page of text, left to right and without
 * overlaps — the first (and on a tie, the longest) match owns the span.
 */
function findMarks(haystack: string, needles: Needle[]): Mark[] {
  const hits: Mark[] = [];

  needles.forEach(({ text, color }) => {
    let pattern: RegExp;
    try {
      pattern = needlePattern(text);
    } catch {
      return;
    }
    let match = pattern.exec(haystack);
    while (match) {
      if (match[0].length > 0) {
        hits.push({ start: match.index, end: match.index + match[0].length, color });
      } else {
        pattern.lastIndex += 1;
      }
      match = pattern.exec(haystack);
    }
  });

  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: Mark[] = [];
  hits.forEach((hit) => {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) return;
    merged.push(hit);
  });
  return merged;
}

interface DocumentViewerProps {
  document: Document;
  pdfUrl: string | null;
  isViewOnly?: boolean;
  projectId: string;
  onClose: () => void;
  onDownload?: (document: Document) => void;
  canEditClassification?: boolean;
  onDocumentUpdate?: (document: Document) => void;
  onNavigateToDocument?: (documentId: string, documentName: string) => void;
  onAskAI?: (document: Document) => void;
}

type SidebarTab = 'details' | 'entities' | 'clauses' | 'related';

type ZoomLevel = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2 | 3;

const ZOOM_LEVELS: ZoomLevel[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface SearchResult {
  pageIndex: number;
  matchIndex: number;
}

/**
 * Format bytes to human-readable size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date to locale string
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Document Viewer component with PDF.js integration
 * Features: page navigation, zoom, search, metadata panel, download
 */
export function DocumentViewer({
  document,
  pdfUrl,
  isViewOnly = false,
  projectId,
  onClose,
  onDownload,
  canEditClassification = false,
  onDocumentUpdate,
  onNavigateToDocument,
  onAskAI,
}: DocumentViewerProps) {
  // Local document state for classification updates
  const [currentDocument, setCurrentDocument] = useState<Document>(document);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // pdf.js only renders PDFs. Word docs (.docx) are rendered to HTML client-side
  // via mammoth; other types (.xlsx/…) fall back to a "download to view" card
  // instead of a misleading PDF error. Extraction/analysis is unaffected.
  const [previewUnsupported, setPreviewUnsupported] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);

  // Zoom state
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [rotation, setRotation] = useState(0);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('details');
  const [showEntityDetails, setShowEntityDetails] = useState(false);
  const [showClauseDetails, setShowClauseDetails] = useState(false);

  // Entities state
  const {
    entities,
    loading: entitiesLoading,
    error: entitiesError,
    selectedEntity,
    highlightEnabled,
    highlightedTypes,
    selectEntity,
    toggleHighlight,
    toggleTypeHighlight,
    refresh: refreshEntities,
  } = useEntities({
    projectId,
    documentId: document.id,
    autoFetch: true,
  });

  // Clauses state
  const {
    clauses,
    loading: clausesLoading,
    error: clausesError,
    selectedClause,
    highlightEnabled: clauseHighlightEnabled,
    highlightedTypes: clauseHighlightedTypes,
    selectClause,
    toggleHighlight: toggleClauseHighlight,
    toggleTypeHighlight: toggleClauseTypeHighlight,
    verifyClause,
    rejectClause,
    fetchClauses: refreshClauses,
  } = useClauses({
    projectId,
    documentId: document.id,
    autoFetch: true,
  });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  /** The spans of the current text layer, with the string each one started as. */
  const textItemsRef = useRef<{ el: HTMLSpanElement; str: string }[]>([]);
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load PDF document
  useEffect(() => {
    if (!pdfUrl) {
      setLoading(false);
      setError('Unable to load PDF. Please try again or refresh the page.');
      return;
    }

    // Route by file type: PDF → pdf.js, Word → mammoth (docx→HTML), else → download card.
    const mime = (currentDocument.mimeType ?? '').toLowerCase();
    const isPdf = mime.includes('pdf') || /\.pdf(\?|$)/i.test(pdfUrl);
    const isWord =
      mime.includes('wordprocessingml') || mime.includes('msword') || /\.docx?(\?|$)/i.test(pdfUrl);

    // Word documents: fetch bytes and render to HTML in the browser.
    if (!isPdf && isWord) {
      let cancelledDocx = false;
      (async () => {
        try {
          setLoading(true);
          setError(null);
          setPreviewUnsupported(false);
          setDocxHtml(null);
          const resp = await fetch(pdfUrl as string);
          if (!resp.ok) throw new Error(`fetch ${resp.status}`);
          const buf = await resp.arrayBuffer();
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (cancelledDocx) return;
          setDocxHtml(result.value || '<p>(empty document)</p>');
        } catch {
          if (cancelledDocx) return;
          // Rendering failed — offer the download card rather than a hard error.
          setPreviewUnsupported(true);
        } finally {
          if (!cancelledDocx) setLoading(false);
        }
      })();
      return () => {
        cancelledDocx = true;
      };
    }

    // Any other non-PDF type: graceful download fallback.
    if (!isPdf) {
      setLoading(false);
      setError(null);
      setPreviewUnsupported(true);
      return;
    }

    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);
        setPreviewUnsupported(false);
        setDocxHtml(null);

        const loadingTask = pdfjsLib.getDocument(pdfUrl as string);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdfDoc!.getPage(currentPage);

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate scale based on zoom and device pixel ratio
        const baseScale = zoom;
        const pixelRatio = window.devicePixelRatio || 1;
        const scale = baseScale * pixelRatio;

        const viewport = page.getViewport({ scale, rotation });

        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = `${viewport.width / pixelRatio}px`;
        canvas.style.height = `${viewport.height / pixelRatio}px`;

        // Render PDF page
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        // Render text layer for search highlighting
        if (textLayerRef.current) {
          // Size the layer in the same units its children use — device pixels —
          // and let the transform bring it down to the canvas's CSS size. Sizing
          // it in CSS pixels instead leaves a box half as wide as the text it
          // holds, and `overflow: hidden` clips in the untransformed box: on a
          // retina screen every run past the halfway mark of the page simply
          // vanished, highlights included.
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;
          textLayerRef.current.style.transform = `scale(${1 / pixelRatio})`;
          textLayerRef.current.style.transformOrigin = 'top left';

          const textContent = await page.getTextContent();

          if (cancelled) return;

          // Create text layer elements.
          //
          // viewport.transform already flips the PDF's bottom-up axis, so tx[5]
          // is the baseline measured from the top; the box starts one font
          // height above it. Getting this wrong is invisible while the layer is
          // only there to be selected, and glaring the moment it carries a
          // highlight.
          textItemsRef.current = [];
          const placed: { el: HTMLSpanElement; width: number }[] = [];
          textContent.items.forEach((item) => {
            if ('str' in item && item.str) {
              const div = window.document.createElement('span');
              div.textContent = item.str;
              div.style.position = 'absolute';

              const tx = pdfjsLib.Util.transform(
                viewport.transform,
                item.transform
              );
              const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(tx[3]);

              div.style.left = `${tx[4]}px`;
              div.style.top = `${tx[5] - fontHeight}px`;
              div.style.fontSize = `${fontHeight}px`;
              // Contracts are set in a serif face; a serif substitute keeps the
              // per-character widths — and so the highlights inside a run —
              // closer to what the canvas drew.
              div.style.fontFamily = "'Times New Roman', Times, serif";
              div.style.color = 'transparent';
              div.style.userSelect = 'text';

              textLayerRef.current?.appendChild(div);
              textItemsRef.current.push({ el: div, str: item.str });
              placed.push({ el: div, width: item.width * scale });
            }
          });

          // Fit each run to the width the canvas actually drew — the layer uses
          // a substitute font, so its natural width differs.
          //
          // Absorb the difference into the word gaps rather than scaling the
          // glyphs. Justified PDF text stretches the spaces alone, so scaleX
          // makes the run's ends line up while everything in between slides —
          // which is exactly where a highlight sits.
          placed.forEach(({ el, width }) => {
            const natural = el.offsetWidth;
            if (!(natural > 0) || !(width > 0)) return;
            const gaps = (el.textContent?.match(/ /g) ?? []).length;
            const delta = width - natural;
            if (gaps > 0 && Math.abs(delta) < natural * 0.5) {
              el.style.wordSpacing = `${delta / gaps}px`;
            } else {
              el.style.transform = `scaleX(${width / natural})`;
            }
          });

          // Highlights are painted separately, off this version stamp.
          setTextLayerVersion((version) => version + 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to render page');
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, zoom, rotation]);

  /**
   * Paint search, entity, and clause highlights onto the text layer.
   *
   * Deliberately separate from page rendering: highlights change far more often
   * than the raster does — every search keystroke, every legend toggle — and
   * re-rasterising a page to tint a word is slow for no gain.
   *
   * Entities and the search term are short strings that sit *inside* a text
   * run, so they highlight the matched substring. A clause is a paragraph, so
   * the containment runs the other way: the run sits inside the clause, and the
   * whole run gets the band.
   */
  useEffect(() => {
    const items = textItemsRef.current;
    if (!items.length) return;

    const onThisPage = (pageNumber: number | null) =>
      pageNumber == null || pageNumber === currentPage;

    const needles: Needle[] = [];
    const query = searchQuery.trim();
    if (query) {
      needles.push({ text: query, color: SEARCH_HIGHLIGHT });
    }

    if (highlightEnabled) {
      entities.forEach((entity) => {
        const text = entity.text.trim();
        if (text.length < 2) return;
        if (!onThisPage(entity.pageNumber)) return;
        if (!highlightedTypes.has(entity.entityType)) return;
        needles.push({
          text,
          color: withAlpha(
            ENTITY_TYPE_COLORS[entity.entityType] ?? ENTITY_FALLBACK_COLOR,
            selectedEntity?.id === entity.id ? 0.55 : 0.3
          ),
        });
      });
    }

    // An empty legend selection means "every type" — the clause set starts empty,
    // so a bare master toggle would otherwise light up nothing.
    // Match against the page as one string, not run by run: pdf.js splits a
    // line wherever the font or position shifts, so "Babcock & Wilcox" routinely
    // arrives as three runs and would never match on its own.
    let pageText = '';
    const spans = items.map(({ el, str }) => {
      const span = { el, str, start: pageText.length, end: pageText.length + str.length };
      pageText += str;
      return span;
    });

    // Fold both sides: the page renders curly quotes and en dashes where the
    // extracted text has plain ones. fold() is character-for-character, so a
    // match's offsets still address the original runs.
    const haystack = fold(pageText);

    const allClauseTypes = clauseHighlightedTypes.size === 0;
    const bands = clauseHighlightEnabled
      ? clauses
          .filter(
            (clause) =>
              !clause.isRejected &&
              onThisPage(clause.pageNumber) &&
              (allClauseTypes ||
                (clause.clauseType != null && clauseHighlightedTypes.has(clause.clauseType)))
          )
          .flatMap((clause) => {
            const content = normalize(clause.content);
            if (!content) return [];
            const at = locateClause(haystack, content);
            if (!at) return [];
            return [
              {
                ...at,
                color: withAlpha(
                  (clause.clauseType && CLAUSE_TYPE_COLORS[clause.clauseType]) ||
                    CLAUSE_FALLBACK_COLOR,
                  selectedClause?.id === clause.id ? 0.42 : 0.18
                ),
              },
            ];
          })
      : [];

    // A run can carry a clause band and an entity mark at once, and one text
    // node can only have one background. The mark is the finer statement, so it
    // wins the overlap and the band keeps what is left.
    const marks = needles.length ? findMarks(haystack, needles) : [];
    const painted = mergeLayers(flatten(bands), marks);

    let cursor = 0;
    spans.forEach((span) => {
      // Reset first: this pass owns the whole visual state of the run.
      span.el.textContent = span.str;

      // Painted ranges are sorted, so walk them alongside the runs rather than
      // rescanning the page for each one.
      while (cursor < painted.length && painted[cursor].end <= span.start) cursor += 1;

      const local: Mark[] = [];
      for (let i = cursor; i < painted.length && painted[i].start < span.end; i += 1) {
        local.push({
          start: Math.max(painted[i].start, span.start) - span.start,
          end: Math.min(painted[i].end, span.end) - span.start,
          color: painted[i].color,
        });
      }
      if (!local.length) return;

      span.el.textContent = '';
      let at = 0;
      local.forEach(({ start: from, end: to, color }) => {
        if (from > at) {
          span.el.appendChild(window.document.createTextNode(span.str.slice(at, from)));
        }
        const mark = window.document.createElement('span');
        mark.className = 'entity-highlight';
        mark.style.backgroundColor = color;
        mark.textContent = span.str.slice(from, to);
        span.el.appendChild(mark);
        at = to;
      });
      if (at < span.str.length) {
        span.el.appendChild(window.document.createTextNode(span.str.slice(at)));
      }
    });
  }, [
    textLayerVersion,
    currentPage,
    searchQuery,
    entities,
    highlightEnabled,
    highlightedTypes,
    selectedEntity,
    clauses,
    clauseHighlightEnabled,
    clauseHighlightedTypes,
    selectedClause,
  ]);

  // Poll for document status updates when processing
  useEffect(() => {
    // Only poll if document is still processing
    const isProcessing =
      currentDocument.processingStatus === 'PROCESSING' ||
      currentDocument.processingStatus === 'PENDING';

    if (!isProcessing) {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const updatedDoc = await documentsService.getDocument(projectId, document.id);

        if (cancelled) return;

        // Update local state
        setCurrentDocument(updatedDoc);

        // If processing completed, refresh entities and clauses
        if (updatedDoc.processingStatus === 'COMPLETE') {
          // Notify parent of update
          onDocumentUpdate?.(updatedDoc);

          // Refresh entities and clauses data
          await Promise.all([refreshEntities(), refreshClauses()]);
        }
      } catch (err) {
        // Polling error - silently ignore and try again
        if (!cancelled) {
          console.warn('Failed to poll document status:', err);
        }
      }
    };

    // Start polling
    const intervalId = setInterval(pollStatus, PROCESSING_POLL_INTERVAL);

    // Also do an immediate check
    pollStatus();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    currentDocument.processingStatus,
    projectId,
    document.id,
    onDocumentUpdate,
    refreshEntities,
    refreshClauses,
  ]);

  // Page navigation
  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
      }
    },
    [totalPages]
  );

  const goToPreviousPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[currentIndex + 1]);
    }
  }, [zoom]);

  const zoomOut = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex > 0) {
      setZoom(ZOOM_LEVELS[currentIndex - 1]);
    }
  }, [zoom]);

  // Rotation
  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Search functionality
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const results: SearchResult[] = [];

    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');

        let matchIndex = 0;
        let position = text.toLowerCase().indexOf(searchQuery.toLowerCase());
        while (position !== -1) {
          results.push({
            pageIndex: pageNum - 1,
            matchIndex,
          });
          matchIndex++;
          position = text.toLowerCase().indexOf(
            searchQuery.toLowerCase(),
            position + 1
          );
        }
      }
    } catch {
      // Search failed silently
    }

    setSearchResults(results);
    setCurrentSearchIndex(0);
    setSearching(false);

    // Navigate to first result
    if (results.length > 0) {
      setCurrentPage(results[0].pageIndex + 1);
    }
  }, [pdfDoc, searchQuery]);

  const goToNextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    setCurrentPage(searchResults[nextIndex].pageIndex + 1);
  }, [searchResults, currentSearchIndex]);

  const goToPreviousSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    setCurrentPage(searchResults[prevIndex].pageIndex + 1);
  }, [searchResults, currentSearchIndex]);

  // Toggle search panel
  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      return !prev;
    });
  }, []);

  // Handle download
  const handleDownload = useCallback(() => {
    if (onDownload && !isViewOnly) {
      onDownload(document);
    }
  }, [document, isViewOnly, onDownload]);

  // Handle Ask AI
  const handleAskAI = useCallback(() => {
    if (onAskAI) {
      onAskAI(document);
    }
  }, [document, onAskAI]);

  // Handle entity selection and show details
  const handleSelectEntity = useCallback(
    (entity: DocumentEntity | null) => {
      selectEntity(entity);
      if (entity) {
        setShowEntityDetails(true);
      }
    },
    [selectEntity]
  );

  // Navigate to page from entity
  const handleNavigateToPage = useCallback(
    (pageNumber: number) => {
      goToPage(pageNumber);
    },
    [goToPage]
  );

  // Handle clause selection and show details
  const handleSelectClause = useCallback(
    (clause: DocumentClause | null) => {
      selectClause(clause);
      if (clause) {
        setShowClauseDetails(true);
      }
    },
    [selectClause]
  );

  // Handle clause verification
  const handleVerifyClause = useCallback(
    async (note?: string) => {
      if (selectedClause) {
        try {
          await verifyClause(selectedClause.id, note);
        } catch (err) {
          console.error('Failed to verify clause:', err);
        }
      }
    },
    [selectedClause, verifyClause]
  );

  // Handle clause rejection
  const handleRejectClause = useCallback(
    async (note?: string) => {
      if (selectedClause) {
        try {
          await rejectClause(selectedClause.id, note);
        } catch (err) {
          console.error('Failed to reject clause:', err);
        }
      }
    },
    [selectedClause, rejectClause]
  );

  // Handle classification change
  const handleClassificationChange = useCallback(
    (documentType: DocumentType | null, riskLevel: RiskLevel | null) => {
      const updatedDoc = {
        ...currentDocument,
        documentType,
        riskLevel,
      };
      setCurrentDocument(updatedDoc);
      onDocumentUpdate?.(updatedDoc);
    },
    [currentDocument, onDocumentUpdate]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle if not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        // Handle search input enter
        if (e.key === 'Enter' && showSearch) {
          handleSearch();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPreviousPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNextPage();
          break;
        case 'Escape':
          if (showSearch) {
            setShowSearch(false);
          } else {
            onClose();
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleSearch();
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    goToPreviousPage,
    goToNextPage,
    onClose,
    zoomIn,
    zoomOut,
    showSearch,
    toggleSearch,
    handleSearch,
  ]);

  return (
    <div className="document-viewer-overlay">
      <div className="document-viewer">
        {/* Header / Toolbar */}
        <div className="document-viewer-header">
          <div className="document-viewer-title">
            <button
              className="icon-button"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
            <FileText size={20} className="document-viewer-icon" />
            <span className="document-viewer-name">{document.name}</span>
            {isViewOnly && (
              <span className="view-only-badge">
                <Lock size={12} />
                View Only
              </span>
            )}
          </div>

          <div className="document-viewer-controls">
            {/* Page navigation */}
            <div className="page-navigation">
              <button
                className="icon-button"
                onClick={goToPreviousPage}
                disabled={currentPage <= 1 || loading}
                title="Previous page (Left arrow)"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="page-indicator">
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                  min={1}
                  max={totalPages}
                  disabled={loading}
                  className="page-input"
                />
                <span className="page-separator">/</span>
                <span>{totalPages}</span>
              </span>
              <button
                className="icon-button"
                onClick={goToNextPage}
                disabled={currentPage >= totalPages || loading}
                title="Next page (Right arrow)"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Divider */}
            <div className="toolbar-divider" />

            {/* Zoom controls */}
            <div className="zoom-controls">
              <button
                className="icon-button"
                onClick={zoomOut}
                disabled={zoom === ZOOM_LEVELS[0] || loading}
                title="Zoom out (-)"
              >
                <ZoomOut size={18} />
              </button>
              <span className="zoom-level">{Math.round(zoom * 100)}%</span>
              <button
                className="icon-button"
                onClick={zoomIn}
                disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || loading}
                title="Zoom in (+)"
              >
                <ZoomIn size={18} />
              </button>
            </div>

            {/* Divider */}
            <div className="toolbar-divider" />

            {/* Rotate */}
            <button
              className="icon-button"
              onClick={rotate}
              disabled={loading}
              title="Rotate"
            >
              <RotateCw size={18} />
            </button>

            {/* Search */}
            <button
              className={`icon-button ${showSearch ? 'active' : ''}`}
              onClick={toggleSearch}
              disabled={loading}
              title="Search (Ctrl+F)"
            >
              <Search size={18} />
            </button>

            {/* Download (if not view-only) */}
            {!isViewOnly && onDownload && (
              <button
                className="icon-button"
                onClick={handleDownload}
                disabled={loading}
                title="Download"
              >
                <Download size={18} />
              </button>
            )}

            {/* Ask AI */}
            {onAskAI && (
              <button
                className="icon-button"
                onClick={handleAskAI}
                disabled={loading}
                title="Ask AI about this document"
              >
                <Sparkles size={18} />
              </button>
            )}

            {/* Entity highlighting toggle */}
            {entities.length > 0 && (
              <button
                className={`icon-button ${highlightEnabled ? 'active' : ''}`}
                onClick={toggleHighlight}
                title={highlightEnabled ? 'Hide entity highlights' : 'Show entity highlights'}
              >
                <Tags size={18} />
              </button>
            )}

            {/* Toggle sidebar */}
            <button
              className={`icon-button ${showSidebar ? 'active' : ''}`}
              onClick={() => setShowSidebar(!showSidebar)}
              title="Toggle details"
            >
              <Info size={18} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="document-viewer-search">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search in document..."
                className="search-input"
              />
              {searching && <Loader size={16} className="spinning" />}
            </div>
            {searchResults.length > 0 && (
              <div className="search-results-nav">
                <span className="search-results-count">
                  {currentSearchIndex + 1} of {searchResults.length}
                </span>
                <button
                  className="icon-button small"
                  onClick={goToPreviousSearchResult}
                  title="Previous match"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="icon-button small"
                  onClick={goToNextSearchResult}
                  title="Next match"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
            {searchQuery && searchResults.length === 0 && !searching && (
              <span className="search-no-results">No results found</span>
            )}
          </div>
        )}

        {/* Main content area */}
        <div className="document-viewer-content">
          {/* PDF canvas container */}
          <div className="document-viewer-canvas-container" ref={containerRef}>
            {loading && (
              <div className="document-viewer-loading">
                <Loader size={32} className="spinning" />
                <p>Loading document...</p>
              </div>
            )}

            {error && !loading && (
              <div className="document-viewer-error">
                <AlertCircle size={48} />
                <h3>Failed to load document</h3>
                <p>{error}</p>
              </div>
            )}

            {previewUnsupported && !loading && (
              <div className="document-viewer-error">
                <FileText size={48} />
                <h3>Inline preview not available</h3>
                <p>
                  {(currentDocument.mimeType || 'This file type')} can&rsquo;t be previewed here.
                  The extracted analysis — clauses, entities, and risk — is in the panel on the right.
                </p>
                {pdfUrl && (
                  <a className="btn-secondary" href={pdfUrl} target="_blank" rel="noreferrer" download={currentDocument.name}>
                    Download to view
                  </a>
                )}
              </div>
            )}

            {!loading && !error && pdfDoc && (
              <div className="pdf-page-wrapper">
                <canvas ref={canvasRef} className="pdf-canvas" />
                <div ref={textLayerRef} className="pdf-text-layer" />
              </div>
            )}

            {docxHtml && !loading && (
              <div className="docx-preview-page">
                {/* mammoth output is docx-derived HTML (no scripts) */}
                <div className="docx-preview-body" dangerouslySetInnerHTML={{ __html: docxHtml }} />
              </div>
            )}
          </div>

          {/* Metadata sidebar */}
          {showSidebar && (
            <aside className="document-viewer-sidebar">
              {/* Sidebar tabs */}
              <div className="viewer-sidebar-tabs">
                <button
                  className={`viewer-sidebar-tab ${sidebarTab === 'details' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('details')}
                >
                  <Info size={14} />
                  Details
                </button>
                <button
                  className={`viewer-sidebar-tab ${sidebarTab === 'entities' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('entities')}
                >
                  <Tags size={14} />
                  Entities
                  {entities.length > 0 && (
                    <span className="tab-badge">{entities.length}</span>
                  )}
                </button>
                <button
                  className={`viewer-sidebar-tab ${sidebarTab === 'clauses' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('clauses')}
                >
                  <FileText size={14} />
                  Clauses
                  {clauses.length > 0 && (
                    <span className="tab-badge">{clauses.length}</span>
                  )}
                </button>
                <button
                  className={`viewer-sidebar-tab ${sidebarTab === 'related' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('related')}
                >
                  <Link2 size={14} />
                  Related
                </button>
              </div>

              {/* Details tab content */}
              {sidebarTab === 'details' && (
                <>
                  {/* Classification Section */}
                  <div className="metadata-section">
                    <h4>Classification</h4>
                    <ClassificationDropdown
                      projectId={projectId}
                      document={currentDocument}
                      canEdit={canEditClassification}
                      onClassificationChange={handleClassificationChange}
                    />
                  </div>

                  <div className="metadata-section">
                    <h4>Document Info</h4>
                    <div className="metadata-item">
                      <FileText size={16} />
                      <div>
                        <label>Name</label>
                        <span>{currentDocument.name}</span>
                      </div>
                    </div>

                    <div className="metadata-item">
                      <HardDrive size={16} />
                      <div>
                        <label>Size</label>
                        <span>{formatFileSize(currentDocument.sizeBytes)}</span>
                      </div>
                    </div>

                    <div className="metadata-item">
                      <FileText size={16} />
                      <div>
                        <label>File Type</label>
                        <span>{currentDocument.mimeType}</span>
                      </div>
                    </div>

                    {currentDocument.pageCount && (
                      <div className="metadata-item">
                        <FileText size={16} />
                        <div>
                          <label>Pages</label>
                          <span>{currentDocument.pageCount}</span>
                        </div>
                      </div>
                    )}

                    <div className="metadata-item">
                      <Calendar size={16} />
                      <div>
                        <label>Uploaded</label>
                        <span>{formatDate(currentDocument.createdAt)}</span>
                      </div>
                    </div>

                    {currentDocument.uploadedBy && (
                      <div className="metadata-item">
                        <User size={16} />
                        <div>
                          <label>Uploaded by</label>
                          <span>
                            {currentDocument.uploadedBy.name || currentDocument.uploadedBy.email}
                          </span>
                        </div>
                      </div>
                    )}

                    {currentDocument.folder && (
                      <div className="metadata-item">
                        <Folder size={16} />
                        <div>
                          <label>Folder</label>
                          <span>{currentDocument.folder.name}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="metadata-section">
                    <h4>Processing Status</h4>
                    <div className={`processing-status status-${currentDocument.processingStatus.toLowerCase()}`}>
                      {currentDocument.processingStatus === 'PROCESSING' && (
                        <Loader size={14} className="spinning" />
                      )}
                      {currentDocument.processingStatus === 'COMPLETE' && (
                        <span className="status-dot complete" />
                      )}
                      {currentDocument.processingStatus === 'FAILED' && (
                        <AlertCircle size={14} />
                      )}
                      {currentDocument.processingStatus === 'PENDING' && (
                        <span className="status-dot pending" />
                      )}
                      <span>{currentDocument.processingStatus}</span>
                    </div>
                  </div>

                  {isViewOnly && (
                    <div className="view-only-notice">
                      <Lock size={16} />
                      <p>This document is view-only. Download is disabled.</p>
                    </div>
                  )}
                </>
              )}

              {/* Entities tab content */}
              {sidebarTab === 'entities' && (
                <EntitiesPanel
                  entities={entities}
                  loading={entitiesLoading}
                  error={entitiesError}
                  highlightEnabled={highlightEnabled}
                  highlightedTypes={highlightedTypes}
                  selectedEntity={selectedEntity}
                  onToggleHighlight={toggleHighlight}
                  onToggleTypeHighlight={toggleTypeHighlight}
                  onSelectEntity={handleSelectEntity}
                  onNavigateToPage={handleNavigateToPage}
                />
              )}

              {/* Clauses tab content */}
              {sidebarTab === 'clauses' && (
                <ClausesPanel
                  clauses={clauses}
                  loading={clausesLoading}
                  error={clausesError}
                  highlightEnabled={clauseHighlightEnabled}
                  highlightedTypes={clauseHighlightedTypes}
                  selectedClause={selectedClause}
                  onToggleHighlight={toggleClauseHighlight}
                  onToggleTypeHighlight={toggleClauseTypeHighlight}
                  onSelectClause={handleSelectClause}
                  onNavigateToPage={handleNavigateToPage}
                />
              )}

              {/* Related tab content */}
              {sidebarTab === 'related' && (
                <RelatedDocumentsPanel
                  projectId={projectId}
                  documentId={document.id}
                  documentName={document.name}
                  onNavigateToDocument={onNavigateToDocument}
                />
              )}
            </aside>
          )}
        </div>

        {/* Entity details modal */}
        {showEntityDetails && selectedEntity && (
          <EntityDetailsModal
            entity={selectedEntity}
            onClose={() => {
              setShowEntityDetails(false);
              selectEntity(null);
            }}
            onNavigateToPage={handleNavigateToPage}
          />
        )}

        {/* Clause details modal */}
        {showClauseDetails && selectedClause && (
          <ClauseDetailsModal
            clause={selectedClause}
            onClose={() => {
              setShowClauseDetails(false);
              selectClause(null);
            }}
            onNavigateToPage={handleNavigateToPage}
            onVerify={handleVerifyClause}
            onReject={handleRejectClause}
          />
        )}
      </div>
    </div>
  );
}
