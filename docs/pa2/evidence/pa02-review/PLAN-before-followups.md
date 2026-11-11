> Historical plan before corrections. Preserve its original language, dates and assumptions; current status is in the completed handoff.

# Kế hoạch PA#02 — phần Phúc Hoàng

- Hạn nộp: 22:00 thứ Tư 11/11/2026 (giờ Việt Nam). Mục tiêu nội bộ: bàn giao đủ bằng chứng cho Hiệp trước 18:00 ngày 11/11.
- Nguồn: `LeeTKOB-tracker.xlsx` (sheet Việc, Nộp PA, Quyết định, Tổng quan, Lộ trình). Tracker ghi “Hoàng”, kế hoạch hiểu là Phúc Hoàng.
- Chưa có rubric PA#02 riêng; thời lượng là ước lượng. Tracker Excel chưa được cập nhật, trạng thái thật nằm trong file này.
- Cập nhật lần cuối: 10/11/2026.

## 1. Trạng thái hiện tại

| Task | Việc | Hạn | Trạng thái | Review | Còn lại |
| --- | --- | --- | --- | --- | --- |
| T05 | Cài môi trường, chạy 4 lệnh make | 06/11 | **Xong 09/11** | — | Không |
| T02 | CI 5 job | 06/11 | **Xong 10/11** | Hiệp | Không |
| T03 | Ruleset bảo vệ `main` | 06/11 | **Gần xong**: ruleset bật, PR #2 đã merge | Hiệp | Bằng chứng PR đỏ bị chặn merge (lấy từ T13) |
| T08 | PR template | 07/11 | **Đã merge PR #3** | Hoà | Hoà chưa review; kiểm tra template hiện khi mở PR mới |
| T13 | PR cố ý phá contract | 09/11 | **Bằng chứng đủ 10/11** (PR #10, không merge) | Hiệp | Hiệp kiểm tra; giữ PR mở hoặc đóng sau khi lưu |
| T19 | AI-LOG của Hoàng | 10/11 | Chưa làm | — | Viết, hoàn thiện sau T13 (0,5–0,75 giờ) |

Ngoài phạm vi đợt này: T23 (thử 2 mô hình, sheet Nộp PA không có bằng chứng tương ứng, chỉ làm sau khi nộp xong trừ khi rubric yêu cầu), T25, T34, T35, T37, T39 và mọi tính năng từ tuần W4.

Quỹ thời gian còn lại: khoảng 2–3 giờ cho T08/T03/T19, cộng 1–1,5 giờ cho T13, cộng dự phòng review và đóng gói bằng chứng.

## 2. Thứ tự và phụ thuộc

1. T05 → T02 → T03 (đã xong T05, T02; T03 chỉ còn bằng chứng PR đỏ).
2. Hiệp làm T09 rồi T11 (cần T03, T09). Hoàng review T11.
3. T13 chỉ bắt đầu khi T11 đã merge vào `main`.
4. T19 viết dần, hoàn thiện sau T13. T08 làm xen kẽ khi chờ review.

Điểm dễ nghẽn nhất: T03 → T11 → T13. Thống nhất với Hiệp T11 merge chậm nhất trưa 11/11. Nếu T11 trễ, ghi rõ bị chặn và phối hợp sửa; không tạo PR lỗi không liên quan rồi coi là bằng chứng phá contract. Không gỡ bảo vệ nhánh để chạy kịp lịch.

## 3. Chi tiết từng task

### T05 — môi trường và 4 lệnh make (xong)

- Chạy 22:39–22:42 ngày 09/11/2026 trên commit `b76ccd5d4c863e7df41a27810d0a016b5dbad0a7`: `make lint`, `make format-check`, `make typecheck`, `make test` đều exit 0.
- Môi trường: macOS arm64 native (không phải WSL như tracker ghi), JDK 25, uv 0.13.7, Python 3.12.16, backend dùng PostgreSQL 17 qua Testcontainers.
- Bằng chứng: `outputs/t05/` (xem `README.md`), entry T05 trong `leetkob/AI-LOG.md`.

### T02 — CI (xong)

- Workflow 5 job `lint`, `format-check`, `typecheck`, `test`, `secrets` và action dùng chung thiết lập JDK 25 / Python 3.12 / uv. Trigger: PR, push `main`, tag `pa*`, chạy tay. Job `secrets` quét toàn bộ lịch sử bằng Gitleaks.
- [PR #1](https://github.com/tkob-team/LeeTKOB/pull/1) merge 09:58:43 ngày 10/11/2026 thành commit `2a8728bdce99181b2aceeb1c3f86cb4852633e46`. CI [trước merge](https://github.com/tkob-team/LeeTKOB/actions/runs/42744510142) và [trên main](https://github.com/tkob-team/LeeTKOB/actions/runs/42746365450) đều 5/5 xanh.
- Không ghi nhận review riêng của Hiệp. Chưa chạy thử trigger tag `pa*` (thuộc T20 của Hiệp).
- Không thêm eval LLM làm required check (chuyển sang PA#04). Unit test không gọi mô hình thật.

### T03 — bảo vệ `main` (gần xong)

- Ruleset `main-protection` (ID 26913957) bật lúc **10:22:50 ngày 10/11/2026 (UTC+07:00)**: nhắm `main`, yêu cầu PR (0 approval), 5 check GitHub Actions bắt buộc, bypass trống. Hiệp đã xác nhận có hiệu lực (theo lời Hoàng).
- Ảnh chụp 2 màn hình (không vừa một ảnh) và ghi chú nằm ở `docs/pa2/` trong [PR #2](https://github.com/tkob-team/LeeTKOB/pull/2), CI trước merge [5/5 xanh](https://github.com/tkob-team/LeeTKOB/actions/runs/42751020466); đã merge 11:39 ngày 10/11/2026 (UTC+07:00) thành commit `8c7d0b7`. Run CI của commit này bị hủy do concurrency khi PR #3 merge ngay sau; CI [trên `main` sau PR #3](https://github.com/tkob-team/LeeTKOB/actions/runs/42757220301) xanh. Bản lưu local: `outputs/t03/` (README, ảnh, `ruleset.json`, `first-parent-main.log`).
- Xong khi: có PR đỏ bị chặn merge (dùng PR T13); PR #2 đã merge. Không đẩy thay đổi phá hoại lên `main` để chứng minh.
- Từ lúc bật, mọi thay đổi qua PR. Lưu `git log --first-parent main` cùng bằng chứng PR/merge.

### T08 — PR template (đã merge, chờ review của Hoà)

- [PR #3](https://github.com/tkob-team/LeeTKOB/pull/3): `.github/pull_request_template.md` bằng tiếng Anh, 3 câu hỏi: có đổi contract không (kèm tài liệu và test liên quan), test có cập nhật cùng code không (có lựa chọn “không cần”), đã ghi AI-LOG chưa. CI 5/5 xanh. Đã merge 11:39 ngày 10/11/2026 (UTC+07:00) thành commit `95704b1`, theo yêu cầu của Hoàng, trước khi Hoà review.
- Xong khi: Hoà review (chưa yêu cầu trên GitHub) và template hiện đúng khi mở PR mới.

### T13 — phép thử phá contract (chờ T11)

- Bắt đầu từ `main` đã chứa T11. Chọn một hành vi đã có contract test rõ (response status, quyền sở hữu hoặc idempotency).
- Tạo PR chỉ sửa implementation để vi phạm contract; không sửa contract, test, dữ liệu hay workflow.
- Chờ job `test` đỏ đúng test liên quan, xác nhận là regression chủ đích chứ không phải lỗi môi trường.
- Lưu link PR, link run đỏ, ảnh trạng thái bị chặn merge; nhờ Hiệp kiểm tra.
- Không merge. Có thể đóng PR sau khi lưu bằng chứng. Task xong khi bằng chứng đầy đủ và `main` vẫn xanh (ngoại lệ của quy tắc “Xong = đã merge”). Không dùng thay bằng chứng T11 (T11 chứng minh đỏ → xanh).

### T19 — AI-LOG của Hoàng (chưa làm)

- Ghi tool thực tế, phần việc, mục đích; Changed cụ thể (file, hành vi, lý do); Rejected cụ thể (không bịa).
- Đính kèm PR/commit, output 4 lệnh check, run CI, thời điểm bật ruleset, phép thử T13.
- Rà soát không có secret; viết bằng tiếng Anh; entry có sẵn cho T05 và T02 trong `leetkob/AI-LOG.md`.
- Xong khi entry merge qua PR và có link cho Hiệp.

## 4. Việc Hoàng cần review (đợt PA#02)

| Task | Tác giả | Khi review | Điểm cần kiểm tra |
| --- | --- | --- | --- |
| T07 | Hoà | Ưu tiên 10/11 | Cấu hình Codex/Rules thể hiện đúng 3 mức quyền của AGENTS; README có bước trust project; không chỉ là tuyên bố |
| T11 | Hiệp | Khi có PR; chốt trước trưa 11/11 | Contract test có lỗi, quyền sở hữu, idempotency; run đỏ rồi xanh; test nằm trong CI bắt buộc |
| T21 | Hiệp | Trước 20:00 ngày 11/11 | Đủ thành phần zip, link/tag, self-assessment đúng chỗ, đúng tên file, bằng chứng nộp |

Đưa nhận xét cụ thể sớm; không làm thay phần của người khác. Việc review W4–W5 (T29, T30, T36, T38, T40) nằm ngoài đợt này.

## 5. Lịch

| Thời gian | Việc | Kết quả |
| --- | --- | --- |
| 09/11 tối | T05, kiểm tra T02 | 4 lệnh make xanh |
| 10/11 sáng | T02 qua PR | CI 5/5 xanh, merge |
| 10/11 chiều | T03, T08; review T07 | Ruleset bật, PR #2 và #3 đã merge |
| 10/11 tối | Review T11 nếu sẵn sàng; viết T19 | Phản hồi T11, bản nháp T19 |
| 11/11 trước 12:00 | Chốt review T11; làm T13 | PR phá contract, run đỏ, ảnh bị chặn |
| 11/11 14:00–16:00 | Hoàn thiện T19, bàn giao bảng bằng chứng | Đủ link, ảnh, commit; `main` xanh |
| 11/11 16:00–18:00 | Kiểm tra bằng chứng đã vào tài liệu nộp; hỗ trợ lỗi tag CI | Hiệp đủ đầu vào để tạo tag và zip |
| 11/11 18:00–20:00 | Review T21 trên bản đóng gói cuối | Báo kết quả rà soát |
| 11/11 20:00–21:00 | Hiệp nộp bài; Hoàng hỗ trợ | Có xác nhận nộp, còn 1 giờ đệm |

Nếu T11 chưa merge trước 12:00 ngày 11/11: tạm dừng T23 và việc W4, cùng Hiệp xử lý CI/contract để mở đường cho T13.

## 6. Bằng chứng Hoàng bàn giao trước 18:00 ngày 11/11

| Dòng sheet Nộp PA | Bằng chứng |
| --- | --- |
| 8 | Job gitleaks và link run quét đủ lịch sử |
| 11 | `.github/workflows/ci.yml` gọi đúng lệnh make trong README |
| 13 | Ảnh bảo vệ nhánh trong `docs/pa2/` (thấy đủ 5 check và bypass trống) |
| 16 | Giờ bật bảo vệ, `git log --first-parent main`, PR liên quan |
| 25 | Job `test` bắt buộc chạy contract test, link run |
| 26 | PR T13 chỉ sửa code, run đỏ, trạng thái bị chặn merge |
| 27 | Entry AI-LOG của Hoàng (tool, phần việc, Changed, Rejected) |

Đây là phần đóng góp vào tiêu chí chung, không phải Hoàng sở hữu toàn bộ điểm của tiêu chí.

## 7. Checklist review nộp bài (T21)

- [ ] Sáu task của Hoàng có bằng chứng thật; T13 giữ trạng thái không merge.
- [ ] T07 và T11 đã review; `main` và CI của bản nộp xanh.
- [ ] Hiệp tạo và push tag `pa2`; CI của tag chạy và có link.
- [ ] `PA2.md` đủ 6 link: repo public, ảnh bảo vệ, PR đỏ, commit/run xanh, run của tag, PR phá contract.
- [ ] Zip có `.git`, `PA2.md`, `AI-LOG.md`, `SELF_ASSESSMENT_REPORT.md` ở gốc; tên `23120255-23120262-23120264_<n>.zip`.
- [ ] `SELF_ASSESSMENT_REPORT.md` có trong zip nhưng không commit lên repo public.
- [ ] Link bằng chứng mở được; tag và source trong zip khớp bản đã kiểm tra.
- [ ] Hiệp nộp bằng mail sinh viên và lưu ảnh xác nhận; Hoàng chỉ review và hỗ trợ.

Không coi là xong khi chỉ viết file hoặc chạy check ở máy: cần PR merge, CI xanh và link bằng chứng.

## 8. Toàn bộ 41 task trong sheet Việc

Số task: Hiệp 16, Hoà 13, Hoàng 12 (T02, T03, T05, T08, T13, T19, T23, T25, T34, T35, T37, T39). Cột “Tracker” là trạng thái trong file Excel; cột “Ghi chú” có trạng thái thật nếu đã xác minh.

| ID | Việc | Người | Hạn | Review | Tracker | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Tạo repo public `tkob-team/leetkob`; khung backend + checker; 4 lệnh make | Hiệp | 04/11 | — | Xong | Commit b76ccd5 |
| T02 | CI 5 job, trigger tag `pa*`, qua PR | Hoàng | 06/11 | Hiệp | Đang làm | **Xong 10/11** |
| T03 | Ruleset `main` (bypass trống, 5 check); ảnh; giờ bật | Hoàng | 06/11 | Hiệp | Chưa làm | **Gần xong** (PR #2 đã merge) |
| T04 | Cài môi trường (WSL, JDK 25, uv, Docker); 4 lệnh make | Hoà | 06/11 | — | Chưa làm | Trùng mô tả với T05, cần nhóm xác nhận |
| T05 | Cài môi trường (WSL, JDK 25, uv, Docker); 4 lệnh make | Hoàng | 06/11 | — | Chưa làm | **Xong 09/11** (macOS) |
| T06 | AGENTS.md + CLAUDE.md (4 mục, Never, 3 mức quyền), `.claude/settings.json` | Hoà | 07/11 | Hiệp | Chưa làm | Hoàng làm thay theo yêu cầu: [PR #4](https://github.com/tkob-team/LeeTKOB/pull/4) đã merge 11:58 ngày 10/11/2026 (UTC+07:00) thành commit `20bc266`, CI 5/5 xanh; bằng chứng `outputs/t06/`. Chưa có `.codex/config.toml` (T07) và dòng truy về sự cố thật (T15) |
| T07 | `.codex/config.toml` + Rules khớp 3 mức; README ghi bước trust project | Hoà | 07/11 | Hoàng | Chưa làm | Hoàng làm thay theo yêu cầu: [PR #5](https://github.com/tkob-team/LeeTKOB/pull/5) đã merge 12:14 ngày 10/11/2026 (UTC+07:00) thành `1b88bc6`, CI trên `main` xanh; bằng chứng `outputs/t07/`; đã thêm `.codex/config.toml`, `.codex/rules/default.rules`, bước trust trong README, và AI-LOG cho T03/T06/T07/T08 |
| T08 | PR template (đổi contract? test cùng code? AI-LOG?) | Hoàng | 07/11 | Hoà | Chưa làm | **Đã merge PR #3**, chờ Hoà review |
| T09 | Contract `docs/contract/post-labs-submissions.md` | Hiệp | 07/11 | Hoà | Chưa làm | Hoàng soạn thay theo yêu cầu: [PR #6](https://github.com/tkob-team/LeeTKOB/pull/6) đã merge 13:04 ngày 10/11/2026 (UTC+07:00) thành `4d71390`, CI 5/5 xanh; Hiệp chưa xác nhận các quyết định soạn thảo (liệt kê trong AI-LOG); bằng chứng `outputs/t09/` |
| T10 | Đọc chay contract, viết thử request chỉ từ file | Hoà | 08/11 | — | Chưa làm | Hoàng chạy thay: người đọc là subagent AI (không phải người); 22 điểm mơ hồ, 3 blocker; [PR #7](https://github.com/tkob-team/LeeTKOB/pull/7) (contract 0.2.0) mở, chưa merge; bằng chứng `outputs/t10/` |
| T11 | PR: contract test đỏ (bị chặn) → endpoint + bảng Class, ClassMember, Lab, Submission (xanh) | Hiệp | 08/11 | Hoàng | Chưa làm | Hoàng làm thay theo yêu cầu: [PR #8](https://github.com/tkob-team/LeeTKOB/pull/8) có [run đỏ](https://github.com/tkob-team/LeeTKOB/actions/runs/42767919398) (`ec8ad3c`) rồi [run xanh](https://github.com/tkob-team/LeeTKOB/actions/runs/42768403506) (`8338877`), 32 contract test; đã merge 14:45 ngày 10/11/2026 (UTC+07:00) thành `a59576f`; bằng chứng `outputs/t11/`. T13 có thể bắt đầu |
| T12 | API key mô hình; README: model, giới hạn chi tiêu, chi phí một lab | Hiệp | 08/11 | Hoà | Chưa làm | Hoàng soạn README thay: [PR #9](https://github.com/tkob-team/LeeTKOB/pull/9) đã merge 15:24 ngày 10/11/2026 (UTC+07:00) thành `0ef7aa2`. CHƯA tạo API key, CHƯA đặt giới hạn chi tiêu: ghi "USD 20/tháng" là đề xuất, Hiệp phải đặt trên console rồi cập nhật dòng đó; bằng chứng `outputs/t12/` |
| T13 | PR cố ý làm vỡ contract (chỉ sửa code, không merge) | Hoàng | 09/11 | Hiệp | **Bằng chứng đủ, chờ Hiệp kiểm tra** | [PR #10](https://github.com/tkob-team/LeeTKOB/pull/10) chỉ sửa 1 file code (bỏ điều kiện thuộc lớp), [run đỏ](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787): `test` fail đúng 2 test ownership, merge state `BLOCKED`; không merge, `main` vẫn xanh; bằng chứng `outputs/t13/`; AI-LOG: PR #11, đã merge 15:26 thành `f6acb8f` |
| T14 | Clone mới theo README, chạy 4 lệnh, ghi output vào AI-LOG | Hoà | 09/11 | — | Chưa làm | — |
| T15 | Rules file: ≥ 2 dòng có sự cố thật (kèm hash commit) | Hoà | 10/11 | Hiệp | Chưa làm | — |
| T16 | `PA2.md` 6 link; `docs/pa2/branch-protection.png` | Hiệp | 10/11 | Hoà | Chưa làm | Cần bằng chứng T03 |
| T17 | AI-LOG: entry của Hiệp | Hiệp | 10/11 | — | Chưa làm | — |
| T18 | AI-LOG: entry của Hoà | Hoà | 10/11 | — | Chưa làm | — |
| T19 | AI-LOG: entry của Hoàng | Hoàng | 10/11 | — | Chưa làm | Bản nháp: [PR #12](https://github.com/tkob-team/LeeTKOB/pull/12), CI 5/5 xanh, chưa merge; Hoàng đọc và sửa trước khi merge; bằng chứng `outputs/t19/` |
| T20 | Tag `pa2`, push, link CI run của tag; kiểm repo public | Hiệp | 10/11 | Hoà | Chưa làm | Cần bằng chứng T03 |
| T21 | SELF_ASSESSMENT, zip, nộp bằng mail sinh viên, chụp màn hình | Hiệp | 11/11 | Hoàng | Chưa làm | Hoàng review |
| T22 | Thử sandbox (1 ngày): không mạng, giới hạn CPU/bộ nhớ/tiến trình/output, non-root, đo thời gian chấm | Hoà | 11/11 | — | Chưa làm | Sau T03 |
| T23 | Thử 2 mô hình bằng tay trên 2 bài bộ dev; ghi kết quả | Hoàng | 11/11 | — | Chưa làm | Ngoài đợt PA#02 |
| T24 | Trực FAQ 02/11–08/11 | Hoà | 08/11 | — | Đang làm | — |
| T25 | Trực FAQ 09/11–15/11 | Hoàng | 15/11 | — | Chưa làm | Ngoài đợt |
| T26 | Trực FAQ 16/11–22/11 | Hiệp | 22/11 | — | Chưa làm | — |
| T27 | Chốt loại hàng đợi | Hiệp | 05/11 | — | Xong | PostgreSQL (sheet Quyết định) |
| T28 | Đăng nhập email/mật khẩu, JWT; vai trò admin, TA, sinh viên | Hiệp | 15/11 | Hoà | Chưa làm | — |
| T29 | Admin tạo lớp, gán TA; sinh viên vào lớp bằng mã mời; quyền theo lớp | Hiệp | 17/11 | Hoàng | Chưa làm | — |
| T30 | TA tạo lab (đề, hạn), tải bộ test, chỉnh giới hạn chạy | Hiệp | 18/11 | Hoàng | Chưa làm | — |
| T31 | Hàng đợi chấm + worker idempotent (worker chết thì chấm lại) | Hoà | 16/11 | Hiệp | Chưa làm | PostgreSQL SKIP LOCKED, sau JudgeQueue |
| T32 | Sandbox đạt tối thiểu; mỗi yêu cầu một test tấn công | Hoà | 18/11 | Hiệp | Chưa làm | — |
| T33 | Bài được tính (FAQ-02); verdict từng test cho sinh viên (polling) | Hoà | 18/11 | Hiệp | Chưa làm | — |
| T34 | Checker CLI: thư mục dataset → JSONL; `eval.mjs` chạy được | Hoàng | 14/11 | Hoà | Chưa làm | Ngoài đợt |
| T35 | Luật cứng cho ràng buộc “Do not use / Do not call”; ánh xạ dòng gốc | Hoàng | 17/11 | Hiệp | Chưa làm | Ngoài đợt |
| T36 | Giao diện tối thiểu (React): đăng nhập, danh sách lab, trang nộp bài | Hiệp | 18/11 | Hoàng | Chưa làm | Cần T41 |
| T37 | Demo v0.2 trên `main` (người không viết chạy kịch bản) | Hoàng | 18/11 | — | Chưa làm | Ngoài đợt |
| T38 | TA khai báo ràng buộc + luật sửa theo FAQ-07 | Hiệp | 22/11 | Hoàng | Chưa làm | — |
| T39 | Mô hình xét ràng buộc ngữ nghĩa, trả JSON có bằng chứng | Hoàng | 22/11 | Hiệp | Chưa làm | Ngoài đợt |
| T40 | Nối pipeline: bài Accepted → checker → lưu đề xuất | Hoà | 22/11 | Hoàng | Chưa làm | — |
| T41 | Dựng `frontend/` (React, Vite, TS); eslint, prettier, tsc, vitest vào make và CI | Hiệp | 15/11 | Hoàng | Chưa làm | Qua PR; CI phải đỏ được với lỗi frontend |
