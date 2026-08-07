set shell := ["bash", "-uc"]

# Staging infrastructure. Mirrors ../surgiscribe-backend/justfile: one profile
# variable at the top, and every AWS recipe opts in with `export AWS_PROFILE`.
# Region comes from the profile (us-east-1).
aws_profile := "surgiscribe"
bucket := "surgisync-web-staging-211125702709"
distribution := "E2KKUWKHRV4BW4"
function_name := "surgisync-web-staging-spa-router"
oac_id := "E30UI095EXKE3O"
host := "app-staging.surgisoftsolutions.com"

default:
    @just --list

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

# Build and upload to staging, then invalidate the shell
deploy: build upload invalidate

# Typecheck and bundle into dist/
build:
    pnpm build

# Upload assets BEFORE index.html, always. The reverse order lets a viewer
# fetch a new shell whose chunks are not in the bucket yet.
#
# NEVER add --delete. vite.config.ts sets autoCodeSplitting, so routes are
# separate hashed chunks; deleting superseded assets gives anyone still holding
# an old index.html an unrecoverable ChunkLoadError, and it breaks rollback.
# Pruning is the bucket's lifecycle rule (noncurrent versions, 30 days).

# Push dist/ to the bucket, assets first
upload:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    aws s3 sync dist/assets/ s3://{{bucket}}/assets/ \
        --cache-control 'public, max-age=31536000, immutable'
    aws s3 cp dist/favicon.png s3://{{bucket}}/favicon.png \
        --cache-control 'public, max-age=86400'
    aws s3 cp dist/index.html s3://{{bucket}}/index.html \
        --cache-control 'no-cache'

# Only /index.html needs invalidating: assets are content-hashed, and the
# viewer-request function collapses every route onto the /index.html cache key.

# Invalidate the SPA shell
invalidate:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    aws cloudfront create-invalidation --distribution-id {{distribution}} \
        --paths /index.html --query 'Invalidation.{Id:Id,Status:Status}' --output json

# ---------------------------------------------------------------------------
# CloudFront function
# ---------------------------------------------------------------------------

# Exercise infra/spa-router.js against the cases that have broken before
test-function:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    etag=$(aws cloudfront describe-function --name {{function_name}} --query ETag --output text)
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    fail=0
    for uri in / /login /inventory/on-hand /assets/index-abc123.js /favicon.png /favicon.ico /inventory/v1.2/detail; do
        printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"1.2.3.4"},"request":{"method":"GET","uri":"%s","headers":{},"cookies":{},"querystring":{}}}' "$uri" > "$tmp/ev.json"
        out=$(aws cloudfront test-function --name {{function_name}} --if-match "$etag" \
              --stage DEVELOPMENT --event-object "fileb://$tmp/ev.json" \
              --query 'TestResult.FunctionOutput' --output text | jq -r '.request.uri')
        case "$uri" in
            /assets/*|/favicon.png) want="$uri" ;;
            *)                      want="/index.html" ;;
        esac
        if [ "$out" = "$want" ]; then printf '  ok   %-28s -> %s\n' "$uri" "$out"
        else printf '  FAIL %-28s -> %s (want %s)\n' "$uri" "$out" "$want"; fail=1; fi
    done
    exit $fail

# Upload infra/spa-router.js to DEVELOPMENT (run test-function next, then publish-function)
update-function:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    etag=$(aws cloudfront describe-function --name {{function_name}} --query ETag --output text)
    aws cloudfront update-function --name {{function_name}} --if-match "$etag" \
        --function-config '{"Comment":"SPA fallback: rewrite non-asset URIs to /index.html (see infra/spa-router.js)","Runtime":"cloudfront-js-2.0"}' \
        --function-code fileb://infra/spa-router.js \
        --query 'FunctionSummary.FunctionMetadata.Stage' --output text

# Promote DEVELOPMENT to LIVE, but only if test-function passes
publish-function: test-function
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    etag=$(aws cloudfront describe-function --name {{function_name}} --query ETag --output text)
    aws cloudfront publish-function --name {{function_name}} --if-match "$etag" \
        --query 'FunctionSummary.FunctionMetadata.Stage' --output text

# ---------------------------------------------------------------------------
# Distribution
# ---------------------------------------------------------------------------

# The _comment keys in infra/cloudfront-staging.json are documentation for the
# reader; the API rejects them, so strip them before sending.

# Apply infra/cloudfront-staging.json to the live distribution
apply-distribution:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    etag=$(aws cloudfront get-distribution-config --id {{distribution}} --query ETag --output text)
    jq 'walk(if type == "object" then del(._comment) else . end)' \
        infra/cloudfront-staging.json > "$tmp/config.json"
    aws cloudfront update-distribution --id {{distribution}} --if-match "$etag" \
        --distribution-config "file://$tmp/config.json" \
        --query 'Distribution.Status' --output text

# A plain diff is useless here: CloudFront returns the method arrays in its own
# order and fills in every field it has a default for (GrpcConfig,
# TrustedSigners, ...). So compare in one direction only — every value the
# committed file declares must match live — and sort the method arrays first.
# Fields AWS adds and we do not manage are correctly ignored.

# Report drift between infra/cloudfront-staging.json and the live distribution
diff-distribution:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    norm='walk(if type == "object" then del(._comment) else . end)
          | (.DefaultCacheBehavior, (.CacheBehaviors.Items // [])[])
            |= (.AllowedMethods.Items |= sort
               | .AllowedMethods.CachedMethods.Items |= sort)'
    aws cloudfront get-distribution-config --id {{distribution}} \
        --query DistributionConfig --output json | jq "$norm" > "$tmp/live.json"
    jq "$norm" infra/cloudfront-staging.json > "$tmp/want.json"
    # Leaves are selected by type, NOT with paths(scalars): that builtin selects
    # on truthiness, so it silently skips every field whose value is `false` --
    # Compress, SmoothStreaming, Logging.Enabled, Staging. Drift on those would
    # never be reported.
    jq -n --slurpfile w "$tmp/want.json" --slurpfile l "$tmp/live.json" '
        ($w[0]) as $want | ($l[0]) as $live
        | [ $want | paths as $p
            | select(($want | getpath($p) | type) | . != "object" and . != "array")
            | select(($live | getpath($p)) != ($want | getpath($p)))
            | { field: ($p | map(tostring) | join(".")),
                want:  ($want | getpath($p)),
                live:  ($live | getpath($p)) } ]
        | if length == 0
          then "distribution matches infra/cloudfront-staging.json"
          else . end'

# Deployment state of the distribution
status:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    aws cloudfront get-distribution --id {{distribution}} \
        --query 'Distribution.{Status:Status,Domain:DomainName,Aliases:DistributionConfig.Aliases.Items,LastModified:LastModifiedTime}' \
        --output json

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

# Smoke-test the real alias with no DNS, by pinning the CloudFront IP per request.
#
# Do NOT test through the d*.cloudfront.net name directly: the browser would
# send Origin: https://d<id>.cloudfront.net, which is not in the backend's
# CORS_ALLOWED_ORIGINS, and every login would 403 for a reason that has nothing
# to do with the deployment.

# Smoke-test the real alias without DNS, by pinning the CloudFront IP
smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    domain=$(aws cloudfront get-distribution --id {{distribution}} \
             --query 'Distribution.DomainName' --output text)
    ip=$(dig +short "$domain" | head -1)
    echo "pinning {{host}} -> $ip ($domain)"
    c() { curl -s --resolve {{host}}:443:"$ip" "$@"; }

    echo
    echo "== /health/data/ (env MUST be staging - production means the /api origin is wrong) =="
    c "https://{{host}}/health/data/" | jq '{status,env,db_connected,data_version}'

    echo
    echo "== deep link collapses onto the index.html cache key =="
    for p in / /inventory/on-hand; do
        printf '  %-22s %s\n' "$p" "$(c -o /dev/null -D- "https://{{host}}$p" | tr -d '\r' | grep -iE '^(HTTP/|content-type:|x-cache:)' | paste -sd' ' -)"
    done

    echo
    echo "== favicon.png must be image/png, not text/html =="
    c -o /dev/null -D- "https://{{host}}/favicon.png" | tr -d '\r' | grep -iE '^(HTTP/|content-type:|cache-control:)'

    echo
    echo "== assets are immutable and compressed (second call must be a Hit) =="
    asset=$(aws s3 ls s3://{{bucket}}/assets/ --output text | grep -o '[^ ]*\.js$' | head -1)
    for n in 1 2; do
        c -o /dev/null -D- -H 'Accept-Encoding: gzip, br' "https://{{host}}/assets/$asset" \
            | tr -d '\r' | grep -iE '^(HTTP/|cache-control:|content-encoding:|x-cache:)' | sed "s/^/  $n /"
    done

    echo
    echo "== security headers on the S3-served shell (Django's SecurityMiddleware never sees it) =="
    c -o /dev/null -D- "https://{{host}}/" | tr -d '\r' \
        | grep -iE '^(strict-transport-security:|x-content-type-options:|x-frame-options:)' | sed 's/^/  /'

    echo
    echo "== http redirects to https =="
    curl -s -o /dev/null -D- --resolve {{host}}:80:"$ip" "http://{{host}}/login" \
        | tr -d '\r' | grep -iE '^(HTTP/|location:)' | sed 's/^/  /'

    echo
    echo "== a missing asset 403s (OAC, no ListBucket) and is not cached =="
    c -o /dev/null -D- "https://{{host}}/assets/does-not-exist.js" \
        | tr -d '\r' | grep -iE '^(HTTP/|x-cache:)' | sed 's/^/  /'

    echo
    echo "== /api/* reaches Django, and matches direct-to-ALB byte for byte =="
    printf '  via CloudFront : %s %s\n' \
        "$(c -o /dev/null -w '%{http_code}' "https://{{host}}/api/v1/stock-items/")" \
        "$(c "https://{{host}}/api/v1/stock-items/" | head -c 80)"
    printf '  direct to ALB  : %s %s\n' \
        "$(curl -s -o /dev/null -w '%{http_code}' https://staging.surgisoftsolutions.com/api/v1/stock-items/)" \
        "$(curl -s https://staging.surgisoftsolutions.com/api/v1/stock-items/ | head -c 80)"

    echo
    echo "== a disallowed Origin must 403 (proves Origin is forwarded unmodified) =="
    c -o /dev/null -w '  %{http_code}\n' -X POST "https://{{host}}/api/v1/web/login/" \
        -H 'Origin: https://evil.example.com' -H 'Content-Type: application/json' \
        -d '{"email":"nobody@example.com","password":"wrong"}'

    echo
    echo "== an allowed Origin must NOT 403 (400/401 is the pass) =="
    c -o /dev/null -w '  %{http_code}\n' -X POST "https://{{host}}/api/v1/web/login/" \
        -H 'Origin: https://{{host}}' -H 'Content-Type: application/json' \
        -d '{"email":"nobody@example.com","password":"wrong"}'
    echo "  (404 on both of the last two means the staging image predates the"
    echo "   browser-auth endpoints - deploy the backend, it is not a CDN fault)"

# Print the /etc/hosts line for the browser checks, which curl --resolve cannot cover
hosts-line:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}}
    domain=$(aws cloudfront get-distribution --id {{distribution}} \
             --query 'Distribution.DomainName' --output text)
    echo "$(dig +short "$domain" | head -1) {{host}}"
    echo "# add with: sudo sh -c 'just hosts-line | head -1 >> /etc/hosts'"
    echo "# remove with: sudo sed -i '' '/{{host}}/d' /etc/hosts"
