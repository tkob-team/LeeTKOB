> Historical all-task audit, 2026-11-10. Its pending items and separate-machine assumptions are superseded where documented in [current handoff](COMPLETION-2026-11-11.md).

# Rà soát toàn bộ 41 task — Hiệp, Hoà, Hoàng

Ngày kiểm tra: 10/11/2026. Bao gồm tất cả T01–T41 trong kế hoạch, kể cả việc không thuộc bộ bằng chứng PA#02 và các mốc W4–W5. Không giới hạn theo người thực hiện.

Nguồn: `PLAN-PA02-PHUC-HOANG.md`; các sheet `Việc`, `Nộp PA`, `Quyết định`, `Lộ trình` của `LeeTKOB-tracker.xlsx`; source/config/test và AI-LOG; bằng chứng local; PR, nhánh, review, tag, CI trên GitHub; [FAQ công khai](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md). Đã đọc tracker, không sửa workbook.

“Chưa thấy” nghĩa là chưa có trong repo, nhánh GitHub hoặc bằng chứng được cung cấp; không khẳng định thành viên chưa làm ở máy khác, repo báo cáo private hoặc Facebook. Cột bổ sung gồm việc còn thiếu theo task và đề nghị nghiệm thu; các đề nghị thêm test không tự biến thành rubric mới.

## Kết quả tổng thể

- Hiệp sở hữu 16 task; Hoà 13; Hoàng 12. Người sở hữu và người đã dùng AI làm thay được phân biệt trong AI-LOG; không tự đổi người phụ trách.
- Những task có đầu ra đạt phần cốt lõi: T01, T02, T03, T05, T13, T27. Một số vẫn cần xác nhận review và hoàn thiện việc bàn giao.
- T06–T11 đã có PR merge nhưng còn giới hạn kiểm chứng, thiếu review hoặc lỗi cần xử lý. T12 mới làm phần tài liệu. T19 mới là PR nháp đã xanh.
- T04, T14, T15, T16, T20, T21 chưa có đủ bằng chứng hoàn tất. T17/T18 có entry mang tên người sở hữu, nhưng được tạo trong phiên Hoàng, cần chính từng người xác nhận nội dung thực tế.
- T22/T23 là việc W3, hạn 11/11, vẫn cần theo dõi dù không phải đầu vào trực tiếp của bộ bằng chứng PA#02.
- T28–T41 chưa có implementation tương ứng trên repo/nhánh đã kiểm tra. T27 chỉ là quyết định chọn queue, không phải worker đã hoạt động.
- GitHub hiện có PR #1–#12: #1–#9 và #11 đã merge; #10, #12 còn mở. **Tất cả 12 PR đều chưa có GitHub Review được gửi** theo GraphQL lúc kiểm tra. Điều này không phủ nhận trao đổi/xác nhận ngoài GitHub, nhưng không được ghi thành đã có independent code review.
- `main` vẫn ở `f6acb8f`, [CI main xanh](https://github.com/tkob-team/LeeTKOB/actions/runs/42782617480). Chưa có tag trong API tags. Local đang ở nhánh T19 (`989e781`), không phải main.

## T01–T21: nền tảng và nộp PA#02

| ID | Chủ task | Hạn | Trạng thái xác minh | Cần làm hoặc bổ sung |
| --- | --- | --- | --- | --- |
| T01 | Hiệp | 04/11 | Đạt phần scaffold và 4 make; commit `b76ccd5` | Giữ link commit/CI và hướng dẫn chạy. Nếu dùng tuyên bố “4 lần phá thử exit 2” trong hồ sơ nộp, kèm log tương ứng; entry ban đầu còn ghi tác giả “A”, cần làm rõ tên thật khi xác nhận T17. Không yêu cầu làm lại scaffold. |
| T02 | Hoàng | 06/11 | Đạt CI 5 job, PR #1 merge | Hiệp review. Thử trigger tag khi T20 tạo tag bản cuối. Bổ sung link run cuối trong AI-LOG để thay trạng thái cũ “chưa có run remote”. |
| T03 | Hoàng | 06/11 | Ruleset và ảnh đạt; PR #10 đã chứng minh bị chặn | Hiệp xác nhận; nối link PR #10/run đỏ và first-parent log vào tài liệu nộp; bỏ ghi chú cũ “thiếu bằng chứng PR đỏ”. |
| T04 | Hoà | 06/11 | Chưa thấy bằng chứng chạy trên môi trường Hoà | Cài/chọn JDK 25, uv/Python 3.12, Docker, chạy 4 make; lưu phiên bản/OS/commit/output. **Không trùng T05:** đây là lần kiểm của người khác. Có thể thực hiện cùng lượt clone mới T14 nhưng phải ghi đủ tiêu chí của cả hai task. |
| T05 | Hoàng | 06/11 | Đạt, 4 lệnh exit 0 trên macOS | Bàn giao log có thể truy cập; sửa README bằng chứng còn nói entry chưa commit. Không dùng kết quả máy Hoàng để đánh dấu T04 của Hoà. |
| T06 | Hoà | 07/11 | AGENTS/CLAUDE/settings đã merge PR #4 | Hiệp review. Thử quyền Claude trong phiên thực bằng dữ liệu giả; phân biệt quy ước với kiểm soát cưỡng chế. T15 là phần bổ sung sự cố riêng, chưa có. |
| T07 | Hoà | 07/11 | Config/rules/trust instruction đã merge PR #5 | Hoàng review. Bổ sung kiểm chứng nạp project config và 3 mức quyền; rule chưa bao phủ các biến thể lệnh, chưa có cơ chế kiểm soát đầy đủ mọi thao tác đọc/ghi nêu trong AGENTS. Xem phát hiện kỹ thuật bên dưới. |
| T08 | Hoàng | 07/11 | Template đúng chỗ, đủ 3 câu hỏi; PR #3 merge | Hoà review; mở màn hình tạo PR mới để xác minh template tự điền và lưu ảnh, không cần gửi PR rỗng. |
| T09 | Hiệp | 07/11 | Contract 0.2.0 đã merge qua #6/#7 | Hoà review. Chốt `exp`/clock skew, sửa lệch mô tả `code hash` với cách so trực tiếp code hiện tại. Xác nhận nhóm đã được ghi ở entry T11; cập nhật ghi chú cũ “chưa xác nhận”. |
| T10 | Hoà | 08/11 | Đã đọc chay bằng AI, 22 gap, PR #7 đã merge | Ghi đúng người đọc là AI được Hoàng đồng ý. Để sát dòng “người lạ viết được client chỉ từ file”, bổ sung một lượt người thật đọc và lưu request/nhận xét nếu cần chứng minh theo nghĩa đó. Không ghi thành đã có người đọc. |
| T11 | Hiệp | 08/11 | Endpoint, migration, 32 contract test đã merge PR #8; còn lỗi deadline | Hoàng review. Sửa thời điểm nhận request, thống nhất JWT và thêm regression test. Run đỏ cũ là 32 lỗi setup do thiếu bảng, không phải 32 fail assertion nghiệp vụ; mô tả đúng và có thể bổ sung một lượt đỏ→xanh ở assertion. |
| T12 | Hiệp | 08/11 | README/cost đã merge PR #9; chưa có bằng chứng key/spend limit | Hiệp thực hiện trên tài khoản, lưu ảnh che key, ghi giới hạn đã đặt và thời điểm; cập nhật README từ “proposed”. Hoà review. 800 calls/lab hiện chỉ là kế hoạch, không phải cap đang thực thi. |
| T13 | Hoàng | 09/11 | PR #10 code-only, test fail đúng 2 ownership test, BLOCKED; không merge | Hiệp xem bằng chứng; thêm ảnh bị chặn theo plan; cập nhật T03. Không merge PR này, không thay bằng chứng đỏ→xanh của T11 bằng T13. |
| T14 | Hoà | 09/11 | Chưa thấy fresh-clone run | Clone vào thư mục mới, làm đúng README, chạy đủ 4 make; lưu commit/OS/output/exit code và lỗi hướng dẫn nếu có, ghi AI-LOG. Có thể đồng thời thu bằng chứng T04. CI xanh không thay thế lần chạy này. |
| T15 | Hoà | 10/11 | Chưa có 2 dòng rules gắn sự cố thật | Thêm ≥2 dòng rút từ sự cố thật, kèm hash và AI-LOG/log truy được; Hiệp review. Có thể dùng sự cố đã ghi nếu truy vết đủ, không bịa hoặc gán nhầm hash của lỗi. |
| T16 | Hiệp | 10/11 | Đã có ảnh bảo vệ; chưa có PA2.md | Tạo PA2.md đủ 6 link, dùng URL thật và mở kiểm tra từng link. Hiện có hai ảnh bảo vệ, chưa có file đúng tên `branch-protection.png`; bảo đảm tài liệu liên kết đủ cả hai, hoặc tạo ảnh đúng tên nếu yêu cầu tên là bắt buộc. Hoà review. |
| T17 | Hiệp | 10/11 | Có entry T09/T11/T12 và scaffold; chưa có xác nhận cá nhân | Hiệp đọc/xác nhận/sửa phần tool, công việc, Changed/Rejected của mình; làm rõ entry “A”. Không gọi entry do phiên Hoàng tạo là bằng chứng Hiệp tự viết khi chưa xác nhận. |
| T18 | Hoà | 10/11 | Có entry T06/T07/T10 được tạo trong phiên Hoàng | Hoà xác nhận/sửa nội dung và thêm bằng chứng phần tự làm như T04/T14/T15. Tách owner khỏi người vận hành công cụ trong ghi chép. |
| T19 | Hoàng | 10/11 | PR #12 còn mở, CI xanh | Hoàng kiểm tra tính chính xác, cập nhật link kết quả cuối, rồi merge khi được phép; bàn giao link entry trên main. |
| T20 | Hiệp | 10/11 | Repo public; chưa có tag/run pa2 | Sau khi bản nộp ổn định, tạo/push `pa2`, đợi CI của đúng tag xanh và lưu run/commit. Hoà review. Nếu còn sửa code sau đó, phải bảo đảm tag/zip/bằng chứng cùng một phiên bản. |
| T21 | Hiệp | 11/11 | Chưa có zip, self-assessment hoặc xác nhận nộp trong nguồn cung cấp | Hoàng review bản cuối: `.git`, `PA2.md`, `AI-LOG.md`, `SELF_ASSESSMENT_REPORT.md` ở gốc zip; đúng tên `23120255-23120262-23120264_<n>.zip`; self-assessment không vào repo public; source khớp tag; nộp bằng mail sinh viên và lưu xác nhận. |

## T22–T27: thử nghiệm, trực FAQ và quyết định

| ID | Chủ task | Hạn | Trạng thái xác minh | Cần làm hoặc bổ sung |
| --- | --- | --- | --- | --- |
| T22 | Hoà | 11/11 | Chưa thấy prototype sandbox hoặc log thử nghiệm | Thử phương án sandbox, lưu cấu hình và kết quả cho không mạng, non-root, CPU/wall time, RAM, số tiến trình và output; kiểm không lộ host/Docker socket/secret theo FAQ-05. Đo thời gian chấm, ghi rõ có tính compile/startup hay không; đầu ra dùng cho T32 và kế hoạch worker. |
| T23 | Hoàng | 11/11 | Chưa có kết quả thử 2 model × 2 bài dev | Lấy đúng bộ dev được cung cấp; ghi model/version, prompt, bài, kết quả, bằng chứng dòng, lỗi, latency và cost/token nếu đo được. Không dùng bảng giá/ước lượng T12 thay thử nghiệm. Theo dõi như việc W3 dù ưu tiên nộp PA#02 trước. |
| T24 | Hoà | 08/11 | Tracker ghi đang làm; chưa thấy sổ trực tuần đã kết thúc | Bàn giao link câu hỏi/trả lời và ngày xử lý, FAQ patch nếu có. Nếu không có câu hỏi, ghi rõ đã rà soát và không phát sinh. Repo FAQ không có commit từ 01/11 trong truy vấn đã chạy, nhưng không thể suy ra không trực vì hỏi đáp có thể nằm trên Facebook. |
| T25 | Hoàng | 15/11 | Đang trong tuần phụ trách, chưa thấy log | Theo dõi câu hỏi và mốc trả lời trong 2 ngày làm việc theo quyết định nhóm; lưu link/ngày/chủ đề và bàn giao cho Hiệp. Không đợi tới hạn mới thu bằng chứng. |
| T26 | Hiệp | 22/11 | Chưa tới tuần phụ trách 16–22/11 | Nhận bàn giao từ Hoàng; áp dụng cùng sổ trực/link/ngày xử lý. Chưa đánh dấu quá hạn/chưa hoàn thành nhiệm vụ tương lai. |
| T27 | Hiệp | 05/11 | Đã chốt PostgreSQL queue trong sheet Quyết định | Giữ quyết định. Nên đưa vào ADR/docs repo: `JudgeQueue`, `FOR UPDATE SKIP LOCKED`, claim rồi commit, không giữ lock lúc chấm. Worker, recovery và job persistence thuộc T31, chưa được chứng minh bởi task quyết định. |

## T28–T41: sản phẩm W4–W5

Các hàng sau là việc chưa có implementation/bằng chứng tương ứng trong các nhánh đã kiểm tra. JWT decoder, các bảng lớp/lab tối thiểu và response `queued` của T11 chỉ là nền cho chúng.

| ID | Chủ task | Hạn | Hiện có | Cần làm và kiểm chứng |
| --- | --- | --- | --- | --- |
| T28 | Hiệp | 15/11 | Chỉ xác minh JWT HS256; chưa có đăng nhập | Endpoint đăng nhập email/password, lưu password hash, phát token và phân vai; có test đúng/sai mật khẩu, token và phân quyền. Không coi JWT giả do test ký là luồng login sản phẩm. Hoà review. |
| T29 | Hiệp | 17/11 | Bảng classes/class_members tối thiểu và membership check của submit | API admin tạo lớp, gán TA; sinh viên vào lớp bằng mã mời; API đọc dữ liệu cần cho UI; ownership test TA/sinh viên khác lớp. Không chỉ có bảng SQL là xong CRUD/quyền. Hoàng review. |
| T30 | Hiệp | 18/11 | Lab mới có class/open/due, chưa có đề/test/limits API | API TA tạo/quản lý lab, đề bài, tải bộ test, chỉnh giới hạn trong khoảng FAQ-05; lưu test an toàn, test quyền theo lớp; API danh sách/chi tiết phục vụ T36. Hoàng review. |
| T31 | Hoà | 16/11 | Chưa có JudgeQueue/job/worker; response queued đang dựng cố định | Ghi submission và job atomically, queue PostgreSQL sau JudgeQueue; claim ngắn rồi chấm ngoài transaction; chống xử lý/lưu kết quả trùng, phục hồi khi worker chết; test cạnh tranh và kill/retry. Có thể dùng fixtures trước khi T30 xong. Hiệp review. |
| T32 | Hoà | 18/11 | Chưa có sandbox runtime | Chuyển kết quả T22 thành runner dùng được: biên dịch/chạy C++17, chặn mạng/root/host mounts/socket/secret và giới hạn tài nguyên; mỗi yêu cầu có test tấn công và log kết quả. Đối chiếu brief gốc, vì FAQ chỉ bổ sung mặc định. Hiệp review. |
| T33 | Hoà | 18/11 | Chưa có stored verdict hoặc polling endpoint | Lưu verdict tổng/từng test và cho đúng sinh viên poll. Bài được tính là **bài cuối trước hạn dù WA/CE**, không phải AC gần nhất; không lộ input/output test hoặc kết quả soát chưa Publish. Test AC rồi WA, ownership và polling. Hiệp review. |
| T34 | Hoàng | 14/11 | Checker chỉ có __version__ và smoke test | CLI nhận thư mục dataset, ghi JSONL đúng schema chính thức và chạy được eval.mjs trên output; chuẩn bị đúng dataset/eval.mjs vì hiện chưa có trong repo. Ghi lệnh tái hiện và xử lý đầu vào lỗi; chưa cần biến eval thành required CI PA#02. Hoà review. |
| T35 | Hoàng | 17/11 | Chưa có hard-rule implementation | Luật Do not use/Do not call, xử lý trường hợp comment/string để tránh bắt nhầm, giữ ánh xạ dòng gốc và evidence. Kiểm trên ca vi phạm/không vi phạm trong dev set; thống nhất output với T34. Hiệp review. |
| T36 | Hiệp | 18/11 | Chưa có frontend | Sau T41, làm login, danh sách lab và nộp bài; gọi API thật, hiển thị validation/lỗi/deadline và retry dùng cùng idempotency key; bảo đảm nội dung thông báo soát theo FAQ-06. Hoàng review. |
| T37 | Hoàng | 18/11 | Chưa có demo v0.2/main hoặc kịch bản | Người không viết phần được demo chạy kịch bản bản main: login → vào lớp/lab → submit → queue/sandbox → verdict, cùng checker CLI theo mục tiêu W4. Lưu commit, người chạy, steps, kết quả và lỗi; không chỉ tự quay demo phần mình. |
| T38 | Hiệp | 22/11 | Chưa có constraints API/version/history | TA khai báo ràng buộc/mức trừ; áp dụng FAQ-07 theo giai đoạn lab: cấm thêm/tăng mức trừ từ khi mở, cấm sửa sau Publish, lưu lịch sử; sửa hợp lệ thì hủy đề xuất cũ và soát lại. Test quyền/lifecycle. Hoàng review. |
| T39 | Hoàng | 22/11 | Mới có đề xuất model/cost trong README | Model adapter + prompt + JSON schema/evidence dòng, bảo vệ dữ liệu theo FAQ-06; sai schema, evidence không hợp lệ, timeout/hết budget → unsure có nguyên nhân theo FAQ-09; unit test dùng fake, thử model thật ở dev riêng. Dùng kết quả T23 để chốt model. Hiệp review. |
| T40 | Hoà | 22/11 | Chưa có pipeline hoặc bảng lưu đề xuất | Nối judge Accepted → hard rules/model → đề xuất gắn submission/constraint version; đảm bảo chỉ bài được tính xuất hiện ở hàng chờ. Nếu nộp AC rồi WA thì không để đề xuất AC cũ thành kết quả hiện tại; tránh trùng khi retry và làm mới khi sửa constraint. Hoàng review. |
| T41 | Hiệp | 15/11 | Không có frontend/, package.json hoặc check frontend | Dựng React/Vite/TS; đưa eslint/prettier/tsc/vitest vào đúng 4 make hiện hữu, CI vẫn gọi chúng; lưu bằng chứng từng lỗi frontend khiến check tương ứng đỏ và sửa thành xanh. Qua PR, Hoàng review. |

Nguồn các quy tắc sản phẩm cần chú ý: [FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02) (bài cuối trước hạn), [FAQ-05](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-05) (sandbox/limits), [FAQ-06](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-06) (thông báo cho sinh viên), [FAQ-07](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-07) (sửa constraint), [FAQ-08/09](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08) (ẩn đề xuất và unsure). Brief thắng FAQ khi mâu thuẫn; brief đầy đủ không có trong nguồn local được cung cấp.

## Các điểm đã làm nhưng phải sửa/bổ sung

1. **T11 — sai thời điểm deadline/submittedAt.** Controller chỉ đọc clock ở bước 8, sau DB và body. Probe đã tái hiện request trước hạn bị 409 vì xử lý qua hạn. Cần ghi receivedAt sớm và dùng nhất quán; thêm test crossing opens_at/due_at. Đây là lỗi hành vi đã có contract, không phải tính năng W4 mới.
2. **T09/T11 — JWT chưa khớp mô tả.** Decoder thực tế nhận token hết hạn 5 giây và token thiếu exp. Contract chưa nói dung sai hoặc thiếu exp; chốt chính sách rồi đồng bộ code/test. Không mặc định gọi clock skew của framework là lỗi bảo mật. [Bằng chứng probe](probe-results.txt).
3. **T06/T07 — chưa chứng minh đầy đủ quyền.** Syntax/execpolicy examples không thay thế phiên tương tác. `git push origin --force feature` chỉ khớp prompt; `git -C . push origin main`/`git branch -d feature` không khớp rule. Điều đó không chứng minh tự động được phép, nhưng phủ định việc bộ prefix hiện tại bao phủ mọi dạng lệnh. Cần làm rõ cả quyền sửa file/công cụ đọc secret. Chi tiết ở [báo cáo kỹ thuật PA#02](TECHNICAL-REVIEW.md).
4. **T10 — kết quả đã merge nhưng status vẫn cũ.** PR #7 merge thành 1599645 ngày 10/11. Ghi đúng AI blind reader, không biến thành người review.
5. **T12 — tài liệu không thay thế thao tác tài khoản.** Chưa có bằng chứng key và cap đã đặt. Token/cost đang là ước lượng, không phải số đo T23.
6. **T17/T18/T19 — mỗi người cần xác nhận nội dung của mình.** Đã có văn bản/entry không đồng nghĩa tác giả được ghi tên đã tự kiểm. PR #12 chưa merge.
7. **Review còn thiếu trên cả nhóm.** Xác nhận ngoài GitHub được ghi đúng nguồn; nếu người được phân review chưa xem thì cần nhận xét cụ thể trên phiên bản cuối, không tự gán “reviewed” vì đã merge.

## Những chỗ nên chỉnh trong kế hoạch chung

- Tách rõ T04 (Hoà) và T05 (Hoàng); tương tự, T04 là môi trường và T14 là khả năng fresh-clone theo README. Có thể thu hai bộ tiêu chí cùng phiên, không gộp mất task.
- Đồng bộ T03/T10/T13/T19 ở bảng đầu, mô tả chi tiết, lịch và bảng 41 task. Các README t03/t05/t10/t11 cũng còn câu trạng thái cũ.
- Giữ cả T22/T23 trong theo dõi W3 dù không ưu tiên hơn nộp PA#02. Phân biệt “không phải bằng chứng PA#02” với “không phải việc phải làm trong tuần”.
- T24 tuần trước đã kết thúc: cần chốt/bàn giao, không để Đang làm vô thời hạn. T25 đang tới lượt; T26 chưa tới lượt. Dùng log hỏi đáp thật.
- T27 là quyết định, T31 là triển khai; T11 có bảng chưa đồng nghĩa hoàn tất T29/T30/T31/T33. `queued` đang là giá trị response cố định.
- Task làm thay vẫn cần owner học/kiểm tra và reviewer độc lập theo phân công; giữ minh bạch ai vận hành AI và ai chịu trách nhiệm.
- Không tính phần trăm hoàn thành từ tracker hiện tại: trạng thái Excel chưa cập nhật và đang lẫn “đã code”, “đã merge”, “đã review”, “đủ bằng chứng”.

## Thứ tự xử lý đề nghị

**Trước nộp PA#02:** Hiệp sửa T11/chốt T09 và hoàn tất tài khoản T12; Hoà làm lượt T04+T14, T15 và kiểm chứng T06/T07; hoàn tất review T02/T03/T08/T09/T11/T12/T13. Mỗi người xác nhận AI-LOG. Khi source cuối ổn định, Hiệp làm T16/T20/T21 và Hoàng review bản zip. Theo dõi T22/T23 như công việc W3 riêng.

**Sau đó, các luồng có thể tiến hành độc lập:**

- Hiệp: T28 → T29 → T30, đồng thời T41 → T36. Chốt API đọc lab sớm để frontend không chờ tới 18/11.
- Hoà: T22 → T32; triển khai T31 từ fixtures/contract sớm, không chờ toàn bộ UI/lab API; ghép judge/queue với T33.
- Hoàng: chuẩn bị dataset/eval cho T34, tiếp T35; T23 làm đầu vào cho T39. T34 hạn 14/11 là đầu việc W4 sớm nhất của luồng này.
- T37 chỉ nghiệm thu khi các phần v0.2 thực sự chạy cùng nhau trên main. T38/T39/T40 cần thống nhất schema và constraint version trước khi triển khai độc lập.

Đây là đề nghị thứ tự công việc, không phải đề nghị dùng subagent hay thay đổi người phụ trách.

## Giới hạn kiểm tra

Đã kiểm đủ ID T01–T41, không bỏ qua task của ai. Đã đọc nhánh/PR/review GitHub hiện tại và repo FAQ; không có quyền đọc repo báo cáo private/Facebook từ nguồn cung cấp, nên các việc cá nhân/trực FAQ/zip được đánh dấu theo bằng chứng có sẵn. Không chạy lại bộ test toàn repo trong lượt mở rộng vì không đổi source; các probe từ lượt trước vẫn là bằng chứng kỹ thuật. Không sửa tracker, plan, source hoặc trạng thái PR/tag.

## Follow-up implemented after this audit

Hoang subsequently confirmed that the existing items were reviewed and requested corrections. [PR #13](https://github.com/tkob-team/LeeTKOB/pull/13) implements them; [8db9096 CI](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162) is 5/5 green. The current source of task status is the updated plan/workbook. The audit above is historical: its requests to repeat review, missing screenshot/template proof and identified receipt/JWT defects have been addressed in the follow-up branch, pending merge. T12, Hoa's local runs and release/submission steps remain incomplete.
