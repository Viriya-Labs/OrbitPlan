export class ExecutionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "ExecutionError";
    this.code = options?.code ?? "execution_error";
    this.status = options?.status ?? 400;
  }
}
