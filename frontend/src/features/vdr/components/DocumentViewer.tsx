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
} from 'lucide-react';
import type { Document } from '../../../types/api';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface DocumentViewerProps {
  document: Document;
  pdfUrl: string | null;
  isViewOnly?: boolean;
  onClose: () => void;
  onDownload?: (document: Document) => void;
}

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
  onClose,
  onDownload,
}: DocumentViewerProps) {
  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load PDF document
  useEffect(() => {
    if (!pdfUrl) {
      setLoading(false);
      setError('Unable to load PDF. Please try again or refresh the page.');
      return;
    }

    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

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
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${viewport.width / pixelRatio}px`;
          textLayerRef.current.style.height = `${viewport.height / pixelRatio}px`;
          textLayerRef.current.style.transform = `scale(${1 / pixelRatio})`;
          textLayerRef.current.style.transformOrigin = 'top left';

          const textContent = await page.getTextContent();

          if (cancelled) return;

          // Create text layer elements
          textContent.items.forEach((item) => {
            if ('str' in item && item.str) {
              const div = window.document.createElement('span');
              div.textContent = item.str;
              div.style.position = 'absolute';

              const tx = pdfjsLib.Util.transform(
                viewport.transform,
                item.transform
              );

              div.style.left = `${tx[4]}px`;
              div.style.top = `${viewport.height - tx[5]}px`;
              div.style.fontSize = `${Math.abs(tx[3])}px`;
              div.style.fontFamily = 'sans-serif';
              div.style.color = 'transparent';
              div.style.userSelect = 'text';

              // Highlight search matches
              if (searchQuery && item.str.toLowerCase().includes(searchQuery.toLowerCase())) {
                div.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
              }

              textLayerRef.current?.appendChild(div);
            }
          });
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
  }, [pdfDoc, currentPage, zoom, rotation, searchQuery]);

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

            {!loading && !error && pdfDoc && (
              <div className="pdf-page-wrapper">
                <canvas ref={canvasRef} className="pdf-canvas" />
                <div ref={textLayerRef} className="pdf-text-layer" />
              </div>
            )}

            {/* Floating page navigation - always visible when multi-page */}
            {!loading && !error && pdfDoc && totalPages > 1 && (
              <div className="floating-nav-container">
                <button
                  className="floating-nav-btn floating-nav-prev"
                  onClick={goToPreviousPage}
                  disabled={currentPage <= 1}
                  title="Previous page (Left arrow)"
                  aria-label="Previous page"
                >
                  <ChevronUp size={28} />
                </button>

                <div className="floating-page-indicator">
                  Page {currentPage} of {totalPages}
                </div>

                <button
                  className="floating-nav-btn floating-nav-next"
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages}
                  title="Next page (Right arrow)"
                  aria-label="Next page"
                >
                  <ChevronDown size={28} />
                </button>
              </div>
            )}
          </div>

          {/* Metadata sidebar */}
          {showSidebar && (
            <aside className="document-viewer-sidebar">
              <h3>Document Details</h3>

              <div className="metadata-section">
                <div className="metadata-item">
                  <FileText size={16} />
                  <div>
                    <label>Name</label>
                    <span>{document.name}</span>
                  </div>
                </div>

                <div className="metadata-item">
                  <HardDrive size={16} />
                  <div>
                    <label>Size</label>
                    <span>{formatFileSize(document.sizeBytes)}</span>
                  </div>
                </div>

                <div className="metadata-item">
                  <FileText size={16} />
                  <div>
                    <label>Type</label>
                    <span>{document.mimeType}</span>
                  </div>
                </div>

                {document.pageCount && (
                  <div className="metadata-item">
                    <FileText size={16} />
                    <div>
                      <label>Pages</label>
                      <span>{document.pageCount}</span>
                    </div>
                  </div>
                )}

                <div className="metadata-item">
                  <Calendar size={16} />
                  <div>
                    <label>Uploaded</label>
                    <span>{formatDate(document.createdAt)}</span>
                  </div>
                </div>

                {document.uploadedBy && (
                  <div className="metadata-item">
                    <User size={16} />
                    <div>
                      <label>Uploaded by</label>
                      <span>
                        {document.uploadedBy.name || document.uploadedBy.email}
                      </span>
                    </div>
                  </div>
                )}

                {document.folder && (
                  <div className="metadata-item">
                    <Folder size={16} />
                    <div>
                      <label>Folder</label>
                      <span>{document.folder.name}</span>
                    </div>
                  </div>
                )}

                {document.documentType && (
                  <div className="metadata-item">
                    <FileText size={16} />
                    <div>
                      <label>Document Type</label>
                      <span>{document.documentType}</span>
                    </div>
                  </div>
                )}

                {document.riskLevel && (
                  <div className="metadata-item">
                    <AlertCircle size={16} />
                    <div>
                      <label>Risk Level</label>
                      <span className={`risk-badge risk-${document.riskLevel.toLowerCase()}`}>
                        {document.riskLevel}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="metadata-section">
                <h4>Processing Status</h4>
                <div className={`processing-status status-${document.processingStatus.toLowerCase()}`}>
                  {document.processingStatus === 'PROCESSING' && (
                    <Loader size={14} className="spinning" />
                  )}
                  {document.processingStatus === 'COMPLETE' && (
                    <span className="status-dot complete" />
                  )}
                  {document.processingStatus === 'FAILED' && (
                    <AlertCircle size={14} />
                  )}
                  {document.processingStatus === 'PENDING' && (
                    <span className="status-dot pending" />
                  )}
                  <span>{document.processingStatus}</span>
                </div>
              </div>

              {isViewOnly && (
                <div className="view-only-notice">
                  <Lock size={16} />
                  <p>This document is view-only. Download is disabled.</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
