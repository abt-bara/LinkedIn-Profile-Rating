export type AnalysisRecord = {
  id: string
  user_id: string
  created_at: string
  completeness: number
  content_quality: number
  keyword_and_role_relevance: number
  career_trajectory: number
  skills_depth: number
  social_proof: number
  network: number
  activity: number
}

export const COLOR_MAP = {
  c1: '#0A66C2',
  c2: '#004182',
  c3: '#2867B2',
  c4: '#378FE9',
  c5: '#155A9C',
  c6: '#0B5394',
  c7: '#5A9BD5',
  c8: '#1D70B7',
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

async function readResponse(response: Response, responseType: 'auto' | 'text'): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  if (responseType === 'text') return text

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
    options: { includeCredentials?: boolean; responseType?: 'auto' | 'text' } = {
      includeCredentials: true,
    },
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

    if (
      response.status === 403 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/auth'
    ) {
      window.location.replace('/auth')
    }

    if (
      path === '/me' &&
      response.redirected &&
      response.url &&
      new URL(response.url).pathname === '/auth'
    ) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
        window.location.replace('/auth')
      }
      throw new HttpError('Authentication required.', 401)
    }

    const responseType =
      options.responseType === 'text' && response.ok ? 'text' : 'auto'
    const body = await readResponse(response, responseType)

    if (!response.ok) {
      throw new HttpError(
        getErrorMessage(
          body,
          response.status === 401
            ? 'Authentication required.'
            : `Request failed (${response.status}).`,
        ),
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

export async function getMe(): Promise<unknown> {
  return httpClient.get('/me')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAnalysisHistory(value: unknown): AnalysisRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('The analysis history service returned an invalid response.')
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('The analysis history service returned an invalid response.')
    }

    const { id, user_id, created_at } = entry
    if (
      typeof id !== 'string' ||
      typeof user_id !== 'string' ||
      typeof created_at !== 'string' ||
      !Number.isFinite(Date.parse(created_at))
    ) {
      throw new Error('The analysis history service returned an invalid response.')
    }

    const readScore = (field: keyof Omit<AnalysisRecord, 'id' | 'user_id' | 'created_at'>) => {
      const score = entry[field]
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
        throw new Error('The analysis history service returned invalid scores.')
      }
      return score
    }

    return {
      id,
      user_id,
      created_at,
      completeness: readScore('completeness'),
      content_quality: readScore('content_quality'),
      keyword_and_role_relevance: readScore('keyword_and_role_relevance'),
      career_trajectory: readScore('career_trajectory'),
      skills_depth: readScore('skills_depth'),
      social_proof: readScore('social_proof'),
      network: readScore('network'),
      activity: readScore('activity'),
    }
  })
}

export async function analyze(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await httpClient.request('/analyze', {
    method: 'POST',
    body: formData,
  }, { responseType: 'text' })

  if (typeof response !== 'string' || !response.trim()) {
    throw new Error('The analysis service returned an empty text response.')
  }
  return response
}

export async function getAnalyses(limit = 10): Promise<AnalysisRecord[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Analysis history limit must be between 1 and 10.')
  }

  const query = new URLSearchParams({ limit: String(limit) })
  return parseAnalysisHistory(await httpClient.get(`/analyses?${query}`))
}
