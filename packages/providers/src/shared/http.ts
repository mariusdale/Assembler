export class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();

  if (!response.ok) {
    throw new HttpError(response.status, text);
  }

  if (text === '') {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

