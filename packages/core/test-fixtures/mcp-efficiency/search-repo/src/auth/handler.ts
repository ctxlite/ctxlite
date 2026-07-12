export function authenticateRequest(token: string): boolean {
  return token.length > 10
}

export function handleAuthHeader(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null
  }
  return header.slice(7)
}
