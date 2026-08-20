import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Waypoints, FolderOpen } from 'lucide-react';
import { DealMapGraph, DealMapDetail } from '../features/library';
import { libraryService } from '../api/services/library.service';
import type { DealMap, DealMapNode } from '../api/services/library.service';
import { FactSheetModal } from '../features/vdr';
import '../features/library/library.css';

const EMPTY: DealMap = { nodes: [], edges: [], stats: { documents: 0, workstreams: 0 } };

/**
 * Deal Map — the corpus as a network.
 *
 * One node per document, clustered under the single workstream it primarily
 * belongs to, linked where documents share clause language. Clicking a document
 * opens its fact sheet, so the map is a way into the deal rather than a picture
 * of it.
 */
export function LibraryGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const [map, setMap] = useState<DealMap>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DealMapNode | null>(null);
  const [factSheet, setFactSheet] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setMap(await libraryService.getDealMap(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the deal map');
      setMap(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

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
          <Link to={`/projects/${projectId}/vdr`} className="button secondary">
            <FolderOpen size={16} />
            Data Room
          </Link>
        </div>
      </div>

      {!loading && !error && map.stats.documents > 0 && (
        <p className="lib-map-caption">
          {map.stats.documents} documents across {map.stats.workstreams} workstreams · click a
          document to open its fact sheet
        </p>
      )}

      <div className="lib-page-content">
        <DealMapGraph
          map={map}
          loading={loading}
          error={error}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onRefresh={load}
        />
        {selected && (
          <DealMapDetail
            node={selected}
            onClose={() => setSelected(null)}
            onOpenFactSheet={(id, name) => setFactSheet({ id, name })}
          />
        )}
      </div>

      {projectId && (
        <FactSheetModal
          isOpen={!!factSheet}
          projectId={projectId}
          documentId={factSheet?.id ?? null}
          documentName={factSheet?.name ?? null}
          onClose={() => setFactSheet(null)}
        />
      )}
    </div>
  );
}
