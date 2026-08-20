import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Waypoints, FolderOpen, Sparkles } from 'lucide-react';
import { useLibraryGraph, LibraryGraph, LibraryNodeDetail, LibraryFindings } from '../features/library';
import { libraryService } from '../api/services/library.service';
import type { LibraryGraphNode, LintFinding } from '../api/services/library.service';

/**
 * Deal Map — the knowledge-library graph. Workstreams → checklist items
 * (colored by coverage) → sources + entities; click an item to expand its
 * provision evidence.
 */
export function LibraryGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    graph,
    loading,
    error,
    expandedItems,
    expandingItemId,
    expandError,
    selectedNodeId,
    selectedNode,
    statusCounts,
    expandItem,
    toggleExpandItem,
    setSelectedNodeId,
    refresh,
  } = useLibraryGraph(projectId || '');

  const handleNodeTap = useCallback(
    (node: LibraryGraphNode) => {
      setSelectedNodeId(node.id);
      // Tapping a checklist item expands its evidence (never collapses — that's
      // the detail-panel button's job, so re-tapping to inspect doesn't hide it).
      if (node.type === 'CHECKLIST_ITEM' && (node.evidenceCount ?? 0) > 0 && node.itemId) {
        expandItem(node.itemId);
      }
    },
    [setSelectedNodeId, expandItem]
  );

  // --- Findings (lint) ---
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [lintLoading, setLintLoading] = useState(false);
  const [lintSource, setLintSource] = useState<'llm' | 'deterministic' | null>(null);
  const [lintHasRun, setLintHasRun] = useState(false);

  const runLint = useCallback(async () => {
    if (!projectId) return;
    setLintLoading(true);
    try {
      const res = await libraryService.runLint(projectId);
      setFindings(res.findings);
      setLintSource(res.source);
      setLintHasRun(true);
    } catch {
      setFindings([]);
      setLintHasRun(true);
    } finally {
      setLintLoading(false);
    }
  }, [projectId]);

  // Click a finding → focus (and expand) its checklist item in the graph.
  const handleFindingClick = useCallback(
    (itemId: string) => {
      const node = graph.nodes.find((n) => n.type === 'CHECKLIST_ITEM' && n.itemId === itemId);
      if (!node) return;
      setSelectedNodeId(node.id);
      if ((node.evidenceCount ?? 0) > 0) expandItem(itemId);
    },
    [graph, setSelectedNodeId, expandItem]
  );

  return (
    <div className="lib-page">
      <div className="page-header">
        <Link to={`/projects/${projectId}`} className="back-link">
          <ArrowLeft size={16} />
          Back to Project
        </Link>

        <div className="page-header-title">
          <Waypoints size={20} />
          <h1>Deal Map</h1>
        </div>

        <div className="page-header-actions">
          <button
            className="button secondary"
            onClick={() => {
              setFindingsOpen(true);
              if (!lintHasRun && !lintLoading) runLint();
            }}
          >
            <Sparkles size={16} />
            Findings
          </button>
          <Link to={`/projects/${projectId}/vdr`} className="button secondary">
            <FolderOpen size={16} />
            Data Room
          </Link>
        </div>
      </div>

      {/* Coverage summary — the diligence tracker at a glance */}
      {!loading && !error && statusCounts.total > 0 && (
        <div className="lib-coverage-bar">
          <div className="lib-coverage-stat open">
            <span className="lib-coverage-value">{statusCounts.open}</span>
            <span className="lib-coverage-label">Open questions</span>
          </div>
          <div className="lib-coverage-stat covered">
            <span className="lib-coverage-value">{statusCounts.covered}</span>
            <span className="lib-coverage-label">Covered</span>
          </div>
          <div className="lib-coverage-stat flagged">
            <span className="lib-coverage-value">{statusCounts.flagged}</span>
            <span className="lib-coverage-label">Flagged</span>
          </div>
          {statusCounts.thin > 0 && (
            <div className="lib-coverage-stat thin">
              <span className="lib-coverage-value">{statusCounts.thin}</span>
              <span className="lib-coverage-label">Partial</span>
            </div>
          )}
          <div className="lib-coverage-track" aria-hidden>
            {statusCounts.total > 0 && (
              <>
                <span
                  className="seg covered"
                  style={{ width: `${(statusCounts.covered / statusCounts.total) * 100}%` }}
                />
                <span
                  className="seg flagged"
                  style={{ width: `${(statusCounts.flagged / statusCounts.total) * 100}%` }}
                />
                <span
                  className="seg thin"
                  style={{ width: `${(statusCounts.thin / statusCounts.total) * 100}%` }}
                />
                <span
                  className="seg open"
                  style={{ width: `${(statusCounts.open / statusCounts.total) * 100}%` }}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="lib-page-content">
        {findingsOpen && (
          <LibraryFindings
            findings={findings}
            loading={lintLoading}
            source={lintSource}
            hasRun={lintHasRun}
            onRun={runLint}
            onClose={() => setFindingsOpen(false)}
            onFindingClick={handleFindingClick}
          />
        )}

        <LibraryGraph
          graph={graph}
          loading={loading}
          error={error}
          selectedNodeId={selectedNodeId}
          onNodeTap={handleNodeTap}
          onRefresh={refresh}
        />

        {selectedNode && (
          <LibraryNodeDetail
            node={selectedNode}
            expanded={!!selectedNode.itemId && expandedItems.has(selectedNode.itemId)}
            expanding={expandingItemId === selectedNode.itemId}
            error={expandError && expandError.itemId === selectedNode.itemId ? expandError.message : null}
            onClose={() => setSelectedNodeId(null)}
            onToggleExpand={toggleExpandItem}
          />
        )}
      </div>
    </div>
  );
}
