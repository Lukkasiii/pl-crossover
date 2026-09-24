# Performance measurements

Not part of `npm run test:e2e` / CI -- these are timing measurements against
real wall-clock and browser frame-scheduling behaviour, and a shared CI
runner's noise would make the numbers meaningless. Run locally, on an
otherwise idle machine:

```
npx playwright test --config=playwright.perf.config.ts
```

Writes `raf-coalescing-results.json` (gitignored) and prints the same
summary to stdout. See `raf-coalescing.spec.ts`'s own comment for what it
measures and why interleaved A/B, not block A-then-B.
