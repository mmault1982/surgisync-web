// CloudFront Function (cloudfront-js-2.0), viewer-request, default behaviour only.
//
// Client-side routing means /login and /inventory/on-hand are not keys in the
// bucket. Something has to serve index.html for them.
//
// Why here and not CustomErrorResponses:
//
//   1. CustomErrorResponses is distribution-wide. It would also rewrite the
//      API's genuine 403s (users/views_web_auth.py, origin_not_allowed) and
//      404s into a 200 serving index.html, which the SPA cannot distinguish
//      from success.
//   2. A viewer-request function runs *before* cache lookup, so /, /login and
//      /inventory/on-hand collapse to a single cache entry — invalidating
//      /index.html alone is then sufficient on deploy.
//
// The pass-through list is explicit rather than an extension heuristic: a
// future route segment containing a dot must not be mistaken for a file.
// The build root is exactly assets/, favicon.png and index.html, so this list
// is complete — but ANYTHING ADDED TO public/ MUST BE ADDED HERE TOO, or it
// will be served as index.html with Content-Type: text/html.

function handler(event) {
  var uri = event.request.uri;
  if (uri.startsWith('/assets/') || uri === '/favicon.png') {
    return event.request;
  }
  event.request.uri = '/index.html';
  return event.request;
}
