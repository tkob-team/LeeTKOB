> Historical technical review from 2026-11-10. Findings describe that source revision; see [current handoff](COMPLETION-2026-11-11.md) for subsequent completion. Original language and observations are retained.

# Rà soát PA#02 — 10/11/2026

**Bản mở rộng theo yêu cầu rà toàn bộ nhóm:** [đủ T01–T41 của Hiệp, Hoà, Hoàng](ALL-TASKS-REVIEW.md), gồm cả W3 ngoài bộ nộp và W4–W5. File này giữ phần phân tích kỹ thuật và bằng chứng PA#02 đã thực hiện.

Đã đối chiếu `PLAN-PA02-PHUC-HOANG.md`, sheet `Việc` và `Nộp PA` của tracker, source hiện tại, bằng chứng trong `outputs/tNN/`, và GitHub API trực tiếp. Đây là báo cáo review; không sửa source, plan, tracker hoặc trạng thái PR.

## Kết luận

T02 và T05 có bằng chứng đạt phần việc chính. T03/T13 có bằng chứng kỹ thuật đầy đủ, còn hoàn thiện cách bàn giao và xác nhận review. T08 còn kiểm tra template trên giao diện và review. T19 có bản nháp xanh, chưa merge. Trong các task làm thêm, T11 cần sửa mốc thời gian nhận request và làm rõ JWT; T06/T07 chưa chứng minh đầy đủ việc thực thi quyền; T12 còn thiếu thao tác tài khoản thực tế.

`main` hiện là `f6acb8f2b53a60f44460d6e5f59742e2567c6970`; [CI run 42782617480](https://github.com/tkob-team/LeeTKOB/actions/runs/42782617480) đủ 5 job thành công. Repo public. Không có tag nào trong kết quả API tags lúc kiểm tra.

## Các phát hiện cần xử lý trước bản nộp

### 1. T11: deadline và submittedAt dùng thời điểm xử lý, không phải nhận request

- Contract mục 3 và response yêu cầu thời điểm server nhận request.
- `leetkob/backend/src/main/java/com/leetkob/backend/submission/SubmissionController.java:75` chỉ gọi `clock.instant()` sau các truy vấn user, membership, đọc/parse body và lookup idempotency. Không có bước lưu thời điểm nhận request ở đầu luồng.
- Khi DB/đọc body chậm qua `due_at`, một request tới trước hạn bị trả 409. Chiều ngược lại, request tới trước `opens_at` có thể được nhận nếu xử lý xong sau giờ mở. `submittedAt` cũng ghi thời điểm xử lý.
- Probe gọi controller thật với repository giả lập độ trễ: tới lúc 03:00:00, hạn 03:00:01, xử lý tiếp lúc 03:00:02 → **409 `lab-closed`**. Đây là kiểm tra ở cấp component, chưa phải HTTP integration test.
- Bổ sung: ghi nhận một `receivedAt` ở đầu luồng HTTP và dùng nhất quán cho deadline/submittedAt; thêm regression test thời điểm nhận và xử lý nằm hai phía ranh giới. Replay vẫn trả thời điểm gốc.

### 2. T09/T11: contract và decoder chưa thống nhất thời hạn JWT

- `SecurityConfiguration.java:70` dùng `JwtValidators.createDefault()`; validator riêng ở dòng 75 chỉ kiểm tra `sub` và `role`.
- Đã biên dịch source hiện tại và gọi đúng bean `jwtDecoder`: token HS256 dùng khóa giả, `sub`/`role` hợp lệ, **hết hạn 5 giây vẫn qua**; hết hạn 120 giây bị từ chối. Contract hiện viết token hết hạn → 401, chưa nêu khoảng dung sai.
- Token **không có `exp` cũng qua decoder**. Contract liệt kê `exp` trong các claim dùng nhưng chưa nói rõ thiếu `exp` có bị từ chối không. Cần chốt quy tắc này thay vì coi nó đã được kiểm thử.
- [Spring Security 7.1.2](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html#oauth2resourceserver-jwt-validation) mặc định dung sai đồng hồ 60 giây. Đây là hành vi framework; vấn đề là contract của nhóm chưa mô tả nó.
- Bổ sung: thống nhất chính sách `exp` bắt buộc hay không và clock skew; cập nhật code/contract/test tương ứng. Nếu đổi hành vi đã cam kết, áp dụng change policy của contract. Test hiện chỉ thử token hết hạn 1 giờ, nên không bắt trường hợp sát hạn.

### 3. T06/T07: mô tả ba mức quyền vượt quá phần đã kiểm chứng

- `AGENTS.md` nói ba file cấu hình thực thi các mức allowed / ask first / never. Bằng chứng T06 mới parse JSON; T07 mới kiểm tra mẫu lệnh bằng `execpolicy`, chưa có phiên tương tác chứng minh project đã được trust và nạp cấu hình.
- Chưa thấy cơ chế trong cấu hình Codex hiện tại yêu cầu duyệt riêng khi sửa `pom.xml`, lockfile, `Makefile`, workflow, migration; hoặc chặn công cụ đọc file truy cập `.env`. Workspace-write cho phép sửa file bên trong workspace. Chính AI-LOG T07 đã thừa nhận giới hạn đọc `.env` qua công cụ khác.
- Kiểm tra an toàn chỉ bằng `codex execpolicy check` (không thực thi các lệnh được đưa vào để đối chiếu):

| Lệnh đưa vào bộ đối chiếu | Kết quả |
| --- | --- |
| `git push origin --force feature` | `prompt`, không phải `forbidden` như ý định Never |
| `git -C . push origin main` | Không khớp rule nào |
| `git branch -d feature` | Không khớp rule nào |
| `uv add example-package` | `prompt` |

- Không khớp rule **không đồng nghĩa tự động được phép**: còn sandbox và cơ chế approval chung. Kết quả chỉ chứng minh các prefix hiện tại chưa bao phủ những dạng lệnh trên.
- Theo [OpenAI Docs về Rules](https://learn.chatgpt.com/docs/agent-configuration/rules), prefix rules kiểm soát lệnh chạy ngoài sandbox; project rules chỉ nạp khi được trust. Chúng không thay thế toàn bộ kiểm soát đọc/ghi file.
- Bổ sung: kiểm tra phiên thực trên bản sao dùng file giả; ghi kết quả cho từng mức; bổ sung kiểm soát được phiên bản công cụ hỗ trợ, hoặc sửa mô tả để tách quy ước agent phải tuân thủ và phần công cụ thực sự cưỡng chế. Không thử bằng secret thật hoặc bằng thao tác phá repo.

## Sáu task của Hoàng

| Task | Đánh giá sau rà soát | Cần bổ sung |
| --- | --- | --- |
| T05 | Đủ bằng chứng chạy 4 lệnh trên commit `b76ccd5`, macOS arm64 được khai báo đúng | Không cần làm lại môi trường. Đưa log vào bộ bàn giao hoặc vị trí người chấm truy cập được; README T05 còn ghi AI-LOG chưa commit dù entry đã lên main qua PR #1. Lần clone mới là T14, không được dùng T05 thay T14. |
| T02 | Đạt phần cấu hình và CI 5 job; workflow gọi đúng make, quét full history | Hiệp chưa có review ghi nhận. Trigger tag có cấu hình nhưng chưa có run: kiểm ở T20 khi tạo tag bản cuối; không cần tạo tag thử để đánh dấu T02. |
| T03 | Ruleset active, main, bypass trống, 5 check bắt buộc, PR required. Hai ảnh hiện có đọc được và thể hiện đủ cấu hình | Dẫn PR #10/run đỏ làm bằng chứng còn thiếu; cập nhật ghi chú “Missing” cũ trong `outputs/t03/README.md`. Bàn giao first-parent log và thời điểm bật. JSON yêu cầu 0 approvals đúng cấu hình đang ghi trong plan, không tự coi đây là lỗi. |
| T08 | File template đúng vị trí và đủ 3 câu hỏi; PR #3 đã merge | Hoà chưa có GitHub review. Mở màn hình tạo PR mới, không gửi PR, xác minh template tự điền rồi lưu ảnh. Các PR tạo bằng `gh --body` chưa chứng minh việc này. |
| T13 | Đạt phép thử: PR #10 chỉ sửa 1 file implementation; `test` đỏ, 4 job khác xanh; GraphQL hiện báo `BLOCKED`, `OPEN`, chưa merge | Hiệp kiểm tra bằng chứng; thêm ảnh chặn merge theo tiêu chí hoàn thành do plan tự đặt. Tracker chỉ yêu cầu link PR/run đỏ, nên thiếu ảnh không làm mất bằng chứng CI hiện có. Giữ không merge. |
| T19 | PR #12 đang mở, CI xanh; các entry từng task đã có trên main | Hoàng đọc, chỉnh tính chính xác và merge sau khi được phép; bổ sung link bấm được cho PR/run/commit thay vì chỉ số PR, run ID hoặc đường dẫn local. Bàn giao link entry đã merge. |

Links chính: [PR #10](https://github.com/tkob-team/LeeTKOB/pull/10), [run đỏ T13](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787), [PR #12](https://github.com/tkob-team/LeeTKOB/pull/12), [run xanh PR #12](https://github.com/tkob-team/LeeTKOB/actions/runs/42782788450).

## Các task đã làm thêm và đầu việc chung còn thiếu

| Task | Cần bổ sung hoặc xác nhận |
| --- | --- |
| T06/T07 | Xử lý khoảng cách quyền nêu trên. Chưa có independent review; không ghi tác giả tự rà soát thành review độc lập. |
| T09 | Contract 0.2.0 đã trên main; xác nhận của nhóm đã được ghi trong entry T11. Làm rõ JWT như phát hiện 2. Mục dữ liệu còn nói Submission có `code hash`, nhưng migration không có cột đó và implementation so trực tiếp `code`: thống nhất mô tả với cách triển khai, không nhất thiết thêm cột. |
| T10 | PR #7 **đã merge** lúc 13:15:15 +07:00 thành `1599645`; plan và README bằng chứng còn ghi chưa merge. Blind reader là AI được Hoàng đồng ý, chưa có người đọc chay. Sheet Nộp PA dòng 23 viết “Người lạ viết được client chỉ từ file”: nên thêm lượt người thật đọc và lưu request/nhận xét để chứng minh sát tiêu chí; không đổi nhãn AI thành người. Duplicate JSON keys/nesting depth là gap đã công khai, chưa cần tự mở rộng thành tính năng PA#02. |
| T11 | Sửa các phát hiện 1–2, thêm regression test rồi review trên bản cuối. Run đỏ cũ là **32 lỗi setup do thiếu bảng `submissions`**, không phải 32 assertion chứng minh hành vi API sai; mô tả bằng chứng đúng bản chất. Nếu còn thời gian, thêm red → green với assertion nghiệp vụ để bằng chứng thuyết phục hơn; không coi run cũ là 32 lần fail assertion. README T11 còn ghi PR #8 chưa merge. |
| T12 | Mới xong README. Chưa tạo key và chưa đặt giới hạn thực tế; USD 20/tháng là đề xuất. Chủ tài khoản cần thực hiện, lưu bằng chứng che key, cập nhật README và nhờ Hoà review. Với Gemini, key kế thừa billing/spend cap của project; cần xác định đúng project chứa key. [Tài liệu billing](https://ai.google.dev/gemini-api/docs/billing#project-spend-caps) phân biệt giới hạn project với key và nêu độ trễ áp dụng. Không coi planned 800 calls là giới hạn đã chạy. |
| T14 | Chưa có bằng chứng clone mới theo README rồi chạy đủ 4 lệnh và ghi output của Hoà. CI xanh và T05 không thay thế lần kiểm này. |
| T15 | Chưa có ≥2 dòng rules truy được về sự cố thật. Chọn sự cố đã có log/AI-LOG và hash truy được, thêm vào rules, review qua PR; không bịa sự cố để đủ số lượng. |
| T17/T18 | Entry theo từng task của Hiệp/Hoà đã được tạo trong phiên Hoàng, nhưng chưa chứng minh từng người tự đọc/xác nhận/ghi entry của mình. Cần các chủ task xác nhận nội dung thực tế và phần Changed/Rejected của chính họ trước khi coi hoàn tất. |
| T16/T20/T21 | Chưa có `PA2.md`, tag/run `pa2` hoặc zip/self-assessment trong tài liệu được cung cấp. Chuẩn bị 6 link, ảnh bảo vệ, tag bản cuối và CI xanh; zip có `.git` và 3 file yêu cầu ở gốc, đúng tên. Self-assessment chỉ trong zip. Kiểm lại sau mọi PR sửa code/config. |

Ảnh bảo vệ hiện có hai file tên `branch-protection-1-target-bypass.png` và `branch-protection-2-required-checks.png`; tracker/T16 nêu `docs/pa2/branch-protection.png`. Cần bảo đảm link trong `PA2.md` trỏ tới ảnh thật và mô tả rõ cả hai phần; nếu bắt buộc đúng tên thì tạo thêm ảnh tổng hợp phù hợp. Hai ảnh hiện tại đủ nội dung, không cần bật thêm luật ngoài tiêu chí chỉ để khớp hình thức.

Không dùng việc thiếu frontend, auth/login đầy đủ, worker, sandbox hay checker LLM làm lý do mở lại những task nền tảng đã hoàn tất; đây là các task khác. T23/W4+ giữ ngoài phạm vi PA#02 như kế hoạch hiện tại, trừ yêu cầu chính thức mới.

## Những dòng kế hoạch và bằng chứng đã cũ

1. Mục 1 và mục 3 T19 ghi “chưa làm”; thực tế PR #12 có bản nháp xanh, chưa merge.
2. Mục 1 và T03 ghi thiếu PR đỏ; PR #10 hiện đã cung cấp, còn ảnh/xác nhận review theo plan.
3. Tiêu đề T13 và lịch/thứ tự còn viết chờ T11; T11 đã merge, T13 đã chạy xong phép thử.
4. Dòng T10 mục 8 và `outputs/t10/README.md` ghi PR #7 chưa merge, chưa xác nhận quyết định; GitHub/entry T11 đã cho thấy merge và xác nhận được chuyển qua Hoàng.
5. `outputs/t11/README.md` ghi PR #8 chưa merge, trong khi merge commit là `a59576f`.
6. `outputs/t03/README.md` nói first-parent log mới tới PR #5, nhưng file log thực tế đã tới PR #11; nội dung log là đúng, mô tả đã cũ.
7. `outputs/t05/README.md` ghi entry chưa commit; entry thực tế đã có trên main.
8. Các entry AI-LOG ban đầu T02/T03/T09 còn nói “remote run chưa có”, “thiếu blocked proof”, “chưa có test”. Đây có thể là ghi chép theo thời điểm, nên giữ lịch sử nhưng thêm follow-up/link kết quả cuối để người chấm không hiểu là trạng thái hiện tại.

## Thứ tự đề nghị

1. Sửa thời điểm nhận request của T11; chốt JWT/contract/test. Review T06/T07 để mô tả quyền đúng khả năng thực tế.
2. Chủ key hoàn tất T12; Hoà làm T14 và bổ sung bằng chứng đọc chay; hoàn tất T15.
3. Hoàn tất T08, xác nhận T03/T13; chỉnh và merge T19 sau khi Hoàng duyệt nội dung.
4. Đồng bộ trạng thái plan/bằng chứng; công bố những log cần thiết để link không phụ thuộc máy Hoàng.
5. Khi bản cuối ổn định, Hiệp tạo tag `pa2`, đợi CI xanh, hoàn thiện `PA2.md`, zip và T21. Không lấy source từ nhánh local hiện tại rồi gọi là main: local đang ở `docs/t19-ai-log-hoang`, commit `989e781`, trong khi main là `f6acb8f`.

## Phạm vi kiểm chứng

- Đã đọc source/config/test, ảnh ruleset, log/bằng chứng sẵn có; đọc GitHub trạng thái PR/ruleset/checks/tag và xác nhận 5/5 job main xanh.
- Chạy lại `codex execpolicy check` với các mẫu lệnh an toàn; không thực thi lệnh push/xóa được đưa vào kiểm tra.
- `run_probes.py` biên dịch source Java hiện tại sang thư mục tạm bằng JDK 25 và dependency đã cache, rồi kiểm tra decoder thật và controller với repository giả lập. Kết quả ở `probe-results.txt`. Không chạy Docker, không đọc `.env`, không gọi model, không dùng database thật.
- Không chạy lại toàn bộ 4 make vì đây là review và CI bản main đã xác nhận xanh. Không khẳng định đã xác minh phiên tương tác Codex/Claude hoặc template tự điền trên browser.
- Product repo giữ nguyên, không commit/push/merge/tạo tag hoặc gửi nhận xét cho thành viên nhóm.

## Follow-up implemented after this audit

Hoang subsequently confirmed that the existing items were reviewed and requested corrections. [PR #13](https://github.com/tkob-team/LeeTKOB/pull/13) implements them; [8db9096 CI](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162) is 5/5 green. The current source of task status is the updated plan/workbook. The audit above is historical: its requests to repeat review, missing screenshot/template proof and identified receipt/JWT defects have been addressed in the follow-up branch, pending merge. T12, Hoa's local runs and release/submission steps remain incomplete.
