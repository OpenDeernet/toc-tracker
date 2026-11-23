import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  // Parse [label](https://...), **bold**, *italic*, `code` safely (zero raw HTML)
  const tokenRe = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] && m[3]) {
      out.push(
        <a
          key={k++}
          href={m[3]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[var(--ink-primary)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--ink-primary)]"
        >
          {m[2]}
        </a>
      );
    } else if (m[4]) {
      out.push(
        <strong key={k++} className="font-semibold text-[var(--ink-primary)]">
          {m[4]}
        </strong>
      );
    } else if (m[5]) {
      out.push(<em key={k++}>{m[5]}</em>);
    } else if (m[6]) {
      out.push(
        <code
          key={k++}
          className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono-meta text-[12px] text-[var(--ink-primary)]"
        >
          {m[6]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let paraBuf: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-[var(--ink-secondary)]">
        {renderInline(paraBuf.join(' '))}
      </p>
    );
    paraBuf = [];
  };

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={key++} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--ink-secondary)]">
        {listBuf.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      flushList();
      blocks.push(
        <h4 key={key++} className="pt-2 text-sm font-bold text-[var(--ink-primary)]">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push(
        <h3 key={key++} className="pt-3 font-editorial text-lg font-semibold text-[var(--ink-primary)]">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushPara();
      flushList();
      blocks.push(
        <h2 key={key++} className="pt-2 font-editorial text-xl font-semibold text-[var(--ink-primary)]">
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith('> ')) {
      flushPara();
      flushList();
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-[var(--border-strong)] pl-3.5 text-sm italic leading-relaxed text-[var(--ink-secondary)]"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      listBuf.push(line.replace(/^[-*]\s+/, ''));
    } else {
      flushList();
      paraBuf.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}
