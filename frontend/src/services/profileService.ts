import { httpClient, type ApiClient } from './httpClient'

function validateMagicLink(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The service did not return a valid magic link.')
  }

  let url: URL
  try {
    url = new URL(value.trim())
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

  async generateMagicLink(durationSeconds: number): Promise<string> {
    if (
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 60 * 60 ||
      durationSeconds > 6 * 30 * 24 * 60 * 60
    ) {
      throw new Error('Magic-link duration must be between 1 hour and 6 months.')
    }

    const result = await this.client.post('/magic-link', { durationSeconds })

    if (
      typeof result !== 'object' ||
      result === null ||
      !('url' in result)
    ) {
      throw new Error('The service did not return a valid magic link.')
    }

    return validateMagicLink(result.url)
  }
}

export const profileService = new ProfileService()
