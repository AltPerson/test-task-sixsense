import { type NextRequest, NextResponse } from "next/server";

import {
  loginPathForReturnTo,
  RETURN_TO_HEADER,
  safeReturnTo,
} from "@/features/auth/model/return-to";
import { SESSION_COOKIE_NAME } from "@/server/auth/cookie-name";

export function proxy(request: NextRequest) {
  const returnTo = safeReturnTo(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(
      new URL(loginPathForReturnTo(returnTo), request.url),
    );
  }

  // The layout remains authoritative for server-side session validity. This
  // trusted request header preserves the page when an opaque cookie is stale.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(RETURN_TO_HEADER, returnTo);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
