# Quy tắc làm việc cho Codex

Bạn đang làm việc trực tiếp trên repository chính:

```text
C:\Users\lucso\mcbot
```

Bạn được phép chủ động đọc code, sửa code, chạy terminal, chạy test, khởi động bot và kiểm tra runtime thật trong phạm vi repository này.

Mục tiêu của bạn là làm việc như một kỹ sư phần mềm chủ động: tự điều tra, tự thu thập bằng chứng, sửa nguyên nhân gốc, kiểm tra lại và báo cáo rõ ràng.

## 1. Cách tiếp nhận yêu cầu

Khi tôi cung cấp:

* một dòng log;
* stack trace;
* mô tả hành vi sai;
* ảnh GUI;
* output terminal;
* tên service hoặc workflow;
* yêu cầu cải tiến;

hãy tự xác định những file và luồng liên quan.

Không yêu cầu tôi chỉ rõ file nếu có thể tìm được từ source, log hoặc search trong repo.

Không hỏi lại những thông tin có thể tự kiểm tra bằng:

* đọc code;
* tìm kiếm trong repo;
* Git;
* terminal;
* test;
* diagnostic logging;
* chạy bot thật.

Chỉ hỏi khi thiếu dữ liệu mà không thể tự thu thập an toàn.

## 2. Trước khi chỉnh sửa

Luôn bắt đầu bằng:

```bat
cd /d C:\Users\lucso\mcbot
git status --short
git diff --stat
git diff --check
```

Sau đó:

1. Đọc `AGENTS.md` và tài liệu liên quan.
2. Đọc file xuất hiện trong log hoặc stack trace.
3. Đọc caller và dependency trực tiếp.
4. Tìm test hiện có.
5. Hiểu public API và behavior hiện tại.
6. Xác định thay đổi nào đã tồn tại trước phiên làm việc.
7. Nêu ngắn gọn giả thuyết và các file dự kiến sửa.

Working tree hiện tại và lịch sử Git là nguồn sự thật.

Không suy đoán file bị hỏng hoặc repo bị corruption khi chưa có bằng chứng.

## 3. Phương pháp điều tra lỗi

Không sửa ngay dựa trên một dòng log.

Thực hiện theo thứ tự:

```text
tái hiện
→ thu thập bằng chứng
→ xác định nguyên nhân gốc
→ viết test tái hiện
→ sửa nhỏ nhất
→ chạy test
→ chạy runtime thật khi cần
```

Phân biệt rõ:

* lỗi gốc;
* lỗi dây chuyền;
* lỗi code;
* lỗi config;
* lỗi dependency;
* lỗi môi trường;
* lỗi server;
* lỗi detection;
* lỗi timing hoặc race condition.

Một API trả `SUCCESS` chỉ chứng minh lời gọi API hoàn tất theo contract của nó, không tự động chứng minh hành động nghiệp vụ đã thành công.

Ví dụ:

* click gửi thành công không đồng nghĩa server đã craft;
* command gửi thành công không đồng nghĩa GUI đã mở;
* window mở không đồng nghĩa metadata trong slot đã sẵn sàng;
* test có dòng `[ERROR]` không đồng nghĩa test fail.

Ưu tiên bằng chứng thực tế từ state trước và sau action.

## 4. Chủ động chạy runtime thật

Khi automated test không đủ để xác định lỗi, được phép:

* khởi động bot bằng script hiện có;
* theo dõi terminal;
* tái hiện workflow;
* thêm diagnostic logging;
* ghi lại GUI, inventory và Runtime state;
* dừng bot;
* sửa code;
* restart và kiểm tra lại.

Không tự đoán entry point nếu `package.json` đã có script.

Trước khi sửa source, dừng sạch tiến trình bot liên quan.

Không chỉnh code trong lúc process cũ vẫn đang chạy vì kết quả runtime có thể không phản ánh source mới.

Khi thêm diagnostic, chỉ ghi dữ liệu cần thiết:

* service và trạng thái;
* action;
* window ID/title/type;
* slot và item;
* inventory trước/sau;
* event nhận được;
* owner hoặc lock;
* timestamp.

Không log password, token, session hoặc secret.

Diagnostic tạm thời phải được xóa hoặc giảm xuống mức phù hợp sau khi xác định được lỗi.

## 5. Phạm vi mỗi lần sửa

Mỗi lượt tập trung vào một nguyên nhân gốc.

Được phép sửa nhiều file nếu chúng cùng tham gia một nguyên nhân, nhưng không mở rộng sang refactor khác chỉ vì nhìn thấy code chưa đẹp.

Ưu tiên:

```text
patch nhỏ
→ behavior rõ
→ test bảo vệ
→ dễ review
```

Không ưu tiên:

```text
viết lại lớn
→ đổi nhiều API
→ sửa nhiều workflow cùng lúc
→ khó xác định patch nào giải quyết lỗi
```

Nếu phát hiện lỗi khác không cùng nguyên nhân, ghi lại trong báo cáo nhưng không tự sửa tiếp trừ khi nó chặn trực tiếp việc kiểm tra patch hiện tại.

## 6. Bảo vệ hành vi hiện có

Giữ nguyên khi không thật sự cần thay đổi:

* public API;
* Runtime schema;
* Result convention;
* config cũ;
* CommonJS;
* method names;
* workflow behavior hợp lệ;
* logging convention;
* dependency direction.

Không thay assertion chỉ để test pass.

Không hard-code dữ liệu runtime cụ thể chỉ để xử lý một trường hợp quan sát được.

Không che race condition bằng delay hoặc `sleep`.

Không nuốt exception mà không ghi nguyên nhân.

Không biến lỗi thành success nếu chưa có bằng chứng nghiệp vụ.

## 7. Quy tắc kiến trúc project

Command server cố định phải đi theo:

```text
Service nghiệp vụ
→ ServerCommandService
→ ChatService.sendCommand()
→ bot.chat()
```

Không gọi trực tiếp `bot.chat()` ngoài `ChatService`.

GUI action phải đi theo:

```text
Service hoặc Screen
→ GUIService
→ bot.clickWindow()
```

Không gọi trực tiếp `bot.clickWindow()` ngoài `GUIService`.

Screen chịu trách nhiệm:

* nhận diện window;
* đọc và phân loại slot;
* xác minh target;
* cung cấp thao tác GUI an toàn.

Screen không chịu trách nhiệm:

* gửi command;
* điều phối workflow;
* tính kế hoạch nghiệp vụ;
* truy cập Mode;
* sở hữu Runtime của service nghiệp vụ.

Khi action phụ thuộc event:

```text
đăng ký listener/Promise
→ thực hiện action
→ chờ kết quả
→ cleanup
```

Cleanup phải chạy khi:

* thành công;
* timeout;
* action thất bại;
* exception;
* workflow bị dừng.

Không dùng `sleep` làm cơ chế xác nhận chính.

## 8. Screen và item matching

Không yêu cầu title, item name, lore, NBT và component đồng thời cùng khớp.

Phân biệt các kết quả nội bộ:

```text
MATCH
NOT_READY
NOT_THIS_SCREEN
AMBIGUOUS
FATAL
```

`NOT_THIS_SCREEN` là kết quả bình thường khi thử phân loại một window:

* không log ERROR;
* không đóng GUI;
* không click;
* không làm workflow fail.

`NOT_READY` nghĩa là metadata hoặc slot chưa cập nhật:

* chờ event update trong timeout;
* không dùng sleep;
* không coi là lỗi cứng.

`AMBIGUOUS`:

* không chọn ngẫu nhiên;
* không click;
* ghi chẩn đoán rõ.

`FATAL` chỉ dành cho config sai, dependency thiếu hoặc invariant nội bộ bị phá vỡ.

Item matching ưu tiên:

```text
custom identifier/component exact
→ compact alias exact
→ normalized alias exact
→ vanilla item fallback có kiểm soát
```

Không dùng riêng các carrier phổ biến như `paper`, `player_head` hoặc `glass_pane` để xác định custom item.

## 9. GUI concurrency

Tại một thời điểm chỉ một workflow được điều khiển GUI.

Scanner hoặc diagnostic không được:

* chiếm window của workflow khác;
* đóng window do workflow khác mở;
* click khi GUI đang có owner khác;
* gửi command mở GUI khác khi workflow đang bận.

Trước click, luôn xác minh lại:

* window vẫn tồn tại;
* window vẫn là cùng window đã nhận diện;
* slot vẫn tồn tại;
* item vẫn phù hợp;
* workflow vẫn sở hữu GUI.

Không dùng snapshot cũ để click window mới.

## 10. Viết test

Khi sửa bug, ưu tiên thêm regression test tái hiện đúng lỗi.

Quy trình mong muốn:

```text
test tái hiện fail
→ sửa code
→ test pass
```

Nếu không thể làm test fail trước patch, giải thích lý do.

Test phải kiểm tra behavior, không phụ thuộc quá mức vào implementation detail.

Bao phủ các nhánh quan trọng:

* success;
* timeout;
* retry;
* exception;
* cleanup;
* state thay đổi chậm;
* duplicate event;
* wrong window;
* missing metadata;
* concurrency khi liên quan.

Không tạo mock rộng đến mức test pass nhưng không đại diện cho runtime.

## 11. Kiểm tra sau chỉnh sửa

Với mọi file JavaScript đã sửa, chạy:

```bat
node --check <file>
```

Sau đó chạy:

```bat
node --test <test trực tiếp liên quan>
npm.cmd test
git diff --check
git status --short
git diff --stat
git diff -- <các file đã sửa>
```

Chạy thêm các script liên quan nếu chúng tồn tại trong `package.json`.

Không nói test pass nếu command chưa được chạy.

Nếu command không chạy được, báo chính xác:

* command;
* exit code;
* lỗi;
* phần kiểm tra chưa hoàn thành.

Nếu `git diff --check` đã fail từ trước, so sánh với baseline và bảo đảm patch mới không bổ sung lỗi.

## 12. Quy tắc Git

Không tự chạy:

```text
git reset
git clean
git restore
git checkout
git rebase
git commit
git push
```

Không xóa thay đổi hiện có của tôi.

Không format toàn repo vì một patch nhỏ.

Không thay line ending hàng loạt.

Không commit hoặc push trừ khi tôi yêu cầu rõ ràng.

Được phép dùng các lệnh chỉ đọc như:

```text
git status
git diff
git log
git show
git blame
```

## 13. Cách giao tiếp

Làm việc chủ động và ít hỏi.

Trong quá trình làm:

* thông báo ngắn khi đã xác định được lỗi đáng chú ý;
* nói rõ khi giả thuyết ban đầu bị bác bỏ;
* không liệt kê từng lệnh terminal nhỏ;
* không tuyên bố đã sửa trước khi test;
* không che giấu phần chưa xác minh.

Khi gặp nhiều hướng, chọn hướng có bằng chứng mạnh nhất và patch nhỏ nhất.

Không dừng chỉ vì nhiệm vụ phức tạp. Hãy hoàn thành phần có thể chứng minh được và báo rõ phần còn lại.

## 14. Báo cáo cuối

Sau mỗi task, báo theo cấu trúc:

### Nguyên nhân gốc

Lỗi ở đâu, vì sao xảy ra và bằng chứng.

### File đã sửa

Chỉ liệt kê file thực sự thay đổi.

### Thay đổi

Patch đã làm gì và vì sao đây là phạm vi phù hợp.

### Test

Liệt kê từng command và kết quả thật.

### Runtime

Ghi kết quả kiểm tra thực tế nếu đã chạy bot.

### Git

Modified, staged và untracked sau task.

### Vấn đề còn lại

Các vấn đề đã thấy nhưng không thuộc phạm vi nguyên nhân gốc.

Không tự bắt đầu task tiếp theo sau khi báo cáo.
