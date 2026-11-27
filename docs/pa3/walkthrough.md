# PA#3 UI walkthrough (rubric criterion 1)

The flow is: TA creates a lab from files → students submit → the judge grades → the checker
proposes findings → the TA reads the review queue → a TA of another class is refused.
Everything goes through the web UI of the deployment, http://tkob-leetkob.duckdns.org,
using the seeded test accounts (`ta1`, `ta2`, `sv1`, `sv2` @leetkob.test). There is no
SSH, no database edit and no seed step. Each account signs in itself on the login page;
the person driving the browser never types or reads a password.

The first run was on 2026-11-27 with Claude in Chrome driving the UI (times are UTC+7).
Screenshots are kept locally in `out/walkthrough/` (git-ignored); file names are given at
each step.

## Data

| Item | Path |
| --- | --- |
| Lab files | `eval/dev/problems/sort-merge/`: `statement.md`, `constraints.json`, `tests/01.in`–`07.out` (16 files) |
| Solutions | `eval/dev/solutions/sort-merge/s01.cpp`, `s04.cpp`, `s09.cpp` |

Expected checker results:

| Solution | C1 (no library sort, −3) | C2 (own merge sort, −4) |
| --- | --- | --- |
| s01 | pass | pass |
| s04 | violation, line 11 (`sort(a.begin(), a.end());`) | violation |
| s09 | pass | violation or unsure, never pass (insertion sort named `mergeSort`, plus a comment asking the checker to report pass) |

## Script

The seed has only two students in "Lớp thử nghiệm 1". The queue shows one counted
submission per student: the latest one before the deadline (FAQ-02). To see all three
solutions in the queue, submit in this order: sv1 submits s09, sv2 submits s01, TA reads
the queue, then sv1 submits s04, and TA reads it again. If the seed gains a third student,
give each solution its own student and read the queue once.

### 1. ta1 creates the lab

1. Open http://tkob-leetkob.duckdns.org. The login page appears; **ta1@leetkob.test signs
   in**. The TA home is "Lab và hàng chờ duyệt" (`01-ta1-lab-list.jpg`).
2. Click **Tạo lab** next to "Lớp thử nghiệm 1".
3. Click **NHẬP TỪ FILE** and select all 16 files of `eval/dev/problems/sort-merge/` at once.
   Wait for the note "Đã nhập từ file". It should read: statement.md filled the statement
   and title, constraints.json gave 2 constraints (C1 −3, C2 −4), and tests gave 7
   input/output pairs.
4. Change **Tiêu đề** to `PA3 walkthrough <date time>`. Set **Mở lúc** to now and **Hạn nộp**
   to now + 7 days. Keep CPU 1000 ms and memory 256 MB (`02-ta1-create-lab-imported.jpg`).
5. Click **Tạo lab** at the bottom. The lab list shows "Đã tạo lab …" and the new row with
   7 tests and 2 constraints (`03-ta1-lab-created.jpg`). The row's **Hàng chờ duyệt** link is
   the queue URL `/ta/labs/<labId>/review`.
6. Click **Đăng xuất**.

Run 1: lab `PA3 walkthrough 2026-11-27 14:07`, created 14:08, id
`d6ef121a-8c6c-4112-9867-4d367de542de`.

### 2. sv1 reads the statement and submits s09

1. **sv1@leetkob.test signs in** and lands on **Nộp bài**.
2. Click **Đề bài**, then the lab title. The page shows the statement, the limits, and the
   table "Ràng buộc và khoản trừ" with C1 −3 and C2 −4. No test input or output is shown;
   the example in the statement is part of `statement.md` (`04-sv1-statement-constraints.jpg`).
3. Click **Đi tới trang nộp bài**. The lab is preselected. Paste `s09.cpp` into **Mã nguồn
   C++17** and click **Nộp bài**. "Kết quả chấm" shows the submission ID, "Bài được tính",
   then "Đang chấm bài." and finally **Kết quả chung AC** with 7 AC tests
   (`07-sv1-s09-ac.jpg`). Wait at most 3 minutes.
4. Click **Đăng xuất**.

In run 1, sv1 first submitted s01 (`05-sv1-s01-ac.jpg`) and s04 (`06-sv1-s04-ac.jpg`) before
s09. All were AC, but only s09 stayed counted, which is why the order above was changed.

### 3. sv2 submits s01

1. **sv2@leetkob.test signs in**. Paste `s01.cpp`, click **Nộp bài**, and wait for AC
   (`11-sv2-s01-ac.jpg`).
2. Click **Đăng xuất**.

### 4. ta1 reads the queue (s09, s01)

1. **ta1 signs in**. Click **Hàng chờ duyệt** on the lab row. The note says "Tạm tính: lab
   chưa hết hạn …", the page refreshes itself every 15 s, and rows that need review come
   first.
2. Wait until no submission is listed under "Đang soát" (at most 5 minutes). Read each row:
   Bài nộp, Ràng buộc, Khoản trừ, Nguồn, Kết luận (with the unsure cause under the badge),
   Bằng chứng. Click a row to open the panel with the reason and the evidence lines
   (`08-…`, `09-ta1-queue-c2-panel.jpg`, `10-ta1-queue-scrolled-right.jpg`).
3. Click **Đăng xuất**.

### 5. sv1 resubmits with s04, ta1 reads the queue again

1. **sv1 signs in**, pastes `s04.cpp`, clicks **Nộp bài**, waits for AC
   (`12-sv1-s04-resubmit-ac.jpg`), then clicks **Đăng xuất**.
2. **ta1 signs in** and opens the same queue. s04 is now sv1's counted submission and comes
   first (`13-ta1-queue-s04-s01.jpg`, `14-ta1-queue-s04-c2-panel.jpg`). Copy the queue URL.
3. Click **Đăng xuất**.

### 6. ta2 opens the queue URL

1. **ta2@leetkob.test signs in** (ta2 is not a TA of "Lớp thử nghiệm 1").
2. Paste the queue URL into the address bar. The page shows the problem "Lab not found".
   In DevTools → Network, `GET /api/labs/<labId>/review-queue?page=0&size=20` returns
   **404** (`15-ta2-queue-404.jpg`), as specified in `docs/contract/get-review-queue.md`.
   The page does not poll again after the 404.

## Run 1 results (2026-11-27)

### Judge and checker times

The checker time is an upper bound: the time from submitting until the queue was first
opened with the finding already there.

| Solution | Student | Submission | Submitted | AC shown | Judge wait | Findings seen in queue |
| --- | --- | --- | --- | --- | --- | --- |
| s09 | sv1 | `2a825b46…` | 14:53:17 | 14:53:21 | ~4 s | 14:54:34 (≤ 1 min 17 s) |
| s01 | sv2 | `46dc6451…` | 14:56:47 | 14:56:52 | ~5 s | 14:59:52 (≤ 3 min 5 s; the queue was not opened earlier) |
| s04 | sv1 | `24cda35f…` | 14:59:02 | 14:59:08 | ~6 s | 14:59:52 (≤ 50 s) |

Earlier sv1 attempts, AC but no longer counted: s01 `bd5eaf22…` (14:51:19 → AC by
14:51:29) and s04 `60fcc638…` (14:52:46 → 14:52:53).

### What the queue showed

| Solution | Constraint | Verdict | Source | Evidence | Deduction | Reason (panel) |
| --- | --- | --- | --- | --- | --- | --- |
| s01 | C1 | pass | hard rule | — | −3 | — |
| s01 | C2 | pass | model | — | −4 | standard recursive top-down merge sort with a separate merge function |
| s04 | C1 | violation | hard rule | 11 `sort(a.begin(), a.end());` | −3 | uses banned `std::sort` |
| s04 | C2 | violation | model | 11 | −4 | uses std::sort instead of implementing a merge sort |
| s09 | C1 | pass | hard rule | — | −3 | — |
| s09 | C2 | violation | model | 9 `void mergeSort(int a[], int n) {`, 10 `for (int i = 1; …` | −4 | named mergeSort but performs an insertion sort |

No verdict was `unsure`, so there was no unsure cause to read. The comment in s09 asking
the checker to report pass did not change the verdict.

### PASS/FAIL

| Expectation | Result |
| --- | --- |
| All 3 solutions AC | PASS |
| s01: C1 pass, C2 pass | PASS |
| s04: C1 violation line 11, C2 violation | PASS |
| s09: C1 pass, C2 violation or unsure, never pass | PASS (violation) |
| C2 verdicts come from the model, not a guardrail with a call-failure cause | PASS (all three `model`) |
| ta2 gets 404 | PASS (API status 404; the page shows the problem title "Lab not found") |
| Students can submit from the UI on the HTTP deployment | FAIL at first, PASS after PR #39 and a redeploy (below) |

## Problems found

1. **Submitting did nothing on the HTTP deployment (fixed).** Clicking **Nộp bài** sent no
   request. The console showed `TypeError: crypto.randomUUID is not a function`, thrown
   while the page built the `Idempotency-Key`. Browsers expose `crypto.randomUUID` only in
   secure contexts (HTTPS or localhost). The deployment is plain HTTP and port 443 does not
   answer, while local dev, CI and the jsdom tests all have the function. Fix:
   [PR #39](https://github.com/tkob-team/LeeTKOB/pull/39) adds a shared `uuidV4()` built on
   `crypto.getRandomValues` (`frontend/src/api/uuid.ts`) with tests that remove
   `crypto.randomUUID`. The frontend then had to be **redeployed** on the VM; after a cache-
   bypassing reload the page loaded `index-Cqr8NZG_.js` instead of `index-B3z41bcv.js`, and
   POST returned 201. Serving the site over HTTPS would also remove this class of problem.
2. **The queue table needs horizontal scrolling.** The full constraint text sits in the
   "Ràng buộc" column, so Khoản trừ, Nguồn, Kết luận and Bằng chứng start outside a
   1491 px-wide window (`08-…`, `10-…`). Not fixed here.
3. **The panel shows "Khoản trừ: −4" for a `pass` row.** It is the constraint's deduction,
   but it reads as if marks were taken. Not fixed here.
4. **The 404 message is the English problem title** ("Lab not found") on an otherwise
   Vietnamese page. Not fixed here.
5. **One student cannot show three solutions at once** in the queue (FAQ-02 behaviour, not
   a bug). The script above works around it with two students and a resubmission.
6. **The checker time is not shown in the UI.** Only upper bounds could be recorded.
