# Studio authoring review — 13 September 2026

Result: desktop and mobile authoring flows passed in an isolated fixture. No project README was overwritten through Studio.

The Composer, Document Desk, and Proof Sheet are now Compose, live preview, and Evidence/Review roles in one local app. Creative Production source-preservation and Product Design implementation guidance informed the retained off-white/ink palette, restrained lime selection, cobalt focus, thin borders, and document-first layout. The wider authoring panel is an intentional adaptation of the recorded Document Desk reference, not a claim of exact fidelity to missing mockups.

Screenshots: `/tmp/create-readme-authoring-desktop.png` (1440 × 1024) and `/tmp/create-readme-authoring-mobile.png` (390 × 844 viewport, full-page capture). Desktop has independently scrolling composer/document panels and persistent status; mobile stacks controls and preview. Measured mobile document width was 375 px within a 390 px viewport, with no horizontal page overflow. Code remains independently scrollable. Visible focus and readable labels were inspected.

Browser verification used `/tmp/create-readme-authoring-9n4Lbw`, never another repository. Desktop: edited title/description/features, moved Usage before Installation, enabled Features, selected the Node badge and flat style, rescanned without losing draft choices, inspected evidence and the full before/after replacement, saved config separately, then explicitly wrote README. An external README edit after review produced a conflict and retained both the external content and draft; fresh review enabled recovery. Config retained its unknown `customFutureField` without adding detected defaults.

Mobile: edited title, moved Features up, rescanned with draft retention, inspected Markdown/evidence/review, refused a config changed after review, then separately saved config and README after fresh review. The replacement review is a full before/after comparison, not an inline patch or handwritten-content merge. File changes were confirmed on disk. Badge comparison deliberately uses descriptions and generated URLs, not remote artwork.

Verification: 59 Node tests passed; production dependency audit reported zero vulnerabilities; package dry-run includes authoring server and all three public assets. No site files changed. Native browser opening on Windows/Linux was not exercised. Atomic replacement uses repeated local path/revision checks but cannot eliminate every hostile filesystem race with Node's path-based APIs. Drafts remain in memory until explicitly saved as configuration.

Final focused review found and corrected two P2 issues: technology editing now exposes and retains category metadata; badge controls use the active model's inherited selection, including a license override. A browser regression saved a second technology while retaining React's `UI library` category and selected Node while retaining the inherited MIT badge. Config bytes confirmed both fixes. Successful-write refresh warnings are surfaced without misreporting the write as failed.

## Historical read-only slice

The following records the earlier milestone; its scope limits and test count are historical, superseded by the authoring review above.

# Studio implementation review

final result: passed

Source visual truth: `/Users/gregclark/.codex/generated_images/01a05fb9-bb5c-7773-9192-573e1b1e9a91/exec-b114f935-8ecc-4f8d-bc56-6972546ffa64.png` (Document Desk).

Implementation screenshot: `/tmp/create-readme-studio-desktop.png`.
Mobile screenshot: `/tmp/create-readme-studio-mobile.png`.

Desktop CSS viewport: 1440 × 1024; implementation pixels: 1440 × 1024, density 1. Source: 1487 × 1058. The source and implementation were opened together in one comparison input, with the source fit to the same desktop composition. State: rendered preview, repository create-readme, light theme. Mobile CSS viewport: 390 × 844, full-page capture; document scroll width measured at 375 px with the scrollbar, no horizontal page overflow.

## Findings and comparison history

- Initial P2: the footer status scrolled away on desktop. Fixed by constraining the workspace to viewport height with independent inspector/document scrolling. The revised desktop screenshot shows the status visible below both panels.
- Post-fix comparison: no actionable P0/P1/P2 layout issues. The 27% inspector, top masthead, thin borders, document heading and dark code blocks preserve the selected composition. Desktop controls are visible; mobile stacks facts and document with wrapping metadata and scrollable code.
- Typography: system sans and monospace provide the intended heading/utility distinction. The source font was not identified, so this is a close system-font adaptation rather than exact font matching. Heading scale, readable labels, spacing, and wrapping were inspected in the full-resolution images; no separate crop was needed.
- Colors: existing off-white/ink tokens retained; lime identifies the selected tab, cobalt identifies links/focus. No decorative imagery was required.
- Images: repository images and badges are deliberately represented by escaped labels. No external media loads. This narrows preview fidelity and is stated in the interface and README.
- Content: the mock's fictional version, download count, AI claims, unsupported command flags, and deployment row were replaced by real shared-engine output. Section length and count differ intentionally. The generated README remains identical to the core renderer's output in the Markdown tab.
- Controls: Rendered/Markdown tabs, arrow-key tab navigation, rescan, and reload were exercised in the browser. No browser warning/error logs were captured. Browser error-state layout was not separately exercised; API configuration failures and missing authorization were tested automatically.
- The mock's Close Studio button is omitted: lifecycle remains Ctrl+C in the launching terminal, as documented. No write endpoint was introduced.

## Verification

53 Node tests passed, including loopback binding, Host/Origin enforcement, token requirement, GET/HEAD routes, rejected writes, traversal/static-file isolation, configuration refresh/failure, shared Markdown equality, and HTML/media safety. Production dependency audit: zero vulnerabilities. Package dry-run contains all Studio assets. Full audit also reports three high-severity entries in existing Wrangler → Miniflare → Sharp development tooling; not introduced by the Studio dependency.

## Follow-up

The original composer remains the authoring destination. Editing, badge selection, reviewed writes, and the Proof Sheet evidence inspector are outside this read-only slice. Native browser-opening behavior was not manually exercised on Windows or Linux.
