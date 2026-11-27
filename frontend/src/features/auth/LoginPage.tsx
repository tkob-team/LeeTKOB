import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { homePath, useAuth } from '../../app/auth-context';
import { Button, Cover, FormField, ProblemAlert } from '../../components/ui';

function fieldError(problem: ProblemDetails | null, field: string): string | undefined {
  return problem?.errors?.find((e) => e.field === field)?.detail;
}

export function LoginPage() {
  const { session, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await login({ email, password });
    } catch (error) {
      if (error instanceof ApiProblemError) setProblem(error.problem);
      else throw error;
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="lk-auth">
      <Cover tagline="Bằng chứng trước, điểm sau." />
      <form
        className="lk-auth__form"
        noValidate
        aria-labelledby="login-title"
        onSubmit={(e) => void submit(e)}
      >
        <h1 id="login-title" className="lk-page__title">
          Đăng nhập
        </h1>
        {problem ? <ProblemAlert problem={problem} /> : null}
        <FormField label="Email" error={fieldError(problem, 'email')}>
          <input
            type="email"
            autoComplete="username"
            required
            aria-required="true"
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
            required
            aria-required="true"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
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
        <p className="lk-page__note">Quên mật khẩu? Liên hệ trợ giảng hoặc quản trị viên.</p>
      </form>
    </main>
  );
}
