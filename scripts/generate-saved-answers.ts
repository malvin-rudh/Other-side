// Generates saved Qwen answer plans for the three registered theses at the three
// review dates and writes accepted plans to public/data/sini/ai/{date}/{thesisId}.json.
// Each item builds the same facts and approved claims as the live screen for that
// session date, so a 24 Aug answer never sees a 23 Sep fact bundle. Credentials come
// from .env (gitignored), never from flags, commits or printed output. One Qwen call
// per item, no retries; items that fail validation are reported as blockers.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApprovedClaims, type ApprovedClaimsDocument } from '../src/ai/claims';
import { buildPlannerPrompt } from '../src/ai/plannerPrompt';
import { loadSavedPlan, serializeSavedPlan, type SavedPlanMeta } from '../src/ai/savedPlans';
import { THESIS_QUESTION_ID } from '../src/ai/thesisView';
import { validateModelResponse } from '../src/ai/validate';
import { createRequestId } from '../src/engine/context';
import { buildFacts, type FactsContext } from '../src/engine/facts';
import { sessionAvailableAt } from '../src/engine/predicates';
import {
  validateBrokersDocument,
  validateEventsDocument,
  validateRowsDocument,
  validateSessionManifest,
  type BrokerProfile,
  type BrokersDocument,
  type EventsDocument,
  type NormalizedBrokerRow,
  type RowsDocument,
  type SessionManifest,
  type SessionSummary,
  type SiniEvent,
} from '../src/data/schemas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICKER = 'SINI';
const DATES = ['2026-08-24', '2026-09-03', '2026-09-23'] as const;

interface LoadedData {
  rows: NormalizedBrokerRow[];
  sessions: SessionSummary[];
  defaultWindow: { start: string; end: string };
  brokers: BrokerProfile[];
  events: SiniEvent[];
  versions: { data: string; taxonomy: string; claims: string };
}

async function loadEnv(file: string): Promise<Record<string, string>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

async function loadDataFromDisk(ticker: string): Promise<LoadedData> {
  const base = path.join(ROOT, 'public', 'data');
  const [rowsRaw, sessionsRaw, brokersRaw, eventsRaw] = await Promise.all([
    readFile(path.join(base, ticker.toLowerCase(), 'rows.json'), 'utf8'),
    readFile(path.join(base, ticker.toLowerCase(), 'sessions.json'), 'utf8'),
    readFile(path.join(base, 'brokers.json'), 'utf8'),
    readFile(path.join(base, ticker.toLowerCase(), 'events.json'), 'utf8'),
  ]);
  const rowsDoc = JSON.parse(rowsRaw) as unknown;
  const sessionsDoc = JSON.parse(sessionsRaw) as unknown;
  const brokersDoc = JSON.parse(brokersRaw) as unknown;
  const eventsDoc = JSON.parse(eventsRaw) as unknown;
  if (!validateRowsDocument(rowsDoc)) throw new Error('rows.json failed schema validation');
  if (!validateSessionManifest(sessionsDoc)) throw new Error('sessions.json failed schema validation');
  if (!validateBrokersDocument(brokersDoc)) throw new Error('brokers.json failed schema validation');
  if (!validateEventsDocument(eventsDoc)) throw new Error('events.json failed schema validation');
  const rows = (rowsDoc as RowsDocument).rows;
  const sessions = (sessionsDoc as SessionManifest).sessions;
  const brokers = (brokersDoc as BrokersDocument).brokers;
  const events = (eventsDoc as EventsDocument).events;
  if (
    (rowsDoc as RowsDocument).ticker !== ticker ||
    (sessionsDoc as SessionManifest).ticker !== ticker ||
    (eventsDoc as EventsDocument).ticker !== ticker
  ) {
    throw new Error(`data ticker mismatch for ${ticker}`);
  }
  return {
    rows,
    sessions,
    defaultWindow: (sessionsDoc as SessionManifest).defaultWindow,
    brokers,
    events,
    versions: {
      data: (sessionsDoc as SessionManifest).dataVersion,
      taxonomy: (brokersDoc as BrokersDocument).version,
      claims: (eventsDoc as EventsDocument).version,
    },
  };
}

function buildPrompt(approved: ApprovedClaimsDocument, questionId: string, requestId: string): string {
  const question = approved.questions[questionId];
  if (!question) throw new Error(`question ${questionId} not in the approved registry`);
  return buildPlannerPrompt({
    approved,
    questionText: question.text.en,
    followUpIds: question.follow_up_ids,
    requestId,
  });
}

interface QwenResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

async function callQwen(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<QwenResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You plan answers strictly from a reviewed claim registry.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Qwen request failed with HTTP ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') throw new Error('Qwen returned an empty answer');
  return {
    content,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Qwen answer contains no JSON object');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

const diskFetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const rel = url.replace(/^\//, '');
  const body = await readFile(path.join(ROOT, rel), 'utf8');
  return new Response(body, { status: 200 });
}) as typeof fetch;

function reviewLines(approved: ApprovedClaimsDocument, response: { claims: { claim_id: string; wording_variant: 'short' | 'explained' }[] }): string[] {
  return response.claims.map((ref) => {
    const claim = approved.claims.find((entry) => entry.claim_id === ref.claim_id);
    if (!claim) return `  - ${ref.claim_id} (${ref.wording_variant}): not found`;
    const parts = claim.parts[ref.wording_variant].en;
    const text = parts && parts.length > 0
      ? parts.map((part) => part.text).join('')
      : claim.wording[ref.wording_variant].en;
    return `  - ${ref.claim_id} (${ref.wording_variant}): ${text}`;
  });
}

async function main(): Promise<void> {
  const env = await loadEnv(path.join(ROOT, '.env'));
  const apiKey = env.QWEN_API_KEY ?? '';
  const baseUrl = (env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const model = env.QWEN_MODEL ?? 'qwen-plus';

  const data = await loadDataFromDisk(TICKER);
  const written: string[] = [];
  const blockers: string[] = [];

  for (const sessionDate of DATES) {
    const context: FactsContext = {
      ticker: TICKER,
      sessionDate,
      cutoffAt: sessionAvailableAt(sessionDate),
      periodStart: data.defaultWindow.start,
      periodEnd: data.defaultWindow.end,
      scenario: 'default',
      locale: 'en',
      dataVersion: data.versions.data,
      taxonomyVersion: data.versions.taxonomy,
      claimVersion: data.versions.claims,
    };
    const approved = buildApprovedClaims(context, buildFacts(context, data));

    for (const thesisId of Object.keys(THESIS_QUESTION_ID)) {
      const label = `${sessionDate} ${thesisId}`;
      try {
        if (apiKey === '') throw new Error('QWEN_API_KEY is missing in .env');
        const questionId = THESIS_QUESTION_ID[thesisId];
        if (!questionId) throw new Error(`no curated question registered for ${thesisId}`);
        const requestId = createRequestId();
        const prompt = buildPrompt(approved, questionId, requestId);
        const qwen = await callQwen(baseUrl, apiKey, model, prompt);
        const response = extractJson(qwen.content);
        const validated = validateModelResponse({
          response,
          expectedContextKey: approved.contextKey,
          latestRequestId: requestId,
          approved,
          cutoffAt: context.cutoffAt,
        });
        if (!validated.ok) throw new Error(`validator rejected the plan: ${validated.reason}`);

        const meta: SavedPlanMeta = {
          questionId,
          thesisId,
          context: {
            sessionDate: context.sessionDate,
            cutoffAt: context.cutoffAt,
            periodStart: context.periodStart,
            periodEnd: context.periodEnd,
            scenario: context.scenario,
            dataVersion: context.dataVersion,
            taxonomyVersion: context.taxonomyVersion,
            claimVersion: context.claimVersion,
          },
          model: {
            id: model,
            generatedAt: new Date().toISOString(),
            usage:
              qwen.inputTokens !== undefined || qwen.outputTokens !== undefined
                ? { inputTokens: qwen.inputTokens, outputTokens: qwen.outputTokens }
                : undefined,
          },
        };
        const dir = path.join(ROOT, 'public', 'data', TICKER.toLowerCase(), 'ai', sessionDate);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${thesisId}.json`), serializeSavedPlan(meta, approved.contextKey, validated.response), 'utf8');

        const reload = await loadSavedPlan(TICKER, sessionDate, thesisId, approved, diskFetch);
        if (reload.status !== 'valid') {
          throw new Error(
            reload.status === 'invalid'
              ? `written plan failed the loader self-check: ${reload.reason}`
              : `written plan failed the loader self-check: ${reload.status}`,
          );
        }
        written.push(label);
        console.log(`OK ${label} -> ${questionId}, answer_kind=${validated.response.answer_kind}`);
        if (validated.response.answer_kind === 'unavailable') {
          console.log('  insufficient evidence: the saved plan honestly says unavailable');
        }
        for (const line of reviewLines(approved, validated.response)) console.log(line);
      } catch (error) {
        blockers.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  console.log('');
  console.log(`Saved plans written: ${written.length} of ${DATES.length * Object.keys(THESIS_QUESTION_ID).length}`);
  if (blockers.length > 0) {
    console.log('Blockers:');
    for (const blocker of blockers) console.log(`- ${blocker}`);
    process.exitCode = 1;
    return;
  }
  console.log('Review the wordings above before marking these plans demo-ready.');
}

await main();
