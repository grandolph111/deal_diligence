import { useRef, useEffect, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize, RefreshCw } from 'lucide-react';
import type { DealMap, DealMapNode } from '../../../api/services/library.service';
import './deal-map.css';

/* ---- palette ----
 * Tuned for a dark canvas. Each node is drawn as a radial gradient from a lit
 * core to a darker rim, with a wide translucent border standing in for a glow —
 * cytoscape has no shadow support, and flat discs on a light ground were what
 * made the previous map look like a chart rather than a map.
 */
type Swatch = { core: string; rim: string; glow: string };

/**
 * Risk reads as a continuous ramp, one step per score.
 *
 * Three coarse bands collapsed almost the whole deal into a single colour —
 * 87 of 100 documents score 4-6 — which told the reader nothing. Per-score
 * steps make the difference between a 4 and a 6 visible, which is the
 * comparison someone scanning the map is actually making.
 */
const RISK_RAMP: Swatch[] = [
  { core: '#8fd6c4', rim: '#3f8a78', glow: 'rgba(90,180,160,0.20)' }, // 0
  { core: '#96d8bb', rim: '#428a6e', glow: 'rgba(96,182,150,0.20)' }, // 1
  { core: '#a6da ad'.replace(' ', ''), rim: '#4d8a5f', glow: 'rgba(112,182,130,0.20)' }, // 2
  { core: '#bcdc9e', rim: '#63894a', glow: 'rgba(140,184,110,0.21)' }, // 3
  { core: '#d5dc92', rim: '#7f8740', glow: 'rgba(170,180,95,0.21)' }, // 4
  { core: '#ecd489', rim: '#9c8038', glow: 'rgba(200,168,80,0.22)' }, // 5
  { core: '#f2bd7e', rim: '#b3702f', glow: 'rgba(215,140,70,0.23)' }, // 6
  { core: '#f2a075', rim: '#bd5c2c', glow: 'rgba(220,115,60,0.24)' }, // 7
  { core: '#f08a7c', rim: '#c04432', glow: 'rgba(224,95,60,0.25)' }, // 8
  { core: '#ed7683', rim: '#c33448', glow: 'rgba(226,75,80,0.26)' }, // 9
  { core: '#e8637f', rim: '#bf2748', glow: 'rgba(226,60,85,0.28)' }, // 10
];

const PALETTE: Record<string, Swatch> = {
  root: { core: '#f6e0b4', rim: '#c39b57', glow: 'rgba(199,164,108,0.30)' },
  workstream: { core: '#d3e0f2', rim: '#7f9bc4', glow: 'rgba(139,164,201,0.24)' },
  none: { core: '#7d8ba4', rim: '#454f63', glow: 'rgba(122,139,164,0.14)' },
  ...Object.fromEntries(RISK_RAMP.map((sw, i) => [`r${i}`, sw])),
};

const EDGE_COLOR = { CONTAINS: '#3d4a63', PEER: '#4a6572' };

/** Which palette entry a node draws from. */
function paletteKey(n: DealMapNode): string {
  if (n.type === 'ROOT') return 'root';
  if (n.type === 'WORKSTREAM') return 'workstream';
  if (!n.analyzed) return 'none';
  if (n.riskScore != null) {
    return `r${Math.max(0, Math.min(10, Math.round(n.riskScore)))}`;
  }
  // No numeric score — fall back to the coarse level at ramp midpoints.
  const lvl = (n.riskLevel ?? '').toUpperCase();
  if (lvl === 'HIGH') return 'r8';
  if (lvl === 'MEDIUM') return 'r5';
  if (lvl === 'LOW') return 'r2';
  return 'none';
}

const truncate = (s: string, max = 30) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/**
 * Deterministic positions: root at centre, workstreams on a ring, each
 * workstream's documents filling a disc around it.
 *
 * A force layout cannot be relied on here. Documents link both to their hub and
 * to peers in other clusters, and any spring setting that keeps a 36-document
 * cluster from collapsing onto its hub also lets the peer links drag every
 * cluster into one mass — it settles into either a ball or a line. The
 * structure is known, so placing it directly is both stable and far more
 * legible; the phyllotaxis fill keeps it organic rather than gridded.
 */
function clusterPositions(map: DealMap): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const hubs = map.nodes.filter((n) => n.type === 'WORKSTREAM');
  if (hubs.length === 0) return pos;

  const docsByHub = new Map<string, string[]>();
  for (const n of map.nodes) {
    if (n.type !== 'DOCUMENT') continue;
    const key = `ws:${n.workstreamId}`;
    const bucket = docsByHub.get(key) ?? [];
    bucket.push(n.id);
    docsByHub.set(key, bucket);
  }

  const discFor = (n: number) => (n === 0 ? 0 : 38 + Math.sqrt(n) * 25);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  // Shelf-pack the clusters into the canvas aspect rather than a ring. A circle
  // spends half its area on the empty middle and forces `fit` to zoom out until
  // the labels stop resolving; packing rows uses the space the canvas actually
  // has, which is wide and short.
  const cells = hubs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((hub) => {
      const docs = docsByHub.get(hub.id) ?? [];
      const disc = discFor(docs.length);
      return { hub, docs, disc, w: Math.max(150, disc * 2 + 96), h: disc * 2 + 78 };
    });

  const totalArea = cells.reduce((a, c) => a + c.w * c.h, 0);
  const targetWidth = Math.sqrt(totalArea * 1.9); // canvas is roughly 2:1

  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let maxX = 0;
  for (const c of cells) {
    if (x > 0 && x + c.w > targetWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const cx = x + c.w / 2;
    const cy = y + c.h / 2;
    pos[c.hub.id] = { x: cx, y: cy };

    c.docs.forEach((id, j) => {
      // Phyllotaxis: even coverage of the disc without visible rows.
      const r = c.disc * Math.sqrt((j + 0.5) / c.docs.length);
      const a = j * GOLDEN;
      pos[id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });

    x += c.w;
    maxX = Math.max(maxX, x);
    rowHeight = Math.max(rowHeight, c.h);
  }

  // Root sits at the middle of the packed field so its spokes stay short.
  pos.root = { x: maxX / 2, y: (y + rowHeight) / 2 };

  return pos;
}

interface Props {
  map: DealMap;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (node: DealMapNode | null) => void;
  onRefresh: () => void;
}

/**
 * The deal drawn as a network: root → workstreams → documents, with documents
 * linked where they share clause language.
 *
 * Node size follows link count, so the contracts everything else resembles
 * become visibly central. Hovering dims everything that is not a neighbour,
 * which is the only interaction that makes a few hundred edges readable.
 */
export function DealMapGraph({ map, loading, error, selectedId, onSelect, onRefresh }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const nodeIndex = useRef<Map<string, DealMapNode>>(new Map());
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Init once — rebuilding on every prop change would lose pan/zoom and restart
  // the layout mid-interaction.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-fill': 'radial-gradient',
            'background-gradient-stop-positions': '0% 100%',
            width: 'data(size)',
            height: 'data(size)',
            // Wide, near-transparent border reads as a halo.
            'border-width': 'data(halo)',
            'border-opacity': 1,
            label: '',
            color: '#c8d4e6',
            'font-size': '9px',
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'text-outline-width': 2,
            'text-outline-color': '#0b1220',
            'text-outline-opacity': 0.9,
            'transition-property': 'opacity, border-width',
            'transition-duration': 160,
          } as unknown as cytoscape.Css.Node,
        },
        // One class per palette entry: gradient stops must be literal.
        ...Object.entries(PALETTE).map(([key, p]) => ({
          selector: `node.k-${key.toLowerCase()}`,
          style: {
            'background-gradient-stop-colors': `${p.core} ${p.rim}`,
            'border-color': p.glow,
          } as unknown as cytoscape.Css.Node,
        })),
        {
          // Hubs are always named; documents only on demand.
          selector: 'node[type="WORKSTREAM"], node[type="ROOT"]',
          style: { label: 'data(label)', 'font-size': '11px', 'font-weight': 700, color: '#e4ecf8' } as cytoscape.Css.Node,
        },
        {
          selector: 'node.hl',
          style: { label: 'data(label)', 'z-index': 99, 'border-width': 'data(haloBig)' } as cytoscape.Css.Node,
        },
        { selector: 'node.dim', style: { opacity: 0.12 } as cytoscape.Css.Node },
        {
          selector: 'node:selected',
          style: {
            label: 'data(label)',
            'border-color': '#f0d9a8',
            'border-width': 'data(haloBig)',
            'z-index': 100,
          } as cytoscape.Css.Node,
        },
        {
          selector: 'edge',
          style: {
            width: 'data(w)',
            'line-color': 'data(color)',
            'curve-style': 'straight',
            'target-arrow-shape': 'none',
            opacity: 0.35,
            'transition-property': 'opacity, line-color',
            'transition-duration': 160,
          } as cytoscape.Css.Edge,
        },
        { selector: 'edge.hl', style: { opacity: 0.9, 'line-color': '#8fb3c9', width: 2 } as cytoscape.Css.Edge },
        { selector: 'edge.dim', style: { opacity: 0.04 } as cytoscape.Css.Edge },
      ],
      layout: { name: 'preset' },
      minZoom: 0.08,
      maxZoom: 4,
      wheelSensitivity: 0.25,
    });

    const highlight = (node: NodeSingular) => {
      const near = node.closedNeighborhood();
      cy.elements().addClass('dim');
      near.removeClass('dim').addClass('hl');
    };
    const clearHighlight = () => cy.elements().removeClass('dim hl');

    cy.on('mouseover', 'node', (e) => {
      highlight(e.target as NodeSingular);
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      clearHighlight();
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    });
    cy.on('tap', 'node', (e) => {
      const n = nodeIndex.current.get((e.target as NodeSingular).id());
      if (n) onSelectRef.current(n);
    });
    cy.on('tap', (e) => {
      if (e.target === cy) onSelectRef.current(null);
    });

    cyRef.current = cy;
    setReady(true);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Feed data + run the force layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || map.nodes.length === 0) return;

    nodeIndex.current = new Map(map.nodes.map((n) => [n.id, n]));

    // Link count drives size, so hubs emerge from the data rather than from type.
    const degree = new Map<string, number>();
    for (const e of map.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const els: ElementDefinition[] = [];
    for (const n of map.nodes) {
      const d = degree.get(n.id) ?? 0;
      const base =
        n.type === 'ROOT' ? 46 : n.type === 'WORKSTREAM' ? 26 : 11 + Math.min(18, Math.sqrt(d) * 4);
      els.push({
        data: {
          id: n.id,
          type: n.type,
          label: truncate(n.label, n.type === 'DOCUMENT' ? 34 : 26),
          size: base,
          halo: Math.max(3, base * 0.22),
          haloBig: Math.max(6, base * 0.42),
        },
        classes: `k-${paletteKey(n)}`,
      });
    }
    for (const e of map.edges) {
      els.push({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          color: EDGE_COLOR[e.type],
          w: e.type === 'CONTAINS' ? 1 : Math.min(2.4, 0.6 + e.weight * 0.18),
        },
      });
    }

    cy.elements().remove();
    cy.add(els);
    const positions = clusterPositions(map);
    cy.layout({
      name: 'preset',
      positions: (n: NodeSingular) => positions[n.id()] ?? { x: 0, y: 0 },
      fit: true,
      padding: 60,
      animate: false,
    } as cytoscape.LayoutOptions).run();
  }, [map, ready]);

  // Reflect external selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId]);

  const zoom = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const fit = useCallback(() => {
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) cy.fit(undefined, 50);
  }, []);

  return (
    <div className="dmap">
      <div ref={containerRef} className="dmap__canvas" />

      {loading && <div className="dmap__state">Building the map…</div>}
      {!loading && error && (
        <div className="dmap__state">
          <p>{error}</p>
          <button className="button secondary" onClick={onRefresh}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}
      {!loading && !error && map.nodes.length === 0 && (
        <div className="dmap__state">The map appears once documents are analyzed.</div>
      )}

      {!loading && !error && map.nodes.length > 0 && (
        <>
          <div className="dmap__controls">
            <button onClick={onRefresh} title="Rebuild"><RefreshCw size={15} /></button>
            <button onClick={() => zoom(1.3)} title="Zoom in"><ZoomIn size={15} /></button>
            <button onClick={() => zoom(1 / 1.3)} title="Zoom out"><ZoomOut size={15} /></button>
            <button onClick={fit} title="Fit"><Maximize size={15} /></button>
          </div>
          <div className="dmap__legend">
            <span className="dmap__key"><i style={{ background: PALETTE.root.core }} /> Deal</span>
            <span className="dmap__key"><i style={{ background: PALETTE.workstream.core }} /> Workstream</span>
            <span className="dmap__key dmap__key--ramp">
              Risk
              <span className="dmap__ramp" aria-hidden="true">
                {RISK_RAMP.map((sw, i) => (
                  <i key={i} style={{ background: sw.core }} />
                ))}
              </span>
              <span className="dmap__ramp-ends">low → high</span>
            </span>
            <span className="dmap__key"><i style={{ background: PALETTE.none.core }} /> Not analyzed</span>
          </div>
        </>
      )}
    </div>
  );
}
