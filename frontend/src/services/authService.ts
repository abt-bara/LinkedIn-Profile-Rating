import {
  authenticate,
  getUser,
  HttpError,
  httpClient,
  type ApiClient,
} from './httpClient'

export interface AuthUser {
  id: string
  name: string
  firstName: string
  email?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseUser(value: unknown): AuthUser {
  const record =
    isRecord(value) && isRecord(value.user) ? value.user : value

  if (!isRecord(record)) {
    throw new Error('The authentication service returned an invalid user.')
  }

  const name =
    typeof record.name === 'string'
      ? record.name
      : typeof record.full_name === 'string'
        ? record.full_name
        : typeof record.displayName === 'string'
          ? record.displayName
          : ''

  const givenName =
    typeof record.given_name === 'string'
      ? record.given_name
      : typeof record.firstName === 'string'
        ? record.firstName
        : name.split(/\s+/)[0] || 'Friend'

  const finalName = name || givenName || 'Friend'
  const id = typeof record.id === 'string' ? record.id : finalName

  return {
    id,
    name: finalName,
    firstName: givenName,
    email: typeof record.email === 'string' ? record.email : undefined,
  }
}

export class AuthService {
  private readonly client: ApiClient

  constructor(client: ApiClient = httpClient) {
    this.client = client
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      return parseUser(await getUser())
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return null
      throw error
    }
  }

  async authenticate(token: string): Promise<AuthUser> {
    return parseUser(await authenticate(token))
  }

  async signOut(): Promise<void> {
    await this.client.post('/signout', {})
  }
}

export const authService = new AuthService()
