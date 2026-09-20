# Verification receipt

Status: **COMPLETE** — final core, web, configuration, and container reviews
passed.

Receipt captured: 2026-09-20 14:38 +07:00. This records the uncommitted
working tree based on `9a2acdc327f6c2cea42540653768043b4cde99c6`; it is not a
commit or a release artifact.

## Repository identity

- Local branch: `main`.
- Upstream: `origin/main`.
- Local `HEAD` and `origin/main`: `9a2acdc327f6c2cea42540653768043b4cde99c6`.
- Local `origin/HEAD`: `refs/remotes/origin/main`.
- Remote `HEAD` and `refs/heads/main`: `9a2acdc327f6c2cea42540653768043b4cde99c6`.
- GitHub API default branch: `main`.
- `refs/heads/master` is absent from the remote read-back.

The `master` to `main` rename was performed through GitHub's branch rename API
and the local tracking refs were updated. No source commit, source push, GHCR
image push, deployment, or release tag was performed.

## Working-tree receipt

Read-only checks captured for this receipt:

```text
git status --short --branch       PASS (main...origin/main)
git diff --check                 PASS (no output)
```

The intentional uncommitted modernization consists of the changed canonical
configuration, examples, snippets, and README, plus new `.github/`, `.works/`,
`Dockerfile`, `compose.yaml`, `docs/`, `lib/`, `scripts/`, `tests/`, and `web/`
files. No unrelated source area was added to the worktree.

`git ls-files` found no tracked `node_modules/`, `dist/`, `playwright-report/`,
`test-results/`, `coverage/`, or `.vite/` path. Existing local dependency,
build, and browser-report directories are ignored by `.gitignore` and are not
part of the candidate.

## Final file hashes

These SHA-256 values identify the implementation and documentation files. The
receipt, review reports, and other `.works/` evidence are deliberately excluded
from implementation identity so the record does not hash itself.

```text
lib/config.js                         c375fc4714f00d6ddba1c27c4f30184d5f5ffb986acc73b0e9ebda7633a128b8
lib/version.js                        4d78023904cb07c4d06dc7205dafb2a1a6ae1678c7a61548b530874bea2bc689
nginx.conf                            96785356e27593c8dfcc02b3ac146a61d9a0bc83c2b1d4fe9a82aea04dd9b9d4
README.md                             68868344becb3148f11d04908acb4fb02ed7b9b8e48e06a836de3dae10ffc0db
Dockerfile                            9f8254e735be6b2aab2f840ed13c95b87b0ef8c33bcb12f26f1ce368bfd6ee4f
compose.yaml                          296532f3bfa28073fa9946ead5a671038bb1acec2529148f65fdd9847f9e44b2
.github/workflows/ci.yml              eeef6173dfaca75d3f5123136cca27a51b14ceaa93ed8f302943294b5f887a4d
.github/workflows/publish-image.yml   f85941f496e21411ba400bf21479e6cd0999b4002c6279de43988477877074b8
docs/benchmarking.md                  b755078335cb7279eece327b016dc355d340390d6d2a45b967b08ff0ef150276
docs/operations.md                    d567bf8d797bbce9bf68957b8b94259ca275ee2e11a8cd74e2f630cb32139c45
web/package.json                      d2d844eb3a6f42ff2663e18d7b67e320e57503bcb05a41ae76fb7e9bd8aae39c
web/package-lock.json                 5e99c9dd1c56ea88754e354e19546d83c15dfad648ca696159009b8f4e816be2
web/src/App.vue                       2c75f1bfe7d8a068848626e8be1d664a386d2a2d43e06b106a2da9cb71664dcf
web/src/style.css                     b20d482c981ecadfedf718df850a1bac3244ffd0f05c4bf66bf3162d6a57bf57
web/src/App.test.js                   f2d6e4b8a39f60f75329cbd6583e91ba2b11495f2252804e42cf27dca58cb3c6
web/tests/generator.spec.js            c5c720cb57b2ca8ae3350b971bdad513d2e9815aff8e140af0e70639364ad
scripts/smoke-image.sh                c4cde8d5dd6b70ecb46add9376a8faddbeb9e822fc8ca3727b441145062d4009
scripts/smoke-proxy.mjs                1badddfbddb8a2545ae720757e09172fc9ab5267f7b31cae2d1beb8583ccf73d
scripts/smoke-cache.mjs                2fb46455e3e28c3df57d6ecd132374558d4095a2b5a3293b8a8befcdca616385
scripts/smoke-php.mjs                  26e31c381d7aa7afd5ceb85b03d8588e896984ae5f2aef8b6740ba46a4f63022f
scripts/smoke-tls.mjs                  75dd92de8b07a78fcf3969849a0c39a64f43900c37a1137b0544713d9c28665c
tests/config.test.mjs                  2e5c124016abe4d6dbd5329382e28e39d62be66fd8c906e23e049fc441829bcb
```

The final independent configuration review also recorded core digest
`46fc049eed8e5e890409ed46b18ac9bdc9dc440d8e5a0fce3225dafbae6caeee` and
`lib/config.js` hash `c375fc47…`. The final image under review was
`sha256:e81ba5d55f64fcc1061618abe364bdc2f0ba26cc98626ab235ff02aa38808ed2`.

## Final evidence

The table distinguishes evidence independently reviewed from results reported
by builders or the delivery coordinator. Full suites were not rerun for this
receipt.

| Area | Evidence | Provenance |
| --- | --- | --- |
| Core renderer | 14 core tests passed | Reported by the delivery coordinator from the final web/docs review. |
| Generated examples | 12 examples passed freshness/drift validation | Reported by the delivery coordinator from the final web/docs review. |
| Web unit tests | 11/11 passed; Vite production build completed | Builder receipt and final web/docs review. |
| Browser UI | 2/2 Chromium tests passed, including export/download and narrow viewport behavior | Builder receipt and final web/docs review. |
| Configuration and legacy runtime | Final independent review passed with no open high- or medium-severity finding | `review-config.md`; independent review. |
| NGINX syntax | Static, SPA, PHP, Go, and proxy profiles passed with and without TLS | Final independent container review; runtime `1.30.5`. |
| Docker image | Fresh image passed as non-root UID `101:101` | Final independent container review; digest recorded above. |
| Static image smoke | Health, SPA fallback, assets, missing assets, sensitive paths, gzip, version, user, and readiness checks passed | Final independent container review. |
| Proxy, cache, PHP, and TLS runtime | `smoke-proxy.mjs`, `smoke-cache.mjs`, `smoke-php.mjs`, and `smoke-tls.mjs` all passed against the final image | Final independent container review. |
| Compose TLS | Actual profiled TLS Compose startup and health passed | Final independent container review. |
| Container isolation | UUID readiness fixes passed and no test containers or networks leaked | Final independent container review. |
| Publication workflow | Strict stable-only `vX.Y.Z` positive/negative cases and manual SHA-only tagging passed; unused permissions were removed | Final independent container review. |
| Web/docs review | All findings passed; the browser command is now documented in the validation guide | Final web/docs review. |

An earlier pre-fix image smoke reported a missing asset returning `200`. That
failure is retained as diagnostic history; the final post-fix static smoke
passed and is the result counted above.

## README launch paths

The documented Compose launch is:

```bash
docker compose up --build
# open http://localhost:8080
```

For local Vite development:

```bash
cd web
npm ci
npm run dev
```
