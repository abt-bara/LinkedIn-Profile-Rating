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

export type AnalyzeResponse = {
  analysisResult: unknown
  graphData: GraphResponse
}

export const COLOR_MAP = {
  c1: { v1: '#0A66C2', v2: '#9DC9ED' },
  c2: { v1: '#004182', v2: '#8BBBE8' },
  c3: { v1: '#2867B2', v2: '#A8CDEE' },
  c4: { v1: '#378FE9', v2: '#B7DCF8' },
  c5: { v1: '#155A9C', v2: '#90BDEB' },
  c6: { v1: '#0B5394', v2: '#9BC5EC' },
  c7: { v1: '#5A9BD5', v2: '#C1DDF5' },
  c8: { v1: '#1D70B7', v2: '#A4CCED' },
  c9: { v1: '#3F83C5', v2: '#B3D4F1' },
  c10: { v1: '#0A4F8F', v2: '#91BCE6' },
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

    const body = await readResponse(response)

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseGraphResponse(value: unknown): GraphResponse {
  if (!isRecord(value)) {
    throw new Error('The analysis service returned invalid graph data.')
  }

  const graph: GraphResponse = {}

  for (const [key, metricValue] of Object.entries(value)) {
    if (!isRecord(metricValue)) {
      throw new Error('The analysis service returned invalid graph data.')
    }

    const { name, val, oldval } = metricValue
    if (
      (typeof name !== 'undefined' && typeof name !== 'string') ||
      (typeof val !== 'undefined' && (typeof val !== 'number' || !Number.isFinite(val))) ||
      (typeof oldval !== 'undefined' &&
        (typeof oldval !== 'number' || !Number.isFinite(oldval))) ||
      (typeof val === 'undefined' && typeof oldval === 'undefined')
    ) {
      throw new Error('The analysis service returned invalid graph data.')
    }

    graph[key] = {
      name: typeof name === 'string' ? name : key,
      ...(typeof val === 'number' ? { val } : {}),
      ...(typeof oldval === 'number' ? { oldval } : {}),
    }
  }

  return graph
}

function parseAnalyzeResponse(value: unknown): AnalyzeResponse {
  if (!isRecord(value) || !('analysisResult' in value) || !('graphData' in value)) {
    throw new Error('The analysis service returned an invalid response.')
  }

  return {
    analysisResult: value.analysisResult,
    graphData: parseGraphResponse(value.graphData),
  }
}

export async function analyze(file: File): Promise<AnalyzeResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await httpClient.request('/analyze', {
    method: 'POST',
    body: formData,
  })

  return parseAnalyzeResponse(response)
}
