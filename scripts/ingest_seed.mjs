import fs from 'fs';
import path from 'path';

const PROFILES_DIR = path.resolve('seed/profiles');
const OUT_FILE = path.resolve('seed/seed-bundle.json');

const NOW_ISO = '2026-11-22T18:00:00Z';

// 9 Near-Neighbor Root Clusters from seed/shared-phrases.md
// Each profile keeps its exact wording as a forked child concept pointing to these canonical roots!
const NEAR_NEIGHBOR_ROOTS = [
  {
    id: 'cpt_root_timelines',
    stage: 'premise',
    title: 'Transformative AI arrives soon',
    description: 'Cluster of claims about when transformative or catastrophic AI capabilities arrive.',
    tags: ['timelines', 'capabilities'],
    phrases: [
      'Transformative AI may come soon',
      'Powerful AI within a few years',
      'Catastrophic capability within years',
      'Worst-case risks arrive soon',
      'Transformative AI within decades',
      'Automated AI research arrives soon',
      'Capabilities are compounding very fast',
    ],
  },
  {
    id: 'cpt_root_racing',
    stage: 'premise',
    title: 'Competitive racing undermines safety',
    description: 'Cluster of claims that commercial or geopolitical competition drives unsafe deployment.',
    tags: ['race-dynamics', 'governance'],
    phrases: [
      'Racing likely means losing control',
      'Racing states risk losing control',
      'Racing labs underinvest in safety',
      'Low safety budgets, low will',
      'Race no one can exit',
      'Race beats safety inside companies',
      'Racing toward uncontrollable agentic AI',
      'Reckless race, but probably survivable',
      'The race is not a coordination problem',
    ],
  },
  {
    id: 'cpt_root_scheming',
    stage: 'premise',
    title: 'Advanced AI models may scheme or deceive',
    description: 'Cluster of claims about deceptive alignment, scheming, or eval-hiding emerging by default.',
    tags: ['scheming', 'alignment'],
    phrases: [
      'Rushed labs deploy possibly-scheming AIs',
      'Training by default produces schemers',
      'Default is a ruthless schemer',
      'Models already hide from tests',
      'Agents already deceive and self-preserve',
      'Cannot verify an AI isn\'t scheming',
    ],
  },
  {
    id: 'cpt_root_alignment_behind',
    stage: 'bottleneck',
    title: 'Alignment science lags capabilities',
    description: 'Cluster of claims that technical safety and alignment lag far behind frontier capability scaling.',
    tags: ['alignment', 'bottleneck'],
    phrases: [
      'Alignment research is far too slow',
      'Alignment science decades behind capabilities',
      'Safety science lags capabilities',
      'Racing leaves no time for alignment',
      'Capabilities outrun safety foundations',
      'No reliable way to make it safe',
      'No method gives high reliability',
    ],
  },
  {
    id: 'cpt_root_evidence_will',
    stage: 'bottleneck',
    title: 'Decision-makers lack trusted evidence & political will',
    description: 'Cluster of claims that leaders lack independent evidence, visibility, or political will to act.',
    tags: ['governance', 'evals'],
    phrases: [
      'Decision-makers lack trusted, independent evidence',
      'Safety claims are self-reported',
      'Ambiguous evidence, slow governments',
      'Weak political will, gray-zone evidence',
      'Low public salience of AI risk',
      'Leaders don\'t yet grasp it',
      'Political will lags the risk (past view, 2024 to early 2026)',
    ],
  },
  {
    id: 'cpt_root_outside_checks',
    stage: 'intervention',
    title: 'Independent third-party audits & evaluations',
    description: 'Cluster of interventions using independent outside evaluators and mandatory testing.',
    tags: ['evals', 'audits', 'governance'],
    phrases: [
      'Independent experts as a check',
      'Deep-access third-party frontier audits',
      'Independent evaluators embedded inside labs',
      'Evaluations that trigger safeguards',
      'Evaluate and restrict models before release',
    ],
  },
  {
    id: 'cpt_root_global_halt',
    stage: 'intervention',
    title: 'Enforced global halt or moratorium on frontier AI',
    description: 'International treaty or enforced ban halting frontier AI training until alignment is solved.',
    tags: ['pause', 'halt', 'governance'],
    phrases: [
      'Enforced global halt on frontier AI',
      'Enforced compute and datacenter limits',
      'Candid alarm plus ready treaty',
    ],
  },
  {
    id: 'cpt_root_pacing',
    stage: 'intervention',
    title: 'Deliberate pacing & export controls to buy time',
    description: 'Slowing frontier scaling via export controls, pacing agreements, or hardware thresholds without a full ban.',
    tags: ['pacing', 'governance', 'compute'],
    phrases: [
      'Verified US-China slowdown deal',
      'Pace the frontier, slow software too',
      'Buy time, then spend it',
      'Controls buy time, plus adaptation',
      'Liability plus hardware soft pause',
    ],
  },
  {
    id: 'cpt_root_centralization',
    stage: 'bottleneck',
    title: 'Safety plans risk centralizing power',
    description: 'Cluster of concerns about authoritarian lock-in, power concentration, and preserving human agency.',
    tags: ['pluralism', 'dacc', 'governance'],
    phrases: [
      'Safety plans centralize power',
      'Catastrophe fear drives centralization',
      'AI enables locked-in tyranny',
    ],
  },
  {
    id: 'cpt_root_talent',
    stage: 'bottleneck',
    title: 'Too few safety researchers, founders & institutions',
    description: 'Cluster of bottlenecks centered on human capital, organizations, and field capacity.',
    tags: ['field-building', 'talent'],
    phrases: [
      'Too few people and institutions',
      'Too few founders and organizations',
      'Too few safety researchers',
      'Too few auditors, weak demand',
    ],
  },
  {
    id: 'cpt_root_interp',
    stage: 'intervention',
    title: 'Mechanistic interpretability & white-box monitoring',
    description: 'Using model internals, probes, and reverse-engineering to detect misalignment.',
    tags: ['interpretability', 'alignment'],
    phrases: [
      'Interpretability as one defense layer',
    ],
  },
  {
    id: 'cpt_root_control',
    stage: 'intervention',
    title: 'AI Control protocols for untrusted models',
    description: 'Containment and monitoring protocols that stay safe even if models are misaligned.',
    tags: ['ai-control', 'alignment'],
    phrases: [
      'Control: safe even if misaligned',
    ],
  },
  {
    id: 'cpt_root_compute_gov',
    stage: 'intervention',
    title: 'Compute governance & hardware controls',
    description: 'Using chip tracking, export controls, and datacenter governance to oversee frontier AI.',
    tags: ['compute', 'governance'],
    phrases: [
      'Compute for visibility, allocation, enforcement',
      'Compute is the governable input',
    ],
  },
  {
    id: 'cpt_root_dacc',
    stage: 'intervention',
    title: 'Decentralized defensive technology (d/acc)',
    description: 'Accelerating open defensive technologies in bio, cyber, and coordination.',
    tags: ['dacc', 'defense'],
    phrases: [
      'Accelerate decentralized defensive technology',
      'Avert, diffuse, democratize',
      'Delay, detect, defend physically',
    ],
  },
  {
    id: 'cpt_root_lab_race_top',
    stage: 'intervention',
    title: 'Voluntary lab leadership & race-to-the-top',
    description: 'Leading frontier labs voluntarily setting higher safety standards for peers to copy.',
    tags: ['rsp', 'labs'],
    phrases: [
      'Race to the top from frontier',
      'Cheap safety, exported industry-wide',
    ],
  },
];

// Keyword matchers to link Rejected paths onto canonical intervention/premise roots for rich Disagreements!
const REJECTED_MATCHERS = [
  { rootId: 'cpt_root_global_halt', stage: 'intervention', regex: /\b(pause|halt|full stop|moratorium|ban|stopping|shut it all down)\b/i },
  { rootId: 'cpt_root_interp', stage: 'intervention', regex: /\b(interpretability|reverse-engineering|sparse autoencoder|sae|mech interp)\b/i },
  { rootId: 'cpt_root_control', stage: 'intervention', regex: /\b(ai control|containment|untrusted monitoring|empirical safety|patching|rlhf)\b/i },
  { rootId: 'cpt_root_compute_gov', stage: 'intervention', regex: /\b(hardware|chip|export control|compute governance|on-chip|flexheg)\b/i },
  { rootId: 'cpt_root_lab_race_top', stage: 'intervention', regex: /\b(voluntary|self-regulat|changing a lab from the inside|race to the top|responsible scaling|rsp|internal safety team|frontier lab)\b/i },
  { rootId: 'cpt_root_dacc', stage: 'intervention', regex: /\b(d\/acc|defensive|open weights|open-source|decentraliz)\b/i },
  { rootId: 'cpt_root_centralization', stage: 'bottleneck', regex: /\b(single global|centraliz|monopoly|world government|us-led hegemony|nationaliz)\b/i },
  { rootId: 'cpt_root_outside_checks', stage: 'intervention', regex: /\b(black-box eval|behavioral eval|audit|third-party eval)\b/i },
];

const ORG_HANDLES = new Set([
  'metr-beth-barnes',
  'miri-nate-soares',
  'constellation',
  'catalyze-impact',
  'coefficient-giving',
  'mats-ryan-kidd',
  'buck-shlegeris-redwood',
]);

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function initialsOf(name) {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const parts = clean.split(/[\s,/]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncateClean(str, max) {
  const s = (str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.55 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[,;:\-–—\s]+$/, '') + '…';
}

function cleanRole(raw) {
  if (!raw) return 'AI Safety Researcher';
  // Remove "(source: ...)" and trailing parenthetical citations
  let r = raw.replace(/\s*\(source:[\s\S]*$/i, '').replace(/\s*\(https?:\/\/[^)]*\)/g, '').trim();
  // Keep first sentence only
  const firstSent = r.split(/\.\s+(?=[A-Z])/)[0].trim();
  return truncateClean(firstSent.replace(/\.$/, ''), 120);
}

function extractUrlsAndQuotes(text) {
  const citations = [];
  const seenUrls = new Set();

  // Match markdown links [Label](url)
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = mdLinkRe.exec(text)) !== null) {
    const url = m[2].replace(/[.,;)]+$/, '');
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      citations.push({ label: m[1].slice(0, 48), url, quote: null });
    }
  }

  // Match bare URLs
  const bareUrlRe = /(https?:\/\/[^\s)>"']+)/g;
  while ((m = bareUrlRe.exec(text)) !== null) {
    const url = m[1].replace(/[.,;)]+$/, '');
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      let label = 'Source';
      try {
        label = new URL(url).hostname.replace(/^www\./, '');
      } catch {}
      citations.push({ label, url, quote: null });
    }
  }

  // Extract first substantial quoted passage ("...")
  const quoteMatch = text.match(/"([^"]{18,280})"/);
  if (quoteMatch && citations.length > 0) {
    citations[0].quote = quoteMatch[1].trim();
  }

  return citations.slice(0, 3);
}

function parseConfidence(text) {
  const lower = (text || '').toLowerCase();
  // Look for explicit band keywords
  if (/\bvery\s+high\b/.test(lower)) return 'very_high';
  if (/\bvery\s+low\b/.test(lower)) return 'very_low';
  if (/\bhigh\b/.test(lower)) return 'high';
  if (/\blow\b/.test(lower)) return 'low';
  if (/\bmedium\b/.test(lower)) return 'medium';
  return 'high';
}

function parseCampTag(camp) {
  const l = (camp || '').toLowerCase();
  if (l.includes('technical')) return 'technical-alignment';
  if (l.includes('eval')) return 'evals-and-governance';
  if (l.includes('policy') || l.includes('governance')) return 'policy-and-governance';
  if (l.includes('funder') || l.includes('field')) return 'field-building';
  if (l.includes('defens') || l.includes('multipolar') || l.includes('d/acc')) return 'defensive-tech';
  if (l.includes('pause') || l.includes('halt') || l.includes('advocacy')) return 'pause-and-halt';
  return slugify(camp || 'ai-safety').replace(/_/g, '-');
}

function splitSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = { _header: [] };
  let current = '_header';
  for (const line of lines) {
    const hm = line.match(/^##\s+(.+)$/);
    if (hm) {
      current = hm[1].trim().toLowerCase();
      sections[current] = [];
    } else {
      sections[current].push(line);
    }
  }
  return sections;
}

function findSection(sections, ...prefixes) {
  for (const [k, v] of Object.entries(sections)) {
    if (k.includes('notes for our review')) continue; // NEVER leak internal review notes!
    for (const p of prefixes) {
      if (k.includes(p)) return v.join('\n').trim();
    }
  }
  return '';
}

function parseChainNodes(chainText) {
  const stageHeaders = [
    { stage: 'premise', re: /^(?:\*\*)?1\.\s*Premise\b/i },
    { stage: 'bottleneck', re: /^(?:\*\*)?2\.\s*Bottleneck\b/i },
    { stage: 'intervention', re: /^(?:\*\*)?3\.\s*Intervention\b/i },
    { stage: 'bet', re: /^(?:\*\*)?4\.\s*(?:Concrete\s+)?Bet\b/i },
    { stage: 'outcome', re: /^(?:\*\*)?5\.\s*(?:Target\s+)?Outcome\b/i },
  ];

  const lines = chainText.split(/\r?\n/);
  let currentStage = null;
  const rawNodes = [];
  let currentNode = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check stage header
    let matchedStage = null;
    for (const sh of stageHeaders) {
      if (sh.re.test(trimmed)) {
        matchedStage = sh.stage;
        break;
      }
    }
    if (matchedStage) {
      currentStage = matchedStage;
      currentNode = null;
      continue;
    }
    if (!currentStage) continue;

    // Format A: "- Node: Title" / "- Node 2: Title" / "- Node A: Title" / "- Second node: Title"
    const fmtA = trimmed.match(/^-\s*(?:Node(?:\s+[A-Z0-9]+)?|Second node|Third node)\s*:\s*(.+)$/i);
    if (fmtA) {
      currentNode = {
        stage: currentStage,
        title: fmtA[1].replace(/\*\*/g, '').replace(/\.$/, '').trim(),
        sentence: '',
        confidenceText: '',
        evidenceText: '',
      };
      rawNodes.push(currentNode);
      continue;
    }

    // Format B (metr-beth-barnes.md): "- **Title.** Confidence: High (our reading)."
    const fmtB = rawLine.match(/^-\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (fmtB) {
      currentNode = {
        stage: currentStage,
        title: fmtB[1].replace(/\.$/, '').trim(),
        sentence: '',
        confidenceText: fmtB[2] || '',
        evidenceText: '',
      };
      rawNodes.push(currentNode);
      continue;
    }

    if (!currentNode) continue;

    const sentMatch = trimmed.match(/^-\s*In a sentence\s*:\s*(.+)$/i);
    if (sentMatch) {
      currentNode.sentence = sentMatch[1].trim();
      continue;
    }
    const confMatch = trimmed.match(/^-\s*Confidence\s*:\s*(.+)$/i);
    if (confMatch) {
      currentNode.confidenceText = confMatch[1].trim();
      continue;
    }
    const evMatch = trimmed.match(/^-\s*(?:Evidence|Source)\s*:\s*(.+)$/i);
    if (evMatch) {
      currentNode.evidenceText += ' ' + evMatch[1].trim();
      continue;
    }
    // Nested sub-bullets in Format B
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2).trim();
      if (!currentNode.sentence && !content.startsWith('"')) {
        currentNode.sentence = content;
      } else {
        currentNode.evidenceText += ' ' + content;
      }
    }
  }

  return rawNodes;
}

function parseSourceReferences(text) {
  if (!text) return [];
  const refs = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cleaned = line.replace(/^(?:\d+\.\s+|-\s+)/, '').trim();
    const urlMatch = cleaned.match(/(https?:\/\/[^\s),>"']+)/);
    if (!urlMatch) continue;
    const url = urlMatch[1].replace(/[.,;)]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);

    // Title is text before the URL (or markdown link label)
    let title = '';
    const mdLink = cleaned.match(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/);
    if (mdLink) {
      title = mdLink[1].trim();
    } else {
      title = cleaned
        .slice(0, cleaned.indexOf(urlMatch[0]))
        .replace(/^["'\s]+|["',\s—–:-]+$/g, '')
        .replace(/\*\*/g, '')
        .trim();
    }
    if (!title || title.length < 3) {
      try {
        title = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        title = 'Source';
      }
    }

    // Extract optional quote/context note from "Best line:" or trailing text
    const afterUrl = cleaned.slice(cleaned.indexOf(urlMatch[0]) + urlMatch[0].length);
    const bestLine = afterUrl.match(/Best(?:\s+crux)?\s+line[^:]*:\s*(.+)$/i);
    let note = null;
    if (bestLine) {
      note = truncateClean(
        bestLine[1].replace(/\(https?:\/\/[^)]+\)/g, '').replace(/\s+/g, ' ').trim(),
        220
      );
    }

    refs.push({
      title: truncateClean(title, 110),
      url,
      note,
    });
    if (refs.length >= 8) break;
  }
  return refs;
}

function parseRejectedPaths(text) {
  if (!text) return [];
  const items = [];
  const lines = text.split(/\r?\n/);
  let cur = null;
  for (const rawLine of lines) {
    const mNum = rawLine.match(/^\s*\d+\.\s+(.+)$/);
    const mBul = rawLine.match(/^-\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (mNum) {
      if (cur) items.push(cur);
      cur = { raw: mNum[1].trim(), extra: '' };
    } else if (mBul) {
      if (cur) items.push(cur);
      cur = { raw: `${mBul[1].trim()}. ${mBul[2].trim()}`, extra: '' };
    } else if (cur && rawLine.trim()) {
      cur.extra += ' ' + rawLine.trim();
    }
  }
  if (cur) items.push(cur);

  return items
    .filter((it) => !/^none\b/i.test(it.raw) && !/^not publicly stated/i.test(it.raw))
    .slice(0, 3)
    .map((it) => {
      const full = `${it.raw} ${it.extra}`.trim();
      const firstSentence = it.raw.replace(/\*\*/g, '').split(/\.\s+/)[0].replace(/\.$/, '').trim();
      const rest = it.raw.replace(/\*\*/g, '').slice(firstSentence.length).replace(/^\.\s*/, '').trim();
      const citations = extractUrlsAndQuotes(full);
      return {
        title: truncateClean(firstSentence, 110),
        note: truncateClean((rest || firstSentence).replace(/\(https?:\/\/[^)]+\)/g, ''), 260),
        citations,
      };
    });
}

function parseUpdateCriteria(text, nodes) {
  const criteria = [];
  const lines = (text || '').split(/\r?\n/);
  const cruxNode = nodes.find((n) => n.is_load_bearing_crux) ?? nodes.find((n) => n.stage === 'intervention');

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, '').trim();
    const m = clean.match(/^-\s*.*?IF\s+(.+?),?\s+THEN\s+(.+)$/i);
    if (m) {
      const trigger = m[1].trim().replace(/\.$/, '');
      const rest = m[2].trim();
      // Split pivot action from trailing quotes/citations
      const pivotOnly = rest.split(/\.\s+"|\s+"|\s+\(https?:\/\//)[0].replace(/\.$/, '').trim();
      const cits = extractUrlsAndQuotes(rest);
      const tfMatch = trigger.match(/\b(by\s+(?:20\d\d|Q[1-4]\s+20\d\d)|within\s+\d+\s+(?:months|years))\b/i);
      if (trigger.length >= 6 && pivotOnly.length >= 6) {
        criteria.push({
          id: `uc_${criteria.length + 1}`,
          target_local_id: cruxNode ? cruxNode.local_id : null,
          trigger: truncateClean(trigger, 240),
          timeframe: tfMatch ? tfMatch[1] : null,
          pivot_action: truncateClean(pivotOnly, 240),
          status: 'watching',
          evidence_urls: cits.map((c) => c.url),
        });
      }
    }
  }

  if (criteria.length === 0) {
    const urls = extractUrlsAndQuotes(text || '').map((c) => c.url);
    criteria.push({
      id: 'uc_1',
      target_local_id: cruxNode ? cruxNode.local_id : null,
      trigger: 'No explicit IF/THEN pivot trigger publicly stated in reviewed sources',
      timeframe: null,
      pivot_action: 'Claim this profile to state what evidence would change your mind or bet',
      status: 'watching',
      evidence_urls: urls,
    });
  }

  return criteria.slice(0, 4);
}

// Build concept registry
const conceptsById = new Map();
const phraseToConceptId = new Map(); // `${stage}::${lowerTitle}` -> id
const phraseToRoot = new Map(); // lowerPhrase -> rootId

// 1. Register canonical Near-Neighbor root concepts
for (const root of NEAR_NEIGHBOR_ROOTS) {
  conceptsById.set(root.id, {
    schema_version: 1,
    id: root.id,
    stage: root.stage,
    title: root.title,
    description: root.description,
    parent_concept_id: null,
    root_concept_id: root.id,
    tags: root.tags,
    created_by_actor_id: null,
    arweave_tx_id: `seed_tx_${root.id}`,
    created_at: NOW_ISO,
  });
  phraseToConceptId.set(`${root.stage}::${root.title.toLowerCase()}`, root.id);
  for (const p of root.phrases) {
    phraseToRoot.set(`${root.stage}::${p.toLowerCase()}`, root.id);
  }
}

function getOrCreateConcept(stage, title, description, tags) {
  const cleanTitle = title.trim();
  const key = `${stage}::${cleanTitle.toLowerCase()}`;
  if (phraseToConceptId.has(key)) {
    return phraseToConceptId.get(key);
  }

  const id = `cpt_${stage.slice(0, 3)}_${slugify(cleanTitle)}`;
  if (conceptsById.has(id)) {
    phraseToConceptId.set(key, id);
    return id;
  }

  // Link to canonical near-neighbor root only when stage matches (prevents cross-column mismatches)
  const parentRoot = phraseToRoot.get(`${stage}::${cleanTitle.toLowerCase()}`) || null;
  const rootId = parentRoot || id;

  conceptsById.set(id, {
    schema_version: 1,
    id,
    stage,
    title: truncateClean(cleanTitle, 130),
    description: truncateClean(description || '', 320),
    parent_concept_id: parentRoot,
    root_concept_id: rootId,
    tags: tags || [],
    created_by_actor_id: null,
    arweave_tx_id: `seed_tx_${id}`,
    created_at: NOW_ISO,
  });
  phraseToConceptId.set(key, id);
  return id;
}

const actors = [];
const snapshots = [];

const DISPLAY_NAME_OVERRIDES = {
  'buck-shlegeris-redwood': 'Redwood Research (Buck Shlegeris)',
  'catalyze-impact': 'Catalyze Impact',
  'coefficient-giving': 'Coefficient Giving',
  'constellation': 'Constellation Institute',
  'dan-hendrycks': 'Dan Hendrycks',
  'daniel-kokotajlo': 'Daniel Kokotajlo',
  'dario-amodei': 'Dario Amodei',
  'eli-lifland': 'Eli Lifland',
  'eliezer-yudkowsky': 'Eliezer Yudkowsky',
  'ethan-mollick': 'Ethan Mollick',
  'helen-toner': 'Helen Toner',
  'holden-karnofsky': 'Holden Karnofsky',
  'jaan-tallinn': 'Jaan Tallinn',
  'kevin-esvelt': 'Kevin Esvelt',
  'lennart-heim': 'Lennart Heim',
  'luke-drago-rudolf-laine': 'Luke Drago & Rudolf Laine',
  'marius-hobbhahn': 'Marius Hobbhahn',
  'mats-ryan-kidd': 'MATS (Ryan Kidd)',
  'metr-beth-barnes': 'METR (Beth Barnes)',
  'michael-dickens': 'Michael Dickens',
  'miles-brundage': 'Miles Brundage',
  'miri-nate-soares': 'MIRI (Nate Soares)',
  'neel-nanda': 'Neel Nanda',
  'steven-byrnes': 'Steven Byrnes',
  'vitalik-buterin': 'Vitalik Buterin',
  'yoshua-bengio': 'Yoshua Bengio',
};

const files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.md')).sort();

for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
  const fname = files[fileIdx];
  const handle = fname.replace(/\.md$/, '');
  const md = fs.readFileSync(path.join(PROFILES_DIR, fname), 'utf8');
  const sections = splitSections(md);
  const headerText = sections._header.join('\n');

  const h1Match = headerText.match(/^#\s+(.+)$/m);
  const displayName = DISPLAY_NAME_OVERRIDES[handle] || (h1Match ? h1Match[1].replace(/\s*\(.*?\)\s*$/, '').trim() : handle);

  const campMatch = headerText.match(/(?:^|\n)(?:-\s*\*\*)?Camp(?:\*\*)?:\s*(.+)/i);
  const camp = campMatch ? campMatch[1].replace(/\*\*/g, '').trim() : 'AI Safety';
  const campTag = parseCampTag(camp);

  const roleMatch = headerText.match(/(?:^|\n)(?:-\s*\*\*)?Role today(?:\*\*)?:\s*(.+)/i);
  let role = roleMatch ? cleanRole(roleMatch[1]) : '';
  if (!role) {
    // Format B (metr-beth-barnes.md): "- **Name / Org / X handle / URL:** Beth Barnes, Founder and CEO / METR / ..."
    const altMatch = headerText.match(/Name \/ Org \/ X handle \/ URL:\*\*\s*([^/\n]+)/i);
    role = altMatch ? altMatch[1].trim() : camp;
  }

  const urlMatch = headerText.match(/(?:^|\n)(?:-\s*\*\*)?URL(?:\*\*)?:\s*.*?(https?:\/\/[^\s),]+)/i)
    || headerText.match(/(https?:\/\/[^\s),]+)/);
  const bioUrl = urlMatch ? urlMatch[1].replace(/[.,;)]+$/, '') : null;

  // Only set verified_handle if confirmed (NOT "not found" / "unverified")
  const xLine = headerText.match(/(?:^|\n)X handle:\s*(.+)/i)?.[1] || '';
  const xFound = !/not found|unverified/i.test(xLine) ? xLine.match(/@[A-Za-z0-9_]+/)?.[0] || null : null;

  const tldr = findSection(sections, 'tl;dr').replace(/\s+/g, ' ').trim();
  const chainText = findSection(sections, 'chain');
  const cruxText = findSection(sections, 'crux');
  const rejectedText = findSection(sections, 'rejected');
  const updateText = findSection(sections, 'update criteria');
  const viewChangesText = findSection(sections, 'view changes');
  const sourcesText = findSection(sections, 'sources');

  const rawChain = parseChainNodes(chainText);
  const fallbackSources = extractUrlsAndQuotes(sourcesText);
  const sourceRefs = parseSourceReferences(sourcesText);
  const oneLineStance = tldr
    ? truncateClean(tldr.split(/\.\s+(?=[A-Z])/)[0].replace(/\.$/, ''), 190)
    : null;

  const actorId = `act_${slugify(handle)}`;
  const snapshotId = `snp_${slugify(handle)}_v1`;

  // Determine crux stage from ## Crux section
  let cruxStage = 'intervention';
  if (/\bbottleneck\b/i.test(cruxText.slice(0, 120))) cruxStage = 'bottleneck';
  else if (/\bpremise\b/i.test(cruxText.slice(0, 120))) cruxStage = 'premise';
  else if (/\bbet\b/i.test(cruxText.slice(0, 120))) cruxStage = 'bet';

  const nodes = [];
  let markedCrux = false;

  rawChain.forEach((rn, idx) => {
    const cid = getOrCreateConcept(rn.stage, rn.title, rn.sentence, [campTag]);
    const localId = `n_${rn.stage}_${idx}`;
    const cits = extractUrlsAndQuotes(rn.evidenceText);
    const needsCred = rn.stage === 'premise' || rn.stage === 'bottleneck' || rn.stage === 'intervention';
    const band = parseConfidence(rn.confidenceText);

    const isCrux = !markedCrux && rn.stage === cruxStage;
    if (isCrux) markedCrux = true;

    let note = rn.sentence || null;
    if (isCrux && cruxText) {
      const cruxLead = truncateClean(
        cruxText
          .replace(/\*\*/g, '')
          .replace(/\(https?:\/\/[^)]+\)/g, '')
          .split(/\n/)[0],
        260
      );
      if (cruxLead && (!note || cruxLead.length > note.length)) {
        note = cruxLead;
      }
    }

    nodes.push({
      local_id: localId,
      concept_id: cid,
      stage: rn.stage,
      stance: 'active',
      is_load_bearing_crux: isCrux,
      credence: needsCred
        ? {
            mode: 'qualitative',
            band,
            percent: null,
            percent_range: null,
            numeric_rationale: null,
          }
        : null,
      bet_priority: rn.stage === 'bet' ? (nodes.some((n) => n.stage === 'bet') ? 'secondary' : 'primary') : null,
      note,
      citations: cits.length > 0 ? cits : idx === 0 ? fallbackSources.slice(0, 1) : [],
    });
  });

  // Fallback crux marker if stage didn't exist
  if (!markedCrux && nodes.length > 0) {
    const pick = nodes.find((n) => n.stage === 'intervention') || nodes[0];
    pick.is_load_bearing_crux = true;
  }

  // Wire sequential causal edges across the 5 stages cleanly
  const stagesOrder = ['premise', 'bottleneck', 'intervention', 'bet', 'outcome'];
  const edges = [];
  for (let si = 0; si < stagesOrder.length - 1; si++) {
    const srcs = nodes.filter((n) => n.stage === stagesOrder[si] && n.stance === 'active');
    const tgts = nodes.filter((n) => n.stage === stagesOrder[si + 1] && n.stance === 'active');
    const rel =
      stagesOrder[si + 1] === 'intervention'
        ? 'mitigates'
        : stagesOrder[si + 1] === 'bet'
          ? 'depends_on'
          : 'leads_to';
    for (const s of srcs) {
      for (const t of tgts) {
        edges.push({
          id: `e_${s.local_id}_${t.local_id}`,
          source_local_id: s.local_id,
          target_local_id: t.local_id,
          relation: rel,
          note: null,
        });
      }
    }
  }

  // Parse Rejected / Deprioritized paths and link them to canonical roots where possible!
  const rejectedItems = parseRejectedPaths(rejectedText);
  const usedRejectedRoots = new Set(nodes.map((n) => conceptsById.get(n.concept_id)?.root_concept_id));
  rejectedItems.forEach((rj, idx) => {
    let matchedRoot = null;
    let stage = 'intervention';
    for (const rm of REJECTED_MATCHERS) {
      if (rm.regex.test(`${rj.title} ${rj.note}`)) {
        if (!usedRejectedRoots.has(rm.rootId)) {
          matchedRoot = rm.rootId;
          stage = rm.stage;
          usedRejectedRoots.add(rm.rootId);
          break;
        }
      }
    }

    let conceptId;
    if (matchedRoot) {
      // Create a forked phrasing concept pointing to the canonical root so their exact wording is preserved AND Disagreements aggregate!
      const forkId = `cpt_rej_${slugify(handle)}_${idx}`;
      conceptsById.set(forkId, {
        schema_version: 1,
        id: forkId,
        stage,
        title: rj.title,
        description: rj.note,
        parent_concept_id: matchedRoot,
        root_concept_id: matchedRoot,
        tags: [campTag],
        created_by_actor_id: actorId,
        arweave_tx_id: `seed_tx_${forkId}`,
        created_at: NOW_ISO,
      });
      conceptId = forkId;
    } else {
      conceptId = getOrCreateConcept('intervention', rj.title, rj.note, [campTag]);
    }

    nodes.push({
      local_id: `n_rej_${idx}`,
      concept_id: conceptId,
      stage,
      stance: 'rejected',
      is_load_bearing_crux: false,
      credence: {
        mode: 'qualitative',
        band: 'low',
        percent: null,
        percent_range: null,
        numeric_rationale: null,
      },
      bet_priority: null,
      note: rj.note,
      citations: rj.citations,
    });
  });

  // Ensure at least 1 citation exists on community draft for validation
  const totalCitations = nodes.reduce((acc, n) => acc + n.citations.length, 0);
  if (totalCitations === 0 && nodes.length > 0 && bioUrl) {
    nodes[0].citations.push({ label: 'Public Profile', url: bioUrl, quote: null });
  }

  const updateCriteria = parseUpdateCriteria(updateText, nodes);

  // Extract concise changelog note from View changes
  const viewChangesClean = truncateClean(
    viewChangesText
      .replace(/\(https?:\/\/[^)]+\)/g, '')
      .replace(/\*\*/g, '')
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 12)
      .slice(0, 2)
      .join(' '),
    280
  );

  // Stagger created_at slightly so flagship profiles appear cleanly ordered
  const createdDate = new Date(Date.parse(NOW_ISO) - fileIdx * 3600 * 1000).toISOString();

  actors.push({
    id: actorId,
    handle,
    display_name: displayName,
    kind: ORG_HANDLES.has(handle) ? 'organization' : 'individual',
    role_or_affiliation: role,
    one_line_stance: oneLineStance,
    contact_preference: null,
    essay_markdown: null,
    references: sourceRefs,
    bio_url: bioUrl,
    avatar_initials: initialsOf(displayName),
    authorship_status: 'community_draft',
    owner_user_id: null,
    verified_provider: null,
    verified_handle: xFound,
    arweave_pubkey: null,
    primary_snapshot_id: snapshotId,
    tags: [campTag],
    created_at: createdDate,
  });

  snapshots.push({
    schema_version: 1,
    id: snapshotId,
    actor_id: actorId,
    version: 1,
    previous_snapshot_id: null,
    authorship_mode: 'community_draft',
    summary: tldr || `${displayName}'s Theory of Change for AI Safety.`,
    changelog_note:
      viewChangesClean ||
      'Best guess drafted from public writing and interviews (Nov 2026). Not yet reviewed by author.',
    nodes,
    edges,
    update_criteria: updateCriteria,
    omissions: [],
    published_at: createdDate,
    arweave_tx_id: `seed_ar_${slugify(handle)}_v1`,
  });
}

// Build 6 real starter archetypes from flagship profiles
const archetypeSpecs = [
  { id: 'arch_interp', handle: 'neel-nanda', name: 'Pragmatic Interpretability', tagline: 'Cheap probes, model forensics & eval-awareness suppression as defense-in-depth' },
  { id: 'arch_control', handle: 'buck-shlegeris-redwood', name: 'AI Control', tagline: 'Containment & monitoring protocols that stay safe even if models scheme' },
  { id: 'arch_evals', handle: 'metr-beth-barnes', name: 'Frontier Evals & Safeguards', tagline: 'Independent autonomy measurements triggering binding safety gates' },
  { id: 'arch_compute_gov', handle: 'lennart-heim', name: 'Compute Governance', tagline: 'Compute visibility, allocation & enforcement to buy time' },
  { id: 'arch_pause', handle: 'miri-nate-soares', name: 'Global Halt / Pause', tagline: 'Enforced global pause on frontier training until alignment is solved' },
  { id: 'arch_dacc', handle: 'vitalik-buterin', name: 'd/acc & Defensive Tech', tagline: 'Decentralized defensive tech & pluralism against both catastrophe and lock-in' },
];

const archetypes = archetypeSpecs
  .map((spec) => {
    const actor = actors.find((a) => a.handle === spec.handle);
    const snap = actor && snapshots.find((s) => s.id === actor.primary_snapshot_id);
    if (!actor || !snap) return null;
    return {
      id: spec.id,
      name: spec.name,
      tagline: spec.tagline,
      tags: actor.tags,
      summary: snap.summary,
      nodes: snap.nodes,
      edges: snap.edges,
      update_criteria: snap.update_criteria,
    };
  })
  .filter(Boolean);

// Ensure canonical root concepts always come BEFORE forked children (for Postgres FK ordering!)
const sortedConcepts = Array.from(conceptsById.values()).sort((a, b) => {
  const aChild = a.parent_concept_id ? 1 : 0;
  const bChild = b.parent_concept_id ? 1 : 0;
  return aChild - bChild;
});

const bundle = {
  concepts: sortedConcepts,
  actors,
  snapshots,
  attestations: [],
  archetypes,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2));
console.log(
  `Generated ${OUT_FILE}: ${bundle.actors.length} actors, ${bundle.snapshots.length} snapshots, ${bundle.concepts.length} concepts (${bundle.concepts.filter((c) => c.parent_concept_id).length} linked forks), ${bundle.archetypes.length} archetypes.`
);
for (const a of bundle.actors) {
  const s = bundle.snapshots.find((x) => x.id === a.primary_snapshot_id);
  const active = s.nodes.filter((n) => n.stance === 'active').length;
  const rej = s.nodes.filter((n) => n.stance === 'rejected').length;
  console.log(
    `  - ${a.handle.padEnd(28)} | active: ${String(active).padStart(2)} | rejected: ${rej} | criteria: ${s.update_criteria.length} | ${a.display_name}`
  );
}
