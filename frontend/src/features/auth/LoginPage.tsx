import { useRef, useState, type SubmitEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { fieldErrorMessage, localizeProblem } from '../../api/problem-message';
import { credentialErrors } from '../../app/auth-api';
import { afterLoginPath, NEXT_PARAM, useAuth, type Credentials } from '../../app/auth-context';
import { Button, Cover, FormField, ProblemAlert } from '../../components/ui';

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

function toFieldErrors(credentials: Credentials): FieldErrors {
  const errors: FieldErrors = {};
  for (const error of credentialErrors(credentials)) {
    if (error.field === 'email' || error.field === 'password') errors[error.field] = error.detail;
  }
  return errors;
}

/** The message shown above the button for a failed sign-in, by cause. */
function formProblem(problem: ProblemDetails): ProblemDetails {
  if (problem.status === 0) {
    return {
      ...problem,
      title: 'Không kết nối được máy chủ',
      detail: 'Kiểm tra kết nối mạng rồi thử lại.',
    };
  }
  if (problem.status >= 500) {
    return {
      ...problem,
      title: 'Máy chủ đang gặp sự cố',
      detail: 'Chưa đăng nhập được do lỗi phía máy chủ. Thử lại sau ít phút.',
    };
  }
  return localizeProblem(problem);
}

export function LoginPage() {
  const { session, signOutReason, login } = useAuth();
  const [searchParams] = useSearchParams();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // After the first attempt, field errors follow the input as the user corrects it.
  const [attempted, setAttempted] = useState(false);
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [pending, setPending] = useState(false);

  if (session) {
    // Back to the page that sent the user here, if it belongs to their role.
    return <Navigate to={afterLoginPath(session.role, searchParams.get(NEXT_PARAM))} replace />;
  }

  function revalidate(next: Credentials) {
    if (attempted) setFieldErrors(toFieldErrors(next));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    setAttempted(true);
    setProblem(null);
    const errors = toFieldErrors({ email, password });
    setFieldErrors(errors);
    if (errors.email) {
      emailInput.current?.focus();
      return;
    }
    if (errors.password) {
      passwordInput.current?.focus();
      return;
    }

    sending.current = true;
    setPending(true);
    try {
      await login({ email, password });
    } catch (error) {
      if (!(error instanceof ApiProblemError)) throw error;
      const failed = error.problem;
      const serverErrors: FieldErrors = {};
      for (const fieldError of failed.errors ?? []) {
        if (fieldError.field === 'email' || fieldError.field === 'password') {
          // The server's detail is English; the message follows the field name.
          serverErrors[fieldError.field] = fieldErrorMessage(fieldError.field);
        }
      }
      if (serverErrors.email || serverErrors.password) {
        setFieldErrors(serverErrors);
        (serverErrors.email ? emailInput : passwordInput).current?.focus();
      } else {
        setProblem(formProblem(failed));
      }
      if (failed.status === 401) {
        // Wrong email or password: keep the email, ask for the password again.
        setPassword('');
        passwordInput.current?.focus();
      }
    } finally {
      sending.current = false;
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
        {signOutReason === 'expired' ? (
          <p className="lk-notice" role="status">
            Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.
          </p>
        ) : null}
        <FormField label="Email" error={fieldErrors.email}>
          <input
            ref={emailInput}
            type="email"
            autoComplete="username"
            required
            aria-required="true"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              revalidate({ email: e.target.value, password });
            }}
          />
        </FormField>
        <FormField label="Mật khẩu" error={fieldErrors.password}>
          <input
            ref={passwordInput}
            type="password"
            autoComplete="current-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              revalidate({ email, password: e.target.value });
            }}
          />
        </FormField>
        {problem ? <ProblemAlert problem={problem} /> : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
            {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </div>
        <p className="lk-page__note">Quên mật khẩu? Liên hệ trợ giảng hoặc quản trị viên.</p>
      </form>
    </main>
  );
}
