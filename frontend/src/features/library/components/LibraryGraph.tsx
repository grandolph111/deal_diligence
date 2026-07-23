import { useRef, useEffect, useCallback } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, Download } from 'lucide-react';
import type { LibraryGraph as LibraryGraphData, LibraryGraphNode } from '../../../api/services/library.service';

/* ---- palette (custom brand-ish; no default Tailwind blue/indigo as primary) ---- */

export const STATUS_COLOR: Record<string, string> = {
  OPEN: '#94a3b8', // slate — an unanswered question
  COVERED: '#059669', // emerald
  FLAGGED: '#e11d48', // rose — deviation / high risk
  THIN: '#d97706', // amber
  NA: '#cbd5e1',
};

const RISK_COLOR: Record<string, string> = {
  HIGH: '#e11d48',
  MEDIUM: '#d97706',
  LOW: '#64748b',
};

const TYPE_COLOR: Record<string, string> = {
  WORKSTREAM: '#334155', // slate hub
  SOURCE: '#7c3aed', // violet
  ENTITY: '#0891b2', // cyan
};

const EDGE_STYLE: Record<string, { color: string; dashed?: boolean }> = {
  CONTAINS: { color: '#d8dee9', dashed: true },
  EVIDENCES: { color: '#94a3b8' },
  SOURCED_FROM: { color: '#5e7d7a' },
  MENTIONS: { color: '#67c5c0', dashed: true },
  PEER_OF: { color: '#d97706', dashed: true }, // amber — cross-document peers
};

const ACCENT = '#0f766e'; // teal selection highlight

const nodeColor = (n: LibraryGraphNode): string => {
  if (n.type === 'CHECKLIST_ITEM') return STATUS_COLOR[n.status ?? 'OPEN'] ?? STATUS_COLOR.OPEN;
  if (n.type === 'PROVISION' || n.type === 'RISK' || n.type === 'OBLIGATION')
    return RISK_COLOR[n.riskLevel ?? ''] ?? '#94a3b8';
  return TYPE_COLOR[n.type] ?? '#94a3b8';
};

const nodeShape = (t: string): string => {
  switch (t) {
    case 'WORKSTREAM':
      return 'round-rectangle';
    case 'SOURCE':
      return 'rectangle';
    case 'PROVISION':
    case 'RISK':
    case 'OBLIGATION':
      return 'diamond';
    default:
      return 'ellipse'; // CHECKLIST_ITEM, ENTITY
  }
};

// Relative node size (mapped by cytoscape to px).
const nodeSize = (n: LibraryGraphNode): number => {
  if (n.type === 'WORKSTREAM') return 20;
  if (n.type === 'CHECKLIST_ITEM') return Math.min(16, 6 + (n.evidenceCount ?? 0) * 2);
  if (n.type === 'SOURCE') return 10;
  if (n.type === 'ENTITY') return 7;
  return 6; // provision
};

const truncate = (s: string, max = 22): string => (s.length <= max ? s : s.slice(0, max - 1) + '…');

interface LibraryGraphProps {
  graph: LibraryGraphData;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  onNodeTap: (node: LibraryGraphNode) => void;
  onRefresh: () => void;
}

const COSE = {
  name: 'cose',
  animate: true,
  animationDuration: 500,
  nodeRepulsion: () => 9000,
  idealEdgeLength: () => 90,
  nodeDimensionsIncludeLabels: true,
} as cytoscape.LayoutOptions;

export function LibraryGraph({
  graph,
  loading,
  error,
  selectedNodeId,
  onNodeTap,
  onRefresh,
}: LibraryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const nodeIndex = useRef<Map<string, LibraryGraphNode>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Hold the latest onNodeTap in a ref so the init effect can run ONCE. Keying
  // the init effect on onNodeTap (which changes identity every expand/collapse)
  // would destroy + rebuild the whole Cytoscape instance on every interaction,
  // losing pan/zoom and forcing a full relayout.
  const onNodeTapRef = useRef(onNodeTap);
  useEffect(() => {
    onNodeTapRef.current = onNodeTap;
  }, [onNodeTap]);

  // Init (runs once)
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            shape: 'data(shape)' as cytoscape.Css.PropertyValueNode<string>,
            label: 'data(label)',
            color: '#0f172a',
            'font-size': '9px',
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            width: 'mapData(size, 6, 20, 18, 58)',
            height: 'mapData(size, 6, 20, 18, 58)',
            'text-wrap': 'ellipsis',
            'text-max-width': '90px',
            'border-width': 2,
            'border-color': '#ffffff',
            'transition-property': 'border-width, border-color',
            'transition-duration': 120,
          } as cytoscape.Css.Node,
        },
        {
          selector: 'node[type="WORKSTREAM"]',
          style: { color: '#ffffff', 'font-size': '11px', 'font-weight': 700, 'text-valign': 'center', 'text-margin-y': 0 } as cytoscape.Css.Node,
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 4, 'border-color': ACCENT } as cytoscape.Css.Node,
        },
        {
          selector: 'node.hover',
          style: { 'border-width': 3, 'border-color': ACCENT } as cytoscape.Css.Node,
        },
        {
          selector: 'node.expanded',
          style: { 'border-width': 3, 'border-color': ACCENT, 'border-style': 'double' } as cytoscape.Css.Node,
        },
        {
          selector: 'edge',
          style: {
            width: 'mapData(weight, 1, 6, 1, 4)',
            'line-color': 'data(color)',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            opacity: 0.7,
          } as cytoscape.Css.Edge,
        },
        {
          selector: 'edge[dashed = "yes"]',
          style: { 'line-style': 'dashed' } as cytoscape.Css.Edge,
        },
      ],
      layout: COSE,
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    cy.on('tap', 'node', (evt) => {
      const id = (evt.target as NodeSingular).id();
      const node = nodeIndex.current.get(id);
      if (node) onNodeTapRef.current(node);
    });
    cy.on('mouseover', 'node', (evt) => {
      (evt.target as NodeSingular).addClass('hover');
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', (evt) => {
      (evt.target as NodeSingular).removeClass('hover');
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    });

    cyRef.current = cy;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      cy.destroy();
      cyRef.current = null;
    };
    // Init once — onNodeTap is read via a ref, so it's intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data update — incremental diff so existing node positions are preserved.
  // Removing + re-adding every element each time would drop all positions; with
  // a count-gated layout that piles nodes at the origin on any same-count change
  // (e.g. collapse-A + expand-B, or refresh with unchanged data).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    nodeIndex.current = new Map(graph.nodes.map((n) => [n.id, n]));

    const desiredNodeIds = new Set(graph.nodes.map((n) => n.id));
    const desiredEdgeIds = new Set(graph.edges.map((e) => e.id));

    // Remove elements no longer present.
    const removed = cy
      .elements()
      .filter((el) =>
        el.isNode() ? !desiredNodeIds.has(el.id()) : !desiredEdgeIds.has(el.id())
      );
    const removedNodeCount = removed.nodes().length;
    removed.remove();

    // Add new elements; update data on existing ones (status/color can change
    // after a reconcile).
    const toAdd: ElementDefinition[] = [];
    const addedNodeIds = new Set<string>();
    for (const n of graph.nodes) {
      const data = {
        id: n.id,
        label: truncate(n.label),
        color: nodeColor(n),
        shape: nodeShape(n.type),
        size: nodeSize(n),
        type: n.type,
      };
      const existing = cy.getElementById(n.id);
      if (existing.nonempty()) existing.data(data);
      else {
        toAdd.push({ data });
        addedNodeIds.add(n.id);
      }
    }
    for (const e of graph.edges) {
      if (cy.getElementById(e.id).nonempty()) continue;
      const st = EDGE_STYLE[e.type] ?? { color: '#cbd5e1' };
      toAdd.push({
        data: { id: e.id, source: e.source, target: e.target, color: st.color, weight: e.weight ?? 1, dashed: st.dashed ? 'yes' : 'no' },
      });
    }
    if (toAdd.length) cy.add(toAdd);

    // Re-layout only when the node set actually changed. Defer to rAF + resize so
    // the container is sized.
    if (addedNodeIds.size === 0 && removedNodeCount === 0) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (cy.destroyed()) return;
      cy.resize();
      const newNodes = cy.nodes().filter((n) => addedNodeIds.has(n.id()));
      const existingNodes = cy.nodes().not(newNodes);
      const isInitial = existingNodes.length === 0;
      // Initial: full layout (randomize for a good spread). Incremental: lock the
      // existing arrangement and place only the new nodes, so expand/collapse
      // doesn't shove the whole map around.
      if (isInitial) {
        cy.layout(COSE).run();
      } else {
        existingNodes.lock();
        const layout = cy.layout({ ...COSE, randomize: false } as cytoscape.LayoutOptions);
        layout.one('layoutstop', () => existingNodes.unlock());
        layout.run();
      }
    });
  }, [graph]);

  // Selection highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.nodes().unselect();
    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId);
      if (node.length > 0) {
        node.select();
        cy.animate({ center: { eles: node }, duration: 250 });
      }
    }
  }, [selectedNodeId]);

  const zoomIn = useCallback(() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2), []);
  const zoomOut = useCallback(() => cyRef.current?.zoom(cyRef.current.zoom() / 1.2), []);
  const fit = useCallback(() => cyRef.current?.fit(undefined, 40), []);
  const exportPng = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const blob = cy.png({ output: 'blob', bg: '#ffffff', scale: 2, full: true });
    const link = document.createElement('a');
    link.download = `deal-map-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, []);

  // The canvas <div> is ALWAYS mounted so the init effect (which runs once) has a
  // real container on first render — the loading/empty/error states are overlays,
  // not early returns. (Early-returning before the canvas is rendered left
  // containerRef null on mount, so the graph never initialized.)
  const showEmpty = !loading && !error && graph.nodes.length === 0;
  const showGraphChrome = !loading && !error && graph.nodes.length > 0;

  return (
    <div className="lib-graph">
      <div className="lib-graph-canvas" ref={containerRef} />

      {loading && (
        <div className="lib-graph-state">
          <div className="loading-spinner" />
          <p>Loading the deal map…</p>
        </div>
      )}
      {!loading && error && (
        <div className="lib-graph-state">
          <p>{error}</p>
          <button className="button secondary" onClick={onRefresh}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}
      {showEmpty && (
        <div className="lib-graph-state">
          <p>No library yet.</p>
          <p className="lib-graph-hint">
            Enable the knowledge library and ingest documents to build the deal map.
          </p>
        </div>
      )}

      {showGraphChrome && (
        <div className="lib-graph-toolbar">
          <button className="button secondary icon-only" onClick={onRefresh} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="button secondary icon-only" onClick={zoomIn} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button className="button secondary icon-only" onClick={zoomOut} title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button className="button secondary icon-only" onClick={fit} title="Fit to view">
            <Maximize size={16} />
          </button>
          <button className="button secondary icon-only" onClick={exportPng} title="Export PNG">
            <Download size={16} />
          </button>
        </div>
      )}

      {showGraphChrome && (
      <div className="lib-graph-legend">
        <div className="lib-legend-group">
          <span className="lib-legend-title">Checklist items</span>
          {(['OPEN', 'COVERED', 'FLAGGED'] as const).map((s) => (
            <span key={s} className="lib-legend-item">
              <span className="lib-legend-dot" style={{ background: STATUS_COLOR[s] }} />
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
        <div className="lib-legend-group">
          <span className="lib-legend-title">Nodes</span>
          <span className="lib-legend-item">
            <span className="lib-legend-dot square" style={{ background: TYPE_COLOR.WORKSTREAM }} /> Workstream
          </span>
          <span className="lib-legend-item">
            <span className="lib-legend-dot square" style={{ background: TYPE_COLOR.SOURCE }} /> Source
          </span>
          <span className="lib-legend-item">
            <span className="lib-legend-dot" style={{ background: TYPE_COLOR.ENTITY }} /> Entity
          </span>
          <span className="lib-legend-item">
            <span className="lib-legend-dot diamond" style={{ background: RISK_COLOR.HIGH }} /> Provision
          </span>
        </div>
      </div>
      )}
    </div>
  );
}
