import { useEffect, useState } from 'react';
import { Check, Copy, Database, ExternalLink, FileCode2, Layers } from 'lucide-react';

interface HealthInfo {
  status: string;
  schema_version: number;
  storage_adapter: string;
  actors_count: number;
}

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/actors',
    desc: 'All mapped actors/orgs with summaries, primary bets, key cruxes, and tags. Supports ?q=, ?tag=, ?kind=.',
  },
  {
    method: 'GET',
    path: '/api/v1/actors/dario-amodei',
    desc: 'Full Theory of Change snapshot history, nodes, edges, citations, update criteria, and concept catalog for any handle.',
  },
  {
    method: 'GET',
    path: '/api/v1/actors/dario-amodei/export?format=json',
    desc: 'Portable single-file toc-schema/v1 JSON export (also supports ?format=markdown for LessWrong / Substack).',
  },
  {
    method: 'GET',
    path: '/api/v1/compare?a=dario-amodei&b=eliezer-yudkowsky',
    desc: 'Structured side-by-side diff, shared ground, earliest-split diagnostic, and ranked crux disagreements.',
  },
  {
    method: 'GET',
    path: '/api/v1/cruxes',
    desc: 'Contested field claims ranked by spread & stance split, with supporters and skeptics per root concept.',
  },
  {
    method: 'GET',
    path: '/api/v1/intelligence/field',
    desc: 'Computed field analytics: neglected bottlenecks, sharpest fault-line pairs, cross-camp allies, and unfalsifiable hotspots.',
  },
  {
    method: 'GET',
    path: '/api/v1/concepts',
    desc: 'Canonical concept registry + forked phrasings with parent_concept_id / root_concept_id lineage.',
  },
];

const ARWEAVE_QUERY = `{
  transactions(
    tags: [
      { name: "App-Name", values: ["toctracker"] }
      { name: "Schema-Version", values: ["1"] }
    ]
    first: 100
  ) {
    edges {
      node {
        id
        tags { name value }
      }
    }
  }
}`;

export function OpenDataDocs() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://toctracker.com';

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHealth(d))
      .catch(() => {});
  }, []);

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="border-b border-[var(--border-hairline)] pb-6">
        <div className="flex flex-wrap items-center gap-2 font-mono-meta text-[11px] text-[var(--ink-muted)]">
          <span className="rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-0.5 font-semibold text-[var(--ink-primary)]">
            toc-schema/v{health?.schema_version ?? 1}
          </span>
          <span>CORS-Open Read API</span>
          <span>·</span>
          <span>MIT Code · Open Data</span>
          {health && (
            <>
              <span>·</span>
              <span className="text-emerald-800">
                {health.actors_count} maps ·{' '}
                {health.storage_adapter === 'arweave-turbo' ? 'Arweave Turbo Live' : 'Postgres Open Export'}
              </span>
            </>
          )}
        </div>
        <h1 className="mt-2 font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
          Open Data & API
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-secondary)]">
          Every Theory of Change, concept lineage, comparison diff, and update criterion on{' '}
          <strong className="text-[var(--ink-primary)]">toctracker.com</strong> is freely readable with zero
          API key required. Pull the JSON into notebooks, run your own clustering, or mirror the permanent
          Arweave archive directly.
        </p>
      </div>

      {/* Section 1: Public REST Read API */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-[var(--ink-primary)]" />
          <h2 className="text-base font-bold text-[var(--ink-primary)]">Free Read API (No Auth Required)</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          All read endpoints return JSON and set permissive CORS headers so browser apps, scripts, and AI
          agents can query them directly.
        </p>

        <div className="mt-4 space-y-2.5">
          {ENDPOINTS.map((ep) => {
            const fullUrl = `${origin}${ep.path}`;
            const curlCmd = `curl -s "${fullUrl}" | jq`;
            return (
              <div
                key={ep.path}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono-meta text-xs">
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      {ep.method}
                    </span>
                    <code className="font-semibold text-[var(--ink-primary)]">{ep.path}</code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copy(ep.path, curlCmd)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                    >
                      {copiedKey === ep.path ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy curl
                        </>
                      )}
                    </button>
                    <a
                      href={ep.path}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-[var(--ink-secondary)]">{ep.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Arweave Permaweb Archive */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[var(--ink-primary)]" />
          <h2 className="text-base font-bold text-[var(--ink-primary)]">
            Permanent Arweave Archive (ANS-104)
          </h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
          Published records are signed with Ed25519 and archived as ANS-104 DataItems via ArDrive Turbo
          (free for records &lt;100 KiB). Query the full append-only history directly from{' '}
          <code className="font-mono-meta text-[11px]">https://arweave.net/graphql</code> without relying on
          our server:
        </p>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2">
            <span className="font-mono-meta text-[11px] font-semibold text-[var(--ink-secondary)]">
              Arweave GraphQL Query
            </span>
            <button
              type="button"
              onClick={() => copy('arweave_gql', ARWEAVE_QUERY)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              {copiedKey === 'arweave_gql' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto p-4 font-mono-meta text-xs leading-relaxed text-[var(--ink-primary)]">
            {ARWEAVE_QUERY}
          </pre>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ['App-Name', 'toctracker'],
            ['Schema-Version', '1'],
            ['Record-Type', 'concept | toc_snapshot | link_attestation'],
            ['Actor-Id / Prev-Tx', 'Links every versioned snapshot into an immutable chain'],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs"
            >
              <span className="font-mono-meta font-semibold text-[var(--ink-primary)]">{k}</span>
              <span className="ml-2 text-[var(--ink-secondary)]">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Schema & Invariants */}
      <section className="mt-10 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[var(--ink-primary)]" />
          <h2 className="text-base font-bold text-[var(--ink-primary)]">Schema Invariants (`toc-schema/v1`)</h2>
        </div>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
          <li>
            <strong className="text-[var(--ink-primary)]">5-Stage Causal Spine:</strong> Every node belongs to{' '}
            <code className="font-mono-meta">premise → bottleneck → intervention → bet → outcome</code>, with
            directed acyclic edges (<code className="font-mono-meta">leads_to</code>,{' '}
            <code className="font-mono-meta">mitigates</code>,{' '}
            <code className="font-mono-meta">depends_on</code>,{' '}
            <code className="font-mono-meta">conflicts_with</code>).
          </li>
          <li>
            <strong className="text-[var(--ink-primary)]">Forkable Canonical Lineage:</strong> Custom phrasings
            preserve exact wording via <code className="font-mono-meta">parent_concept_id</code> while
            retaining <code className="font-mono-meta">root_concept_id</code> so comparisons aggregate cleanly.
          </li>
          <li>
            <strong className="text-[var(--ink-primary)]">Anti-False-Precision & Falsifiability:</strong> Exact
            numeric credences require a written rationale (≥10 chars), and every published snapshot requires at
            least one concrete <code className="font-mono-meta">IF / THEN</code> update criterion.
          </li>
        </ul>
      </section>
    </main>
  );
}
