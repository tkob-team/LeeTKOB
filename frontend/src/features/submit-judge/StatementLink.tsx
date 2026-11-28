import { Link, useInRouterContext } from 'react-router';

/**
 * "Xem đề bài" for the chosen lab. The submit page also renders outside a router (its tests and
 * any embed), so it falls back to a plain link there.
 */
export function StatementLink({ labId }: { labId: string }) {
  const inRouter = useInRouterContext();
  const to = `/student/labs/${encodeURIComponent(labId)}`;
  return inRouter ? <Link to={to}>Xem đề bài</Link> : <a href={to}>Xem đề bài</a>;
}
