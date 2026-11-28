import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { useAuth } from '../../app/auth-context';
import { usePageTitle } from '../../app/usePageTitle';
import {
  Button,
  deductionLabel,
  EvidenceBlock,
  JudgeResult,
  MarkdownInline,
  ProblemAlert,
  ReviewQueueTable,
  VerdictBadge,
} from '../../components/ui';
import { formatDateTime, labTitle, type Classroom, type LabDetail } from '../lab-authoring/lab-api';
import { labPhase } from '../lab-authoring/lab-phase';
import { taClassPath } from '../ta-classes/ta-classes-api';
import {
  formatSubmittedAt,
  isCounted,
  reasonText,
  SOURCE_LABEL,
  studentLabel,
  submissionLabel,
  toRows,
  UNSURE_CAUSE,
  type QueueRow,
  type ReviewItem,
  type ReviewQueuePage as QueueResponse,
} from './review-queue';

/** The queue refreshes itself while findings arrive from the check worker. */
export const POLL_MS = 15_000;
const PAGE_SIZE = 20;

/** Wording this page uses instead of the shared text; `type` and `status` stay as sent. */
const PROBLEM_TEXT: Partial<Record<string, Pick<ProblemDetails, 'title' | 'detail'>>> = {
  'urn:leetkob:problem:lab-not-found': {
    title: 'Không tìm thấy lab',
    detail: 'Lab không tồn tại hoặc bạn không phải TA của lớp có lab này.',
  },
};

function requestProblem(cause: unknown): ProblemDetails {
  const problem = problemFrom(cause);
  const text = PROBLEM_TEXT[problem.type];
  return text ? { ...problem, ...text } : problem;
}

export function ReviewQueuePage() {
  const { labId } = useParams();
  if (!labId) return <NoLabQueue />;
  return <LabReviewQueue key={labId} labId={labId} />;
}

function NoLabQueue() {
  usePageTitle('Hàng chờ duyệt');
  return (
    <EmptyState title="Hàng chờ duyệt">
      Hàng chờ duyệt đang trống. Khoản trừ cần duyệt trước khi công bố điểm sẽ hiện ở đây.
    </EmptyState>
  );
}

/** The lab (title, dates, class) and its class name, for the header and the way back. */
interface QueueContext {
  lab: LabDetail;
  classroom?: Classroom;
}

/**
 * Reads GET /labs/{labId} (a TA of the class may read it), then GET /classes/{classId} for the
 * class name. Failures leave the header in its loading form; the queue request reports them.
 */
function useQueueContext(labId: string): QueueContext | undefined {
  const [context, setContext] = useState<QueueContext>();
  useEffect(() => {
    const abort = new AbortController();
    const signal = abort.signal;
    // A function, so the check is read again after each await.
    const live = () => !signal.aborted;
    async function load() {
      const lab = await api.request<LabDetail>(`/labs/${encodeURIComponent(labId)}`, { signal });
      if (!live()) return;
      setContext({ lab });
      const classroom = await api.request<Classroom>(
        `/classes/${encodeURIComponent(lab.classId)}`,
        { signal },
      );
      if (live()) setContext({ lab, classroom });
    }
    load().catch(() => {
      // The header keeps "← Lớp của tôi" and the plain title.
    });
    return () => {
      abort.abort();
    };
  }, [labId]);
  return context;
}

function LabReviewQueue({ labId }: { labId: string }) {
  const { session } = useAuth();
  const token = session?.token;
  const [page, setPage] = useState(0);
  const [queue, setQueue] = useState<QueueResponse>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [selectedId, setSelectedId] = useState<string>();
  const context = useQueueContext(labId);
  const lab = context?.lab;
  const classroom = context?.classroom;
  usePageTitle(lab ? `Hàng chờ: ${labTitle(lab.title)}` : 'Hàng chờ duyệt');

  useEffect(() => {
    const abort = new AbortController();
    const path = `/labs/${encodeURIComponent(labId)}/review-queue?page=${String(page)}&size=${String(PAGE_SIZE)}&includeEarlier=true`;
    let timer: number | undefined;

    async function poll() {
      try {
        const next = await api.request<QueueResponse>(path, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setQueue(next);
        setProblem(undefined);
      } catch (cause) {
        if (abort.signal.aborted) return;
        const failure = requestProblem(cause);
        setProblem(failure);
        // 4xx will not fix itself (wrong lab, no access): stop polling.
        if (failure.status !== 0 && failure.status < 500) return;
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    }

    void poll();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [labId, page, token]);

  // A 4xx answer (no such lab, no access) stops the polling, so the page no longer refreshes.
  const stopped = problem !== undefined && problem.status >= 400 && problem.status < 500;
  const items = queue?.items ?? [];
  const counted = items.filter(isCounted);
  const earlier = items.filter((item) => !isCounted(item));
  const selected = toRows(items).find((row) => row.id === selectedId);
  const select = (row: QueueRow) => {
    setSelectedId(row.id);
  };

  // On a 4xx the lab is unknown or not the TA's: the way back is the class list.
  const known = !stopped && lab !== undefined;
  return (
    <section className="lk-section" aria-labelledby="review-title">
      <header className="lk-section__head">
        {known && classroom ? (
          <Link to={taClassPath(classroom.id)} className="lk-back">
            ← {classroom.name}
          </Link>
        ) : (
          <Link to="/ta/classes" className="lk-back">
            ← Lớp của tôi
          </Link>
        )}
        <h1 id="review-title" className="lk-page__title">
          {known ? `Hàng chờ duyệt: ${labTitle(lab.title)}` : 'Hàng chờ duyệt'}
        </h1>
        {known ? (
          <p className="lk-page__note">
            Hạn nộp {formatDateTime(lab.dueAt)} · {labPhase(lab.opensAt, lab.dueAt).label}
          </p>
        ) : null}
        <p>Kết quả soát ràng buộc của từng bài, chờ trợ giảng xác nhận trước khi công bố điểm.</p>
        {stopped ? null : (
          <p className="lk-page__note">
            {queue?.provisional
              ? 'Tạm tính: lab chưa hết hạn, hàng chờ đổi khi sinh viên nộp lại.'
              : 'Bài được tính là bài nộp cuối cùng trước hạn của mỗi sinh viên.'}{' '}
            Tự làm mới mỗi 15 giây. Bài cần duyệt (violation, unsure) xếp trước.
          </p>
        )}
      </header>

      {problem ? <ProblemAlert problem={problem} /> : null}
      {stopped ? (
        <p>
          <Link className="lk-btn lk-btn--secondary" to="/ta/classes">
            Về Lớp của tôi
          </Link>
        </p>
      ) : null}
      {!queue && !problem ? <p className="lk-page__note">Đang tải hàng chờ…</p> : null}

      {queue && queue.items.length === 0 ? (
        <EmptyState title="Chưa có bài được tính">Chưa sinh viên nào nộp bài trước hạn.</EmptyState>
      ) : null}

      {items.length > 0 ? (
        <div className="lk-review">
          <div className="lk-review__main">
            {counted.map((item) => (
              <SubmissionBlock
                key={item.submissionId}
                item={item}
                selectedId={selected?.id}
                onSelect={select}
              />
            ))}
            {earlier.length > 0 ? (
              <section className="lk-section__head" aria-labelledby="earlier-title">
                <h2 id="earlier-title" className="lk-panel__title">
                  Các lần nộp cũ hơn (không tính điểm)
                </h2>
                <p className="lk-page__note">
                  Bài AC sinh viên nộp trước lần được tính, chỉ để tham khảo.
                </p>
                {earlier.map((item) => (
                  <SubmissionBlock
                    key={item.submissionId}
                    item={item}
                    selectedId={selected?.id}
                    onSelect={select}
                  />
                ))}
              </section>
            ) : null}
          </div>
          <div className="lk-review__aside">
            {selected ? (
              <FindingPanel row={selected} />
            ) : (
              <aside className="lk-panel" aria-label="Chi tiết ràng buộc">
                <p className="lk-page__note">Chọn một dòng để xem lý do và dòng bằng chứng.</p>
              </aside>
            )}
          </div>
        </div>
      ) : null}

      {queue && queue.totalPages > 1 ? (
        <nav className="lk-row" aria-label="Phân trang">
          <Button
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            Trang trước
          </Button>
          <span>
            Trang {queue.page + 1}/{queue.totalPages}
          </span>
          <Button
            disabled={page + 1 >= queue.totalPages}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            Trang sau
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

/** One submission: anonymous student, counted or not-counted badge, time with seconds, test
 * result, findings. */
function SubmissionBlock({
  item,
  selectedId,
  onSelect,
}: {
  item: ReviewItem;
  selectedId: string | undefined;
  onSelect: (row: QueueRow) => void;
}) {
  const label = submissionLabel(item.submissionId);
  const rows = toRows([item]);
  const counted = isCounted(item);
  // Every block carries its own badge, so one block alone tells whether it counts.
  return (
    <section
      className={
        counted ? 'lk-panel lk-submission' : 'lk-panel lk-submission lk-submission--earlier'
      }
      aria-label={`Bài nộp ${label}`}
    >
      <header className="lk-submission__head">
        <h3 className="lk-submission__student">{studentLabel(item.student.id)}</h3>
        {counted ? (
          <span className="lk-tag">Được tính điểm</span>
        ) : (
          <span className="lk-tag lk-tag--muted">Không tính điểm</span>
        )}
        <span>
          Nộp lúc <time dateTime={item.submittedAt}>{formatSubmittedAt(item.submittedAt)}</time>
        </span>
        <span>
          Chấm test <JudgeResult code={item.verdict ?? 'pending'} />
        </span>
        <span className="lk-page__note">
          Mã bài nộp <span className="lk-mono">{label}</span>
        </span>
      </header>
      {item.reviewStatus === 'checked' ? (
        <ReviewQueueTable
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
          renderSource={sourceCell}
          showSubmission={false}
          label={`Ràng buộc của bài nộp ${label}`}
        />
      ) : item.reviewStatus === 'reviewing' ? (
        <p className="lk-page__note">Đang soát ràng buộc…</p>
      ) : (
        <p className="lk-page__note">Không soát ràng buộc: chấm test chưa AC.</p>
      )}
    </section>
  );
}

/** The source in Vietnamese ("Luật cứng", "Mô hình", "Chặn an toàn"), its meaning as a title. */
function sourceCell(row: QueueRow) {
  const source = SOURCE_LABEL[row.source];
  return <span title={source.title}>{source.label}</span>;
}

function FindingPanel({ row }: { row: QueueRow }) {
  const { finding } = row;
  const label = submissionLabel(row.item.submissionId);
  const reason = reasonText(finding);
  return (
    <aside className="lk-panel" aria-label={`Bài nộp ${label}, ràng buộc ${finding.code}`}>
      <h2 className="lk-panel__title">
        {finding.code} · bài nộp <span className="lk-mono">{label}</span>
        {isCounted(row.item) ? null : ' (không được tính)'}
      </h2>
      <p className="lk-page__note">{studentLabel(row.item.student.id)}</p>
      <p>
        <MarkdownInline>{finding.text}</MarkdownInline>
      </p>
      <p>
        <VerdictBadge verdict={finding.verdict} /> Khoản trừ:{' '}
        {deductionLabel(finding.verdict, finding.deduction)}
      </p>
      {finding.unsureCause ? <p>Nguyên nhân unsure: {UNSURE_CAUSE[finding.unsureCause]}</p> : null}
      {/* `code` in the reason (banned names, identifiers) shows as inline code. */}
      {reason ? (
        <p>Lý do: {reason.includes('`') ? <MarkdownInline>{reason}</MarkdownInline> : reason}</p>
      ) : null}
      {finding.evidence.length > 0 ? (
        finding.evidence.map((line) => (
          <EvidenceBlock
            key={line.line}
            lines={[line.text]}
            evidence={[line.line]}
            firstLine={line.line}
            label={`Bài nộp ${label}, dòng bằng chứng ${String(line.line)}`}
          />
        ))
      ) : (
        <p className="lk-page__note">Không có dòng bằng chứng.</p>
      )}
    </aside>
  );
}
