import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, Copy, Database, ExternalLink, FileCode2, Layers, ShieldCheck } from 'lucide-react';

interface HealthInfo {
  status: string;
  schema_version: number;
  storage_adapter: string;
  actors_count: number;
}

interface ArchiveRecordItem {
  actor_handle: string;
  display_name: string;
  version: number;
  arweave_tx_id?: string | null;
  gateway_url?: string | null;
  is_live_arweave: boolean;
  published_at: string;
}

interface ArchiveRecordsResponse {
  adapter: string;
  total_snapshots: number;
  archived_count: number;
  records: ArchiveRecordItem[];
}

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/actors',
    desc: 'All actors and orgs with summaries, main bets, key cruxes, and tags. Supports ?q=, ?tag=, ?kind=.',
  },
  {
    method: 'GET',
    path: '/api/v1/actors/dario-amodei',
    desc: 'Full snapshot history, nodes, edges, citations, update criteria, and concept list for any handle.',
  },
  {
    method: 'GET',
    path: '/api/v1/actors/dario-amodei/export?format=json',
    desc: 'Single-file toc-schema/v1 JSON export (or ?format=markdown for plain text / LessWrong / Substack).',
  },
  {
    method: 'GET',
    path: '/api/v1/compare?a=dario-amodei&b=eliezer-yudkowsky',
    desc: 'Side-by-side diff, shared premises, earliest split, and ranked disagreements.',
  },
  {
    method: 'GET',
    path: '/api/v1/cruxes',
    desc: 'Contested claims ranked by spread and disagreement, with who agrees and who is skeptical.',
  },
  {
    method: 'GET',
    path: '/api/v1/intelligence/field',
    desc: 'Field stats: underworked bottlenecks, sharp splits, cross-camp overlap, and claims missing update criteria.',
  },
  {
    method: 'GET',
    path: '/api/v1/concepts',
    desc: 'Shared concept list plus forked phrasings (linked by parent_concept_id and root_concept_id).',
  },
  {
    method: 'GET',
    path: '/api/v1/archive/records',
    desc: 'Arweave transaction index linking each snapshot to its arweave.net URL.',
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
  const [archive, setArchive] = useState<ArchiveRecordsResponse | null>(null);
  const [llmsTxt, setLlmsTxt] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://toctracker.com';

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHealth(d))
      .catch(() => {});
    fetch('/api/v1/archive/records')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setArchive(d))
      .catch(() => {});
    fetch('/llms.txt')
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => t && setLlmsTxt(t))
      .catch(() => {});
  }, []);

  async function copyForAgent() {
    let text = llmsTxt;
    if (!text) {
      try {
        const res = await fetch('/llms.txt');
        if (res.ok) {
          text = await res.text();
          setLlmsTxt(text);
        }
      } catch {
        // fallback below
      }
    }
    if (!text) {
      text = `toctracker.com Open Data API\nDocs & full endpoint list: ${origin}/llms.txt\nActors JSON: ${origin}/api/v1/actors\nField Intelligence: ${origin}/api/v1/intelligence/field`;
    }
    copy('agent_all', text);
  }

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
          All maps, comparisons, and update criteria on{' '}
          <strong className="text-[var(--ink-primary)]">toctracker.com</strong> are open and readable with no API
          key. Pull the JSON into scripts or notebooks, or read directly from Arweave.
        </p>

        {/* Obvious 1-Click Copy for AI Agents Banner */}
        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-[var(--ink-primary)]/20 bg-[var(--bg-surface)] p-4 shadow-xs sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ink-primary)] text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--ink-primary)]">
                Copy for Claude, Cursor, Codex, or another agent
              </div>
              <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                Copies <code className="font-mono-meta">/llms.txt</code> with every API endpoint, the schema, the
                Arweave GraphQL query, and all {health?.actors_count ?? 26} handles.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyForAgent}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink-primary)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            >
              {copiedKey === 'agent_all' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  Copied for Agent
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy for AI / Agent
                </>
              )}
            </button>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 font-mono-meta text-xs font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
            >
              /llms.txt
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Section 1: Public REST Read API */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-[var(--ink-primary)]" />
          <h2 className="text-base font-bold text-[var(--ink-primary)]">Free Read API (No Auth Required)</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          All read endpoints return JSON with open CORS headers.
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

        {/* Live Permanent Archive Verification Explorer */}
        {archive && archive.records.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink-primary)]">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Arweave Archive Index
              </div>
              <span className="font-mono-meta text-[11px] text-[var(--ink-secondary)]">
                {archive.archived_count} / {archive.total_snapshots} archived on Arweave ({archive.adapter})
              </span>
            </div>
            <div className="max-h-72 divide-y divide-[var(--border-hairline)] overflow-y-auto text-xs">
              {archive.records.map((rec) => (
                <div
                  key={rec.actor_handle}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-[var(--bg-canvas)]"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/a/${rec.actor_handle}`}
                      className="font-semibold text-[var(--ink-primary)] hover:underline"
                    >
                      {rec.display_name}
                    </Link>
                    <span className="font-mono-meta text-[10px] text-[var(--ink-muted)]">v{rec.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rec.is_live_arweave && rec.gateway_url && rec.arweave_tx_id ? (
                      <a
                        href={rec.gateway_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono-meta text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        ar://{rec.arweave_tx_id.slice(0, 8)}…{rec.arweave_tx_id.slice(-4)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <a
                        href={`/api/v1/actors/${encodeURIComponent(rec.actor_handle)}/export?format=json`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 font-mono-meta text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                      >
                        JSON export
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Schema & Invariants */}
      <section className="mt-10 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[var(--ink-primary)]" />
          <h2 className="text-base font-bold text-[var(--ink-primary)]">
            Schema (<code className="font-mono-meta text-sm">toc-schema/v1</code>)
          </h2>
        </div>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
          <li>
            <strong className="text-[var(--ink-primary)]">Five stages:</strong> Every node belongs to{' '}
            <code className="font-mono-meta">premise → bottleneck → intervention → bet → outcome</code>, with
            directed edges (<code className="font-mono-meta">leads_to</code>,{' '}
            <code className="font-mono-meta">mitigates</code>,{' '}
            <code className="font-mono-meta">depends_on</code>,{' '}
            <code className="font-mono-meta">conflicts_with</code>).
          </li>
          <li>
            <strong className="text-[var(--ink-primary)]">Forked phrasings:</strong> Custom wording keeps a{' '}
            <code className="font-mono-meta">parent_concept_id</code> and shared{' '}
            <code className="font-mono-meta">root_concept_id</code> so comparisons still line up.
          </li>
          <li>
            <strong className="text-[var(--ink-primary)]">Credences &amp; update criteria:</strong> Exact{' '}
            <code className="font-mono-meta">%</code> numbers require a short note (10+ chars), and every published
            map requires at least one <code className="font-mono-meta">IF / THEN</code> update criterion.
          </li>
        </ul>
      </section>
    </main>
  );
}
