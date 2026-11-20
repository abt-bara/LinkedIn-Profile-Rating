import {
  HttpError,
  httpClient,
  type ApiClient,
} from './httpClient'

export interface AuthUser {
  displayName: string
  name: string
  firstName: string
  role?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseUser(value: unknown): AuthUser {
  if (!isRecord(value) || typeof value.displayName !== 'string' || !value.displayName.trim()) {
    throw new Error('The authentication service returned an invalid user.')
  }

  const displayName = value.displayName.trim()
  return {
    displayName,
    name: displayName,
    firstName: displayName.split(/\s+/)[0] || 'Friend',
    role: typeof value.role === 'string' ? value.role.toLowerCase() : undefined,
  }
}

export class AuthService {
  private readonly client: ApiClient

  constructor(client: ApiClient = httpClient) {
    this.client = client
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      return parseUser(await this.client.get('/me'))
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return null
      throw error
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.client.post('/signin', { email, password })
  }

  async beginSignup(password: string): Promise<string> {
    const response = await this.client.post('/signup', { password })
    if (!isRecord(response) || typeof response.authorizationUrl !== 'string') {
      throw new Error('The sign-up service returned an invalid authorization URL.')
    }

    const authorizationUrl = new URL(response.authorizationUrl)
    if (
      authorizationUrl.protocol !== 'https:' ||
      authorizationUrl.hostname !== 'www.linkedin.com'
    ) {
      throw new Error('The sign-up service returned an unsafe authorization URL.')
    }
    return authorizationUrl.toString()
  }

  async signOut(): Promise<void> {
    await this.client.post('/signout', {})
  }
}

export const authService = new AuthService()
