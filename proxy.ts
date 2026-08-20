import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'session_ref';

/**
 * Every anonymous basket needs a stable session_ref before the first hold
 * is created -- db/policies.sql's hold_session_read policy is what makes
 * that id matter, not just a display convenience. Server Components can't
 * set cookies, so this runs once per browser on first request instead of
 * threading a "first visit" special case through every page.
 */
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    response.cookies.set(SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
