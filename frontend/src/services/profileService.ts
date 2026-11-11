import { httpClient, type ApiClient } from './httpClient'

function validateMagicLink(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The service did not return a valid magic link.')
  }

  let url: URL
  try {
    url = new URL(value.trim(), window.location.origin)
  } catch {
    throw new Error('The service did not return a valid magic link.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The service returned a link with an unsupported protocol.')
  }

  return url.toString()
}

export class ProfileService {
  private readonly client: ApiClient

  constructor(client: ApiClient = httpClient) {
    this.client = client
  }

  async checkProfile(url: string): Promise<unknown> {
    return this.client.get(`/profile-check?url=${encodeURIComponent(url)}`)
  }

  async generateMagicLink(): Promise<string> {
    const result = await this.client.post('/magic-link', {})

    if (typeof result === 'string') return validateMagicLink(result)
    if (typeof result === 'object' && result !== null) {
      if ('url' in result) {
        return validateMagicLink(result.url)
      }
      if ('magicLink' in result) {
        return validateMagicLink(result.magicLink)
      }
    }

    throw new Error('The service did not return a valid magic link.')
  }
}

export const profileService = new ProfileService()
