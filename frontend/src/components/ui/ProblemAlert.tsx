import type { ProblemDetails } from '../../api/problem';

export interface ProblemAlertProps {
  problem: ProblemDetails;
  /** Show the `type` URN and status; TA views only. */
  showType?: boolean;
}

/** Title as heading, detail as sentence. Never a stack trace or raw JSON. */
export function ProblemAlert({ problem, showType = false }: ProblemAlertProps) {
  return (
    <div className="lk-problem" role="alert">
      <p className="lk-problem__title">{problem.title}</p>
      {problem.detail ? <p className="lk-problem__detail">{problem.detail}</p> : null}
      {showType ? (
        <p className="lk-problem__type">
          {problem.type} · {problem.status}
        </p>
      ) : null}
    </div>
  );
}
