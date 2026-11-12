/** RFC 9457 problem details, as documented in docs/contract/. */
export interface ProblemFieldError {
  field: string;
  detail: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ProblemFieldError[];
}
