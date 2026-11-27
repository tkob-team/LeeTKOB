import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api, ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { useAuth } from '../../app/auth-context';
import {
  Button,
  deductionLabel,
  EvidenceBlock,
  JudgeResult,
  ProblemAlert,
  ReviewQueueTable,
  VerdictBadge,
} from '../../components/ui';
import {
  isCounted,
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

/** Vietnamese text for problems this page expects; `type` and `status` stay as sent. */
const PROBLEM_TEXT: Partial<Record<string, Pick<ProblemDetails, 'title' | 'detail'>>> = {
  'urn:leetkob:problem:lab-not-found': {
    title: 'Không tìm thấy lab',
    detail: 'Lab không tồn tại hoặc bạn không phải TA của lớp có lab này.',
  },
};

function requestProblem(cause: unknown): ProblemDetails {
  if (cause instanceof ApiProblemError) {
    const text = PROBLEM_TEXT[cause.problem.type];
    return text ? { ...cause.problem, ...text } : cause.problem;
  }
  return { type: 'about:blank', title: 'Không đọc được phản hồi của máy chủ', status: 0 };
}

export function ReviewQueuePage() {
  const { labId } = useParams();
  if (!labId) {
    return (
      <EmptyState title="Hàng chờ duyệt">
        Hàng chờ duyệt đang trống. Khoản trừ cần duyệt trước khi công bố điểm sẽ hiện ở đây.
      </EmptyState>
    );
  }
  return <LabReviewQueue key={labId} labId={labId} />;
}

function LabReviewQueue({ labId }: { labId: string }) {
  const { session } = useAuth();
  const token = session?.token;
  const [page, setPage] = useState(0);
  const [queue, setQueue] = useState<QueueResponse>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [selectedId, setSelectedId] = useState<string>();

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

  const items = queue?.items ?? [];
  const counted = items.filter(isCounted);
  const earlier = items.filter((item) => !isCounted(item));
  const rows = toRows(counted);
  const earlierRows = toRows(earlier);
  const selected = [...rows, ...earlierRows].find((row) => row.id === selectedId);
  const reviewing = counted.filter((item) => item.reviewStatus === 'reviewing');
  const notChecked = counted.filter((item) => item.reviewStatus === 'not_checked');
  const earlierReviewing = earlier.filter((item) => item.reviewStatus === 'reviewing');
  const select = (row: { id: string }) => {
    setSelectedId(row.id);
  };

  return (
    <section className="lk-section" aria-labelledby="review-title">
      <header className="lk-section__head">
        <h1 id="review-title" className="lk-page__title">
          Hàng chờ duyệt
        </h1>
        <p className="lk-page__note">
          {queue?.provisional
            ? 'Tạm tính: lab chưa hết hạn, hàng chờ đổi khi sinh viên nộp lại.'
            : 'Bài được tính là bài nộp cuối cùng trước hạn của mỗi sinh viên.'}{' '}
          Tự làm mới mỗi 15 giây. Bài cần duyệt (violation, unsure) xếp trước.
        </p>
      </header>

      {problem ? <ProblemAlert problem={problem} /> : null}
      {!queue && !problem ? <p className="lk-page__note">Đang tải hàng chờ…</p> : null}

      {queue && queue.items.length === 0 ? (
        <EmptyState title="Chưa có bài được tính">Chưa sinh viên nào nộp bài trước hạn.</EmptyState>
      ) : null}

      {rows.length > 0 ? (
        <div className="lk-section__head">
          <ReviewQueueTable rows={rows} selectedId={selected?.id} onSelect={select} />
          {selected && isCounted(selected.item) ? <FindingPanel row={selected} /> : null}
        </div>
      ) : null}

      {reviewing.length > 0 ? (
        <section className="lk-panel" aria-label="Đang soát">
          <h2 className="lk-panel__title">Đang soát</h2>
          <ReviewingList items={reviewing} />
        </section>
      ) : null}

      {notChecked.length > 0 ? (
        <section className="lk-panel" aria-label="Không soát">
          <h2 className="lk-panel__title">Không soát (chấm test chưa AC)</h2>
          <ul className="lk-list">
            {notChecked.map((item) => (
              <li key={item.submissionId}>
                <span className="lk-mono">{submissionLabel(item.submissionId)}</span>{' '}
                <JudgeResult code={item.verdict ?? 'pending'} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {earlier.length > 0 ? (
        <section className="lk-section__head" aria-labelledby="earlier-title">
          <h2 id="earlier-title" className="lk-panel__title">
            Bài nộp trước (không được tính)
          </h2>
          <p className="lk-page__note">
            Các bài AC nộp trước bài được tính của cùng sinh viên. Chỉ để tham khảo: không dùng để
            chấm điểm.
          </p>
          {earlierRows.length > 0 ? (
            <ReviewQueueTable rows={earlierRows} selectedId={selected?.id} onSelect={select} />
          ) : null}
          {selected && !isCounted(selected.item) ? <FindingPanel row={selected} /> : null}
          {earlierReviewing.length > 0 ? <ReviewingList items={earlierReviewing} /> : null}
        </section>
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

function ReviewingList({ items }: { items: ReviewItem[] }) {
  return (
    <ul className="lk-list">
      {items.map((item) => (
        <li key={item.submissionId}>
          <span className="lk-mono">{submissionLabel(item.submissionId)}</span>{' '}
          <JudgeResult code={item.verdict ?? 'pending'} /> đang soát
        </li>
      ))}
    </ul>
  );
}

function FindingPanel({ row }: { row: QueueRow }) {
  const { finding } = row;
  const label = submissionLabel(row.item.submissionId);
  return (
    <aside className="lk-panel" aria-label={`Bài nộp ${label}, ràng buộc ${finding.code}`}>
      <h2 className="lk-panel__title">
        {finding.code} · bài nộp <span className="lk-mono">{label}</span>
        {isCounted(row.item) ? null : ' (không được tính)'}
      </h2>
      <p>{finding.text}</p>
      <p>
        <VerdictBadge verdict={finding.verdict} /> Khoản trừ:{' '}
        {deductionLabel(finding.verdict, finding.deduction)}
      </p>
      {finding.unsureCause ? <p>Nguyên nhân unsure: {UNSURE_CAUSE[finding.unsureCause]}</p> : null}
      {finding.reason ? <p>Lý do: {finding.reason}</p> : null}
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
