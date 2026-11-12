import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { homePath, useAuth, type Role } from '../../app/auth-context';
import { Button, Cover, FormField, ProblemAlert } from '../../components/ui';

function fieldError(problem: ProblemDetails | null, field: string): string | undefined {
  return problem?.errors?.find((e) => e.field === field)?.detail;
}

export function LoginPage() {
  const { session, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [pending, setPending] = useState(false);

  if (session) {
    // Back to the page that sent the user here, if it belongs to their role.
    const from = (location.state as { from?: string } | null)?.from;
    const target = from?.startsWith(`/${session.role}/`) ? from : homePath(session.role);
    return <Navigate to={target} replace />;
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    try {
      await login({ email, password, role });
    } catch (error) {
      if (error instanceof ApiProblemError) setProblem(error.problem);
      else throw error;
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="lk-page lk-page--narrow">
      <Cover tagline="Bằng chứng trước, điểm sau." />
      <form className="lk-stack" noValidate onSubmit={(e) => void submit(e)}>
        <h1 className="lk-page__title">Đăng nhập</h1>
        <p className="lk-page__note">Bản thử: đăng nhập giả lập, chưa nối backend.</p>
        {problem ? <ProblemAlert problem={problem} /> : null}
        <FormField label="Email" error={fieldError(problem, 'email')}>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </FormField>
        <FormField label="Mật khẩu" error={fieldError(problem, 'password')}>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </FormField>
        <FormField label="Vai trò" help="Chọn vai trò để xem giao diện tương ứng.">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value === 'ta' ? 'ta' : 'student');
            }}
          >
            <option value="student">Sinh viên</option>
            <option value="ta">Trợ giảng</option>
          </select>
        </FormField>
        <div>
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            disabledReason="Đang đăng nhập…"
          >
            Đăng nhập
          </Button>
        </div>
      </form>
    </main>
  );
}
