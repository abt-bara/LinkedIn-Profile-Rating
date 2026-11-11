export type OpenIdUser = {
  id?: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  firstName?: string
  [key: string]: unknown
}

export type Metric = {
  name: string
  val?: number
  oldval?: number
}

export type GraphResponse = Record<string, Metric>

export const COLOR_MAP = {
  c1: { v1: '#1F3A5F', v2: '#6C8CB5' },
  c2: { v1: '#1B6B73', v2: '#6FB1B7' },
  c3: { v1: '#3E4C59', v2: '#9AA5B1' },
  c4: { v1: '#2F6B4F', v2: '#7FB59A' },
  c5: { v1: '#5B3A6B', v2: '#A98BB8' },
  c6: { v1: '#7A2E3A', v2: '#C08A92' },
  c7: { v1: '#A8741A', v2: '#E0BC7A' },
  c8: { v1: '#3B3F8C', v2: '#8D90D1' },
  c9: { v1: '#B05A3C', v2: '#E0A58F' },
  c10: { v1: '#6B7A3A', v2: '#B7C27F' },
} as const

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export interface ApiClient {
  get(path: string): Promise<unknown>
  post(path: string, body: unknown): Promise<unknown>
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message
    if (typeof message === 'string' && message.trim()) return message
  }

  return fallback
}

export class HttpClient implements ApiClient {
  private readonly basePath: string

  constructor(basePath = '/api') {
    this.basePath = basePath
  }

  async request(
    path: string,
    init: RequestInit = {},
    options: { includeCredentials?: boolean } = { includeCredentials: true },
  ): Promise<unknown> {
    const headers = new Headers(init.headers)
    const hasBody = typeof init.body !== 'undefined'

    if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (hasBody && init.body instanceof FormData) {
      headers.delete('Content-Type')
    }

    const response = await fetch(`${this.basePath}${path}`, {
      ...init,
      headers,
      credentials: options.includeCredentials === false ? 'omit' : 'include',
    })

    if (response.status === 401) {
      window.location.assign('/auth')
      throw new HttpError('Authentication required.', 401)
    }

    const body = await readResponse(response)

    if (!response.ok) {
      throw new HttpError(
        getErrorMessage(body, `Request failed (${response.status}).`),
        response.status,
      )
    }

    return body
  }

  async get(path: string): Promise<unknown> {
    return this.request(path)
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }
}

export const httpClient = new HttpClient()

export async function authenticate(token: string): Promise<unknown> {
  return httpClient.request('/auth', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }, { includeCredentials: true })
}

export async function getUser(): Promise<OpenIdUser> {
  return httpClient.get('/user') as Promise<OpenIdUser>
}

export async function sign(payload: Record<string, unknown>): Promise<unknown> {
  return httpClient.request(
    '/sign',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { includeCredentials: false },
  )
}

export async function getGraph(): Promise<GraphResponse> {
  return httpClient.get('/graph') as Promise<GraphResponse>
}

export async function analyze(file: File): Promise<unknown> {
  const formData = new FormData()
  formData.append('file', file)

  return httpClient.request('/Analyze', {
    method: 'POST',
    body: formData,
  })
}
