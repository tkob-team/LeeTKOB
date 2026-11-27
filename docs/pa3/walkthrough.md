# PA#3 UI walkthrough (rubric criterion 1)

The flow is: TA creates a lab from files → students submit → the judge grades → the checker
proposes findings → the TA reads the review queue → a TA of another class is refused.
Everything goes through the web UI of the deployment, http://tkob-leetkob.duckdns.org,
using the seeded test accounts (`ta1`, `ta2`, `sv1`, `sv2` @leetkob.test). There is no
SSH, no database edit and no seed step. Each account signs in itself on the login page;
the person driving the browser never types or reads a password.

Run 1 was on 2026-11-27 and run 2 on 2026-11-28, both with Claude in Chrome driving the UI
(times are UTC+7). Screenshots are kept locally (git-ignored): run 1 in `out/walkthrough/`,
run 2 in `out/walkthrough/2026-11-28-ui3/`. The script below describes the UI as of branch
`ui-3`; file names at each step are from run 1 unless marked otherwise.

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
3. Click **Nhập từ file** and select all 16 files of `eval/dev/problems/sort-merge/` at once.
   Wait for the panel "Đã nhập từ file". It should read: statement.md filled the statement
   and title, constraints.json gave 2 constraints (C1 −3, C2 −4), and tests gave 7
   input/output pairs.
4. Change **Tiêu đề** to `PA3 walkthrough <date time>`. Set **Mở lúc** to now and **Hạn nộp**
   to now + 7 days; both are required, and the form says so under the field (and does not
   send) when one is empty or Hạn nộp is not after Mở lúc. Set **Thời gian CPU (ms)** to
   **2000**, matching "Time limit: 2 seconds" in `statement.md`, and keep **Bộ nhớ (MB)** at 256
   (`02-ta1-create-lab-imported.jpg`; runs 1 and 2 kept the default 1000 ms).
5. Click **Tạo lab** at the bottom. The lab list shows "Đã tạo lab …" and the new row with
   7 tests and 2 constraints (`03-ta1-lab-created.jpg`). The row's button **Hàng chờ duyệt:
   <lab title>** opens the queue URL `/ta/labs/<labId>/review`.
6. Click **Đăng xuất**.

Run 1: lab `PA3 walkthrough 2026-11-27 14:07`, created 14:08, id
`d6ef121a-8c6c-4112-9867-4d367de542de`.

### 2. sv1 reads the statement and submits s09

1. **sv1@leetkob.test signs in** and lands on **Nộp bài**.
2. Click **Đề bài**, then the lab title. The page shows the statement, the limits ("Giới hạn:
   CPU 2000 ms · thời gian thực 6000 ms · bộ nhớ 256 MB") and the table "Ràng buộc và khoản
   trừ" with the columns ID, Chi tiết ràng buộc and Khoản trừ: C1 −3 and C2 −4, with the full
   constraint text and the banned names as inline code. No test input or output is shown; the
   example in the statement is part of `statement.md` (`04-sv1-statement-constraints.jpg`).
3. Click **Đi tới trang nộp bài**. The lab is preselected (a `?lab=` id that is not in the
   student's list shows "Không tìm thấy lab này." and preselects nothing). Paste `s09.cpp`
   into **Mã nguồn C++17** and click **Nộp bài**. "Kết quả chấm" shows "Mã bài nộp …", "Bài
   được tính điểm (lần nộp cuối trước hạn)", then "Bài nộp đã vào hàng đợi." and "Đang chấm
   bài." with a spinner, and finally **Kết quả chung AC** "Đúng tất cả test" with 7 AC tests
   (`07-sv1-s09-ac.jpg`). Other verdicts carry their own caption, for example CE "Lỗi biên
   dịch" and TLE "Quá giới hạn thời gian CPU (2000 ms)". Wait at most 3 minutes.
4. Click **Đăng xuất**.

In run 1, sv1 first submitted s01 (`05-sv1-s01-ac.jpg`) and s04 (`06-sv1-s04-ac.jpg`) before
s09. All were AC, but only s09 stayed counted, which is why the order above was changed.

### 3. sv2 submits s01

1. **sv2@leetkob.test signs in**. Paste `s01.cpp`, click **Nộp bài**, and wait for AC
   (`11-sv2-s01-ac.jpg`).
2. Click **Đăng xuất**.

### 4. ta1 reads the queue (s09, s01)

1. **ta1 signs in**. Click **Hàng chờ duyệt: <lab title>** on the lab row. The note says
   "Tạm tính: lab chưa hết hạn, hàng chờ đổi khi sinh viên nộp lại. Tự làm mới mỗi 15 giây.
   Bài cần duyệt (violation, unsure) xếp trước."
2. Each counted submission is a block headed "Sinh viên XXXX" (an anonymous label, never the
   name), "Được tính điểm", "Nộp lúc …" with seconds, "Chấm test AC" and "Mã bài nộp …". Wait
   until no block says "Đang soát ràng buộc…" (at most 5 minutes). Each block has one row per
   constraint with the columns Ràng buộc (the full text, wrapped, banned names as inline
   code), Khoản trừ, Nguồn (`hard rule`, `model` or `guardrail`), Kết luận (with the unsure
   cause under the badge) and Bằng chứng ("dòng 10, 13"). A `pass` row reads "0 (−3 nếu vi
   phạm)" in Khoản trừ; `violation` and `unsure` read "−3". Click a row (or focus it and press
   Enter) to open the panel: constraint text, verdict, "Khoản trừ: …", "Lý do: …" with
   backticked names as inline code (hard-rule reasons in Vietnamese, for example "Dùng hàm bị
   cấm `std::sort`."), and the evidence lines (run 2: `27-ta1-queue-s09-c2-panel.jpg`,
   `28-queue-enter-opens-panel.jpg`).
3. Click **Đăng xuất**.

### 5. sv1 resubmits with s04, ta1 reads the queue again

1. **sv1 signs in**, pastes `s04.cpp`, clicks **Nộp bài**, waits for AC
   (`12-sv1-s04-resubmit-ac.jpg`), then clicks **Đăng xuất**.
2. **ta1 signs in** and opens the same queue. s04 is now sv1's counted submission and comes
   first; sv1's earlier AC submission (s09) is listed under "Các lần nộp cũ hơn (không tính
   điểm)" with the tag "Không tính điểm" (`13-ta1-queue-s04-s01.jpg`; run 2:
   `32-ta1-queue-s04-c1-panel.jpg`). Copy the queue URL.
3. Click **Đăng xuất**.

### 6. ta2 opens the queue URL

1. **ta2@leetkob.test signs in** (ta2 is not a TA of "Lớp thử nghiệm 1").
2. Paste the queue URL into the address bar. The page shows "Không tìm thấy lab" and "Lab
   không tồn tại hoặc bạn không phải TA của lớp có lab này.", with the button **Về danh sách
   lab** and no auto-refresh note. In DevTools → Network,
   `GET /api/labs/<labId>/review-queue?page=0&size=20&includeEarlier=true` returns **404**
   (run 2: `33-ta2-queue-404.jpg`), as specified in `docs/contract/get-review-queue.md`. The
   page does not poll again after the 404. No page ever shows the server's English title or
   the problem `type` URN.

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

## Problems found in run 1

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
   1491 px-wide window (`08-…`, `10-…`). Fixed on branch `fix/review-queue-walkthrough`: the
   constraint text is clipped (full text in the panel); to be rechecked on the deployment.
   Later, grouping the queue by submission (commit 7044372) made each block narrow enough for
   the full text to wrap instead (run 2 screenshots).
3. **The panel shows "Khoản trừ: −4" for a `pass` row.** It is the constraint's deduction,
   but it reads as if marks were taken. Fixed on the same branch: `pass` reads "Không trừ (mức
   trừ nếu vi phạm: N)"; `−N` only for `violation` and `unsure`.
4. **The 404 message is the English problem title** ("Lab not found") on an otherwise
   Vietnamese page. Fixed on the same branch: "Không tìm thấy lab".
5. **One student cannot show three solutions at once** in the queue (FAQ-02 behaviour, not
   a bug). The script above works around it with two students and a resubmission. Since
   contract `get-review-queue` 1.1.0 the page asks for `includeEarlier=true` and lists earlier
   AC submissions under "Bài nộp trước (không được tính)", so one student's three solutions are
   all visible.
6. **The checker time is not shown in the UI.** Only upper bounds could be recorded.

## Run 2 results (2026-11-28, UI-3 audit)

Run 2 followed the script on https://tkob-leetkob.duckdns.org (HTTPS answered; bundle
`index-CCAEFoG-.js`, the build of PR #47) from 01:40 to 02:02, and also tried error, edge,
keyboard and narrow-screen cases. Each account signed in by itself; no code was changed during
the run. This summary follows the written UI-3 report and the screenshots kept with it in
`out/walkthrough/2026-11-28-ui3/` (git-ignored; file names in brackets).

Two limits of the run: the browser window could not be resized, so 375 px and 1280 px were
checked in a same-origin iframe of that width (media queries apply as on a real screen) with
overflow measured in JavaScript; and there is no admin step, since the frontend has only `/ta/*`
and `/student/*` pages.

Lab `[test-ui3] PA3 walkthrough 2026-11-28 01:41` (id `168aaca6-a6a4-4c95-b463-c8d04e76bca4`),
opens 28/11/2026 01:42, due 05/12/2026 01:42, 7 tests, 2 constraints, CPU 1000 ms
(`01-ta1-lab-created.jpg`). Before s09, sv1 submitted a compile error (CE `89df8349…`) and an
endless loop (TLE `d6f77c86…`), so that s09 became the counted submission.

### Judge and checker times

Judge: every AC was shown at most 8 s after submitting. Checker: the findings were in the queue
at most 1 min 14 s after submitting. Both are upper bounds read from the UI.

| Solution | Student | Submission | Submitted | Judge | C1 (hard rule) | C2 (model) |
| --- | --- | --- | --- | --- | --- | --- |
| s09 | sv1 | `0db1e720…` | 01:48:01 | AC 7/7, ≤ 8 s (`18-sv1-s09-ac.jpg`) | pass | violation, lines 10, 13: "named mergeSort … insertion sort" (`27-…`) |
| s01 | sv2 | `6037605f…` | 01:52:16 | AC, ≤ 8 s (`22-sv2-s01-ac.jpg`) | pass | pass (`28-…`) |
| s04 | sv1 | `36026664…` | 01:57:04 | AC (`31-sv1-s04-keyboard-ac.jpg`, keyboard only) | violation, line 11 `sort(a.begin(), a.end());` | violation, line 11 (`32-…`) |

### Steps

| Step | Result | Note |
| --- | --- | --- |
| 1.1 ta1 signs in, "Lab và hàng chờ duyệt" | PASS | |
| 1.2 **Tạo lab** for "Lớp thử nghiệm 1" | PASS | |
| 1.3 Import the 16 files | PASS | Statement, title, 2 constraints, 7 test pairs. The button reads "Nhập từ file" (the old script said "NHẬP TỪ FILE"). |
| 1.4 Title, Mở lúc, Hạn nộp, CPU 1000 ms, 256 MB | PASS | Title prefixed `[test-ui3]`. |
| 2.1 sv1 signs in, lands on **Nộp bài** | PASS | Signed in with the keyboard only: Tab order right, focus ring visible. |
| 2.2 Statement and "Ràng buộc và khoản trừ" | PASS | C1 −3, C2 −4, no test shown. |
| 2.3 Submit s09 from the statement page | PASS | Lab preselected; AC 7/7 within 8 s. |
| 3 sv2 submits s01 | PASS | AC within 8 s. |
| 4.1 ta1 opens the queue | PASS | "Tạm tính…", refresh every 15 s; signing in returned to the queue link. |
| 4.2 Rows and panel | PASS | s09 and s01 as in the table above. |
| 5.1 sv1 submits s04 | PASS | Keyboard only (Tab ×7, type, Tab, Enter). |
| 5.2 ta1 reads the queue again | PASS | s04 first; s09 under "Các lần nộp cũ hơn"; findings within 1 min 14 s. |
| 6 ta2 opens the queue URL | PASS | One `GET …/review-queue` → 404, "Không tìm thấy lab", no further request in 21 s (`33-ta2-queue-404.jpg`). |

The queue no longer needs horizontal scrolling at 1222 px. The constraint text is shown in full
(not clipped as run 1 item 2 described), and a `pass` row reads "0 (−3 nếu vi phạm)" (not the
wording in run 1 item 3); the script above now says so.

Also PASS: loading and empty states ("Đang tải hàng chờ…", "Chưa có bài được tính", "Lớp này
chưa có lab."); a double click sends one request when creating a lab and when submitting (the
login button is disabled while sending, read from the code); empty, blank and over-64 KB code is
refused in Vietnamese without a request (`12-…`, `13-…`); login → submit → result with the
keyboard only, and Enter opens a queue row (`28-…`); no overflow at 1280 px; signing out in one
tab sends the other tab to /login; Back after submitting returns to the statement, Back after
signing out stays on /login with no data shown; a deep link while signed out returns to that
page after signing in.

### Problems found in run 2

No problem blocked the flow. The report lists 18; branch `ui-3` (PR #53) fixes these:

| # | Seen in run 2 | Change on `ui-3` |
| --- | --- | --- |
| 1 | After the token was removed, every page showed an English box ("Authentication is required … urn:leetkob:problem:unauthenticated · 401") and stayed put with the user's name in the header (`09-…`, `38-…`) | The session is cleared and the user lands on `/login?next=<page>` with "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."; signing in returns to the page |
| 2 | English text and raw URNs on create lab, queue and student statement ("Invalid request", "Required RFC 3339 timestamp with an offset.", "labId must be a UUID.", "Lab not found") (`05-…`, `35-…`, `36-…`) | One function maps `type` (and status) to Vietnamese on every page; field errors follow the field name; an unknown type reads "Có lỗi xảy ra. Vui lòng thử lại." |
| 3 | Create lab without dates went to the server (400); only Mở lúc showed an error, the summary sat far above the button, the error stayed after the date was filled (`02-…`, `03-…`) | Both dates required and checked before sending, errors under both fields, focus and scroll to the first, errors cleared on change |
| 4, 5 | CE showed only the badge; an endless loop showed a static "Đang chấm bài." for about 20 s, then "TLE" ×7 without explanation (`14-…` to `17-…`) | Spinner while queued or grading; Vietnamese caption per verdict, CE "Lỗi biên dịch", TLE with the lab's CPU limit (compiler output: see PA4) |
| 7 | `?lab=<unknown id>` silently chose the first lab (`37-…`) | "Không tìm thấy lab này." and no lab preselected |
| 8 | A theme change in tab 2 did not reach tab 1, which after signing out showed light with "Tối" checked (`19-…`, `20-…`) | Theme follows `storage` events for its key; the buttons always match the screen |
| 11 | Panel reason "uses banned \`std::sort\`" with raw backticks (`32-…`) | Backticked text renders as inline code; hard-rule reasons read in Vietnamese ("Dùng hàm bị cấm `std::sort`.") |
| 12 | The 404 page lost the header, menu and "Đăng xuất" for a signed-in user (`06-…`) | The 404 page sits in the TA or student layout |
| 13 | ta1 signed out on the queue, ta2 signed in and landed on ta1's last URL | Signing out drops `next`; the next user starts at their role's home |
| 17 | The statement says "Time limit: 2 seconds" while the lab used CPU 1000 ms | The script sets CPU 2000 ms; `eval/` is not edited (AGENTS.md), so the statement text stays as it is |
| 18 | The walkthrough did not match the UI (button label, pass row wording, clipping) | This document |

### Moved to PA4

Still open after `ui-3`, carried over to PA4:

| # | Problem | Suggested fix (from the report) |
| --- | --- | --- |
| 4 | A CE shows no compiler message (the API returns `tests: []` and no output) | Backend returns the compiler's stderr, cut short and cleaned; the frontend shows it under the badge (needs a contract change) |
| 6, 16 | At 375 px: the TA lab list scrolls the whole page (750 px wide) with "Hàng chờ duyệt" off screen; the queue hides "Kết luận"; the student lab table hides a column; the header wraps to two lines and "Đăng xuất" breaks; names like `std::stable_sort` break mid-word (`23-…`, `24-…`, `29-…`, `30-…`) | Compact header; responsive tables; `overflow-wrap: anywhere` for code in tables |
| 9 | After Enter on **Nộp bài**, focus falls back to `<body>` | Move focus to the result region (`tabIndex=-1`) |
| 10 | Esc does not close the queue panel, and it has no close button | Esc clears the selection and returns focus to the row |
| 14 | Back then Forward on the submit page empties the code | Keep a draft per lab in `sessionStorage` |
| 15 | The scrollable table frame takes focus without a focus ring | `:focus-visible` style for the frame, or no focus |
| 17 | The statement says "constraints are in constraints.json" to students | The TA edits the statement after importing |
