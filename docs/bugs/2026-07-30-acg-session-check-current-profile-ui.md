# Bug: ACG session check times out for an already authenticated Pluralsight session

## What was tested

Ran:

```text
make credential-test PROVIDER=aws
```

Inspected the existing Chrome CDP page at `http://127.0.0.1:9222` after the failure.

## Actual output

```text
INFO: [acg] Reusing existing CDP browser on :9222
INFO: Checking Pluralsight (ACG) session in Antigravity browser...
ACTION REQUIRED: Please log into Pluralsight in the browser, then wait for the signin page to clear.
ERROR: Pluralsight login timeout
make: *** [credential-test] Error 1
```

The CDP page was already authenticated:

```text
url: https://app.pluralsight.com/library/
title: Home | Pluralsight
```

Its profile control is rendered as:

```html
<div class="psPrismMonogram" aria-label="user@example.com">CG</div>
```

## Root cause

`scripts/lib/acg_session_check.js` only recognized the older user-menu, account-label,
avatar-image, or Cloud Sandboxes UI. The current Pluralsight UI renders a Prism monogram
inside `.psPrismAvatar`, so all of the existing selectors returned false. The checker then
opened `/id/signin` and waited for its obsolete selectors until timeout.

## Fix

Recognize the authenticated Prism avatar monogram with
`.psPrismAvatar .psPrismMonogram[aria-label]`. Check the current CDP page before navigating
to the sandbox route, so an already authenticated library page does not trigger a misleading
signin prompt.

## Recommended follow-up

Keep the session check selector set small and periodically verify it against the live
Pluralsight UI. A future improvement could use a stable authenticated API response rather
than presentation selectors.
