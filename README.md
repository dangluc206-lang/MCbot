# MCbot — Mineflayer SkyBlock Automation Framework

MCbot là bot Minecraft viết bằng Node.js và Mineflayer, tập trung vào tự động hóa SkyBlock theo workflow dài hạn. Dự án có một control plane Discord để theo dõi trạng thái, điều khiển mode, thao tác inventory, gửi lệnh Minecraft và chỉnh gameplay config mà không để Discord gọi Mineflayer trực tiếp.

```text
Discord command/button/modal
        │
        ▼
DiscordController + Router
        │
        ▼
ModeManager hoặc Service API
        │
        ▼
Mineflayer bot + server GUI/chat
```

> **Lưu ý quan trọng:** nhiều command, GUI slot, tọa độ, item alias và recipe trong `config/config.example.json` được thiết kế cho một server SkyBlock cụ thể. Hãy kiểm tra và sửa cấu hình trước khi chạy trên server khác.

## Nội dung

- [Tính năng chính](#tính-năng-chính)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt nhanh](#cài-đặt-nhanh)
- [Cấu hình](#cấu-hình)
- [Thiết lập Discord](#thiết-lập-discord)
- [Khởi động và vận hành](#khởi-động-và-vận-hành)
- [Các mode](#các-mode)
- [Discord commands và phân quyền](#discord-commands-và-phân-quyền)
- [Recovery và reconnect](#recovery-và-reconnect)
- [Viewer](#viewer)
- [Kiểm thử](#kiểm-thử)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Mở rộng dự án](#mở-rộng-dự-án)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Bảo mật](#bảo-mật)
- [Tài liệu kiến trúc](#tài-liệu-kiến-trúc)

## Tính năng chính

- Kết nối Minecraft bằng Mineflayer, hỗ trợ `offline` hoặc auth mode do Mineflayer cung cấp.
- Tự `/login`, mở menu SkyBlock, chọn server, về island và theo dõi trạng thái đã vào SkyBlock.
- Framework phân tầng với `Context`, `Runtime`, `Engine`, Manager, Listener, Service và Mode.
- Chỉ cho phép một mode dài hạn chạy tại một thời điểm.
- Tự reconnect khi socket đóng, lỗi mạng hoặc bị kick.
- Giữ ý định resume mode qua việc thay mới Mineflayer bot và Framework instance.
- Tránh reconnect quá sớm quanh giờ reset server.
- Hàng đợi command Minecraft dùng chung, có khoảng nghỉ sau khi GUI đóng.
- Discord slash command, button, persistent Control Panel và Config Panel.
- Phân quyền Discord theo `VIEWER`, `MODERATOR`, `ADMIN`, `OWNER`.
- Live viewer qua `prismarine-viewer`.
- Unit/integration test bằng Node test runner và FakeBot.

## Yêu cầu

- **Node.js 22 trở lên**.
- npm đi kèm Node.js.
- Một tài khoản Minecraft có thể đăng nhập server đích.
- Thông tin host, port, username, version và auth của server Minecraft.
- Discord Application/Bot nếu bật Discord Controller.

Kiểm tra phiên bản:

```bash
node --version
npm --version
```

## Cài đặt nhanh

### 1. Cài dependency

Dự án có `package-lock.json`, vì vậy nên dùng:

```bash
npm ci
```

Hoặc:

```bash
npm install
```

### 2. Tạo gameplay config

Linux/macOS:

```bash
cp config/config.example.json config/config.json
```

PowerShell:

```powershell
Copy-Item config/config.example.json config/config.json
```

### 3. Tạo file môi trường

Linux/macOS:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4. Điền cấu hình tối thiểu

`.env`:

```env
MINECRAFT_HOST=your-server.example
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=bot-account-name
MINECRAFT_VERSION=1.21.1
MINECRAFT_AUTH=offline
SKYBLOCK_LOGIN_PASSWORD=

DISCORD_ENABLED=false
```

Sau đó kiểm tra lại các slot, command và tọa độ trong `config/config.json`.

### 5. Chạy bot

```bash
npm start
```

Trên PowerShell nếu execution policy chặn `npm.ps1`, dùng:

```powershell
npm.cmd start
```

## Cấu hình

MCbot dùng hai nguồn cấu hình với mục đích khác nhau:

| Nguồn | Mục đích | Có được chứa secret? |
| --- | --- | --- |
| `.env` | Process config, Discord, Minecraft connection, password | Có, nhưng không commit |
| `config/config.json` | Gameplay workflow, GUI slot, tọa độ, timeout, recipe | Không |

### Thứ tự ưu tiên

Các biến môi trường sau ghi đè giá trị tương ứng trong `config/config.json`:

- `MINECRAFT_HOST`
- `MINECRAFT_PORT`
- `MINECRAFT_USERNAME`
- `MINECRAFT_VERSION`
- `MINECRAFT_AUTH`

`SKYBLOCK_LOGIN_PASSWORD` chỉ được nạp từ `.env`.

Toàn bộ Discord config chỉ được nạp từ `.env`; code không fallback sang `config/config.json`. Điều này ngăn Config Panel vô tình ghi token hoặc access-control ID vào gameplay config.

### `.env` đầy đủ

```env
DISCORD_ENABLED=true
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_OWNER_IDS=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=
DISCORD_VIEWER_ROLE_IDS=
DISCORD_CONTROL_CHANNEL_ID=
DISCORD_CONFIG_CHANNEL_ID=
DISCORD_NOTIFICATION_CHANNEL_ID=
DISCORD_ERROR_CHANNEL_ID=
DISCORD_REGISTER_GLOBAL_COMMANDS=false
DISCORD_DEFAULT_EPHEMERAL=true
DISCORD_LIVE_STATUS_INTERVAL_MS=5000
DISCORD_READY_TIMEOUT_MS=15000

MINECRAFT_HOST=
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=
MINECRAFT_VERSION=
MINECRAFT_AUTH=offline
SKYBLOCK_LOGIN_PASSWORD=
```

ID nhiều giá trị dùng dấu phẩy:

```env
DISCORD_OWNER_IDS=123456789012345678,234567890123456789
DISCORD_ADMIN_ROLE_IDS=345678901234567890,456789012345678901
```

Khi `DISCORD_ENABLED=true`, ứng dụng yêu cầu tối thiểu:

- `DISCORD_TOKEN`
- `DISCORD_OWNER_IDS` hoặc biến tương thích `DISCORD_OWNER_ID`

Minecraft luôn yêu cầu:

- `minecraft.host` hoặc `MINECRAFT_HOST`
- `minecraft.username` hoặc `MINECRAFT_USERNAME`

### Các nhóm gameplay config

| Root | Vai trò |
| --- | --- |
| `minecraft` | Kết nối, reconnect, command delay |
| `serverReset` | Khung giờ reset và thời gian chờ |
| `logging` | Mức log, stack, timezone |
| `guiProbe` | Timeout cho workflow dò GUI |
| `skyblock` | Login, menu slot, island, retry join |
| `collector` | Điểm nhặt, chu kỳ đọc kho, SHK |
| `storage` | `/kho`, dung lượng, bán ore, nung và đổi vật liệu |
| `crafting` | `/ks`, recipe tree, retry click, PV 2, partial/bulk craft |
| `dungeon` | `/d`, AutoFarm, combat và re-entry |
| `fishing` | `/afk`, slot và tọa độ câu cá |
| `viewer` | Live viewer port, distance và public URL |
| `mine`, `shop` | Tọa độ server-specific |

### Config Panel ghi được gì?

Config Panel chỉ ghi gameplay config. Các root hợp lệ hiện tại:

```text
minecraft
skyblock
storage
dungeon
fishing
crafting
collector
viewer
logging
guiProbe
serverReset
mine
shop
```

`skyblock.loginPassword` luôn bị chặn. Discord config không được phép ghi vào file.

Modal **Sửa config** nhận path sâu tối đa ba cấp và giá trị JSON, ví dụ:

```text
storage.autoSellFreeThreshold
150000
```

```text
crafting.partialCraft.enabled
true
```

```text
crafting.materialAliases.32
["volfram", "tungsten"]
```

Sau khi sửa, `ConfigurationService` lưu lại `config/config.json` và xóa mọi nhánh Discord legacy hoặc login password nếu chúng tồn tại trong file.

## Thiết lập Discord

### 1. Tạo bot

Trong Discord Developer Portal:

1. Tạo Application.
2. Tạo Bot cho Application.
3. Sao chép Bot Token vào `DISCORD_TOKEN`.
4. Sao chép Application ID vào `DISCORD_CLIENT_ID`.
5. Mời bot với scope `bot` và `applications.commands`.
6. Cấp quyền đọc/gửi message, embed, attachment và dùng slash command tại các channel đã chọn.

Khi phân quyền bằng role, bật **Server Members Intent** để member role có thể được đọc ổn định.

### 2. Lấy ID

Bật Discord Developer Mode rồi sao chép:

- Guild ID
- User ID của owner
- Role ID cho admin/moderator/viewer
- Channel ID cho control/config/notification/error

### 3. Đăng ký slash command

```bash
npm run discord:register
```

PowerShell:

```powershell
npm.cmd run discord:register
```

Quy tắc route đăng ký:

- Có `DISCORD_GUILD_ID` và `DISCORD_REGISTER_GLOBAL_COMMANDS` khác `true`: đăng ký guild command, cập nhật nhanh.
- Không có Guild ID hoặc đặt `DISCORD_REGISTER_GLOBAL_COMMANDS=true`: đăng ký global command.

### 4. Các channel tùy chọn

| Biến | Công dụng |
| --- | --- |
| `DISCORD_CONTROL_CHANNEL_ID` | Duy trì một dashboard điều khiển tự cập nhật |
| `DISCORD_CONFIG_CHANNEL_ID` | Duy trì một panel chỉnh gameplay config |
| `DISCORD_NOTIFICATION_CHANNEL_ID` | Spawn, disconnect, kick, mode và framework event |
| `DISCORD_ERROR_CHANNEL_ID` | Lỗi nghiêm trọng |

Bỏ trống Control hoặc Config channel thì manager tương ứng không tạo persistent panel. Slash command vẫn dùng được nếu Discord Controller đã bật.

Control Panel tự tìm message dashboard cũ của chính bot trong các message gần nhất; nếu không thấy, nó tạo message mới. Tần suất refresh được giới hạn trong khoảng 1–60 giây dù cấu hình nhập sai.

## Khởi động và vận hành

### Scripts

| Lệnh | Mục đích |
| --- | --- |
| `npm start` | Chạy ứng dụng chính |
| `npm run discord:register` | Đăng ký Discord slash command |
| `npm test` | Chạy toàn bộ Node tests |
| `npm run test:discord` | Chỉ chạy test Discord |
| `npm run smoke` | Smoke test bootstrap/framework |

### Trình tự khởi động

1. Đọc `.env` và `config/config.json`.
2. Validate Minecraft và Discord config tối thiểu.
3. Tạo Mineflayer bot và nạp pathfinder.
4. Tạo `Framework`, Manager, Service, Listener và Mode.
5. Khởi động Engine.
6. Gắn lifecycle/reconnect handler.
7. Khởi động live viewer nếu bật.
8. Khởi động Discord Controller nếu bật.
9. Lập lịch server reset.

### Dừng an toàn

Nhấn `Ctrl+C`, gửi `SIGTERM`, hoặc dùng `/shutdown` với quyền OWNER. Ứng dụng sẽ:

- hủy reconnect/reset timer;
- dừng Discord Controller;
- dừng mode và Framework;
- đóng viewer;
- gọi `bot.quit()`.

## Các mode

Mode được đăng ký tại `bootstrap/registerModes.js`. `ModeManager` chỉ cho một mode chạy tại một thời điểm.

| Tên mode | Mục đích |
| --- | --- |
| `collector` | Về island, di chuyển tới điểm nhặt, thu item, bảo trì `/kho`, craft SHK theo chu kỳ |
| `dungeon` | Vào `/d`, bật AutoFarm, theo dõi combat và tái vào khi bị đưa ra ngoài |
| `fishing` | Mở `/afk`, chọn slot, di chuyển tới tọa độ câu cá và trang bị cần |
| `super-alloy` | Chạy một workflow craft SHK độc lập rồi tự dừng |

### Collector

Collector là workflow phối hợp nhiều Service:

```text
SkyBlock join
   → về island
   → tới pickupPosition
   → nhặt item
   → đọc /kho
   → nung raw theo cấu hình
   → đổi block/phôi theo cấu hình
   → đánh giá nguyên liệu SHK
   → lấy thêm từ /pv 2
   → craft trong /ks
   → cất SHK vào /pv 2
   → bán ore/block theo rule
```

Các điểm vận hành đáng chú ý:

- `collector.pickupPosition` phải đúng với island/server hiện tại.
- Khi inventory đầy, Collector tạm dừng nhặt để tránh làm mất SHK hoặc item đã rút từ PV.
- `/kho` được đọc định kỳ theo `collector.storageGuiCheckIntervalMs`.
- Khi kho còn ít chỗ hơn `storage.autoSellFreeThreshold`, bot bán danh sách `storage.selectedOres`.
- Sau một chu kỳ SHK thành công, bot có thể bán riêng `collector.postCraftSellOres` nếu đủ `collector.postCraftSellMinimumAmount`.
- `crafting.partialCraft.enabled=true` cho phép craft phần đang đủ nguyên liệu và hoãn phần thiếu sang chu kỳ sau.
- Collector luôn tắt bulk craft ở target cuối để tránh inventory bị lấp đầy ngoài kiểm soát.

### Super Alloy

Mode `super-alloy` yêu cầu bot đã ở trong SkyBlock. Nó gọi `CraftingService` với:

- target slot mặc định `33`;
- target count mặc định `1`;
- recipe tree từ nguyên liệu thô → phôi tinh luyện → block tinh luyện → Cacbon/Titan/Volfram → Siêu Hợp Kim;
- inventory + `/pv 2` + `/kho` làm nguồn preflight;
- cất kết quả vào `/pv 2` khi `crafting.personalVault.depositAfterCraft=true`.

Mode tự dừng sau khi workflow hoàn tất hoặc thất bại.

### Dungeon

Dungeon dùng cấu hình server-specific như:

- `dungeon.command`
- `dungeon.entrySlot`
- `dungeon.autofarmCommand`
- `dungeon.autofarmSlot`
- weapon list, attack range và health/food threshold

Khi phát hiện teleport bất ngờ đủ xa hoặc quay lại spawn, mode có thể chờ `dungeon.spawnReentryDelayMs` rồi vào lại `/d`. Correction vị trí nhỏ hơn `dungeon.unexpectedTeleportMinDistance` bị bỏ qua.

Sau reconnect, Dungeon có thể chờ `dungeon.reentryDelayMs` trước khi resume để tránh vào lại quá sớm.

### Fishing

Fishing mở command `/afk`, chọn một slot trong `fishing.afkSlots`, rồi di chuyển tới tọa độ trong `fishing.slotTargets`.

Cần kiểm tra:

- slot menu;
- tọa độ đích;
- item cần câu;
- timeout pathfinder;
- block cần tránh hoặc block cho phép sprint-jump.

## Discord commands và phân quyền

### Cấp quyền

| Cấp | Cách nhận quyền |
| --- | --- |
| `OWNER` | User ID nằm trong `DISCORD_OWNER_IDS` |
| `ADMIN` | Có role nằm trong `DISCORD_ADMIN_ROLE_IDS` |
| `MODERATOR` | Có role nằm trong `DISCORD_MODERATOR_ROLE_IDS` |
| `VIEWER` | Có role nằm trong `DISCORD_VIEWER_ROLE_IDS` |

Quyền cao hơn kế thừa quyền thấp hơn. User không khớp owner hoặc role nào sẽ không có quyền mặc định.

### Danh sách command

| Nhóm | Command | Quyền tối thiểu |
| --- | --- | --- |
| Hệ thống | `/help`, `/panel`, `/ping`, `/status` | VIEWER |
| Hệ thống | `/start`, `/stop`, `/restart` | ADMIN |
| Hệ thống | `/shutdown` | OWNER |
| Mode | `/mode list`, `/mode status` | VIEWER |
| Mode | `/mode pause`, `/mode resume` | MODERATOR |
| Mode | `/mode start`, `/mode stop` | ADMIN |
| Minecraft | `/position`, `/health`, `/players` | VIEWER |
| Minecraft | `/chat`, `/command`, `/gui-probe`, `/pv-audit`, `/reconnect` | ADMIN |
| Movement | `/movement-stop` | MODERATOR |
| Movement | `/goto`, `/follow`, `/look`, `/jump` | ADMIN |
| Inventory | `/inventory` | VIEWER |
| Inventory | `/use`, `/equip`, `/swap` | ADMIN |
| Inventory | `/drop` | OWNER + xác nhận |
| Logs | `/logs`, `/warnings`, `/errors` | MODERATOR |
| View | `/view`, `/viewer` | VIEWER |
| Admin | `/config` | OWNER |

### Ví dụ

```text
/mode list
/mode start name:collector
/mode pause
/mode resume
/mode stop
```

```text
/goto x:-23996.7 y:100 z:19207.3 radius:1
/players range:64
/inventory
/pv-audit
```

### GUI Probe

`/gui-probe` chạy một script ngắn để dò GUI server mà không cần viết Service riêng.

```text
/gui-probe script:"/ks > l12 > r5 > inspect"
```

Các bước hỗ trợ:

- command Minecraft ở bước đầu, ví dụ `/ks`;
- `l<slot>`: click trái;
- `r<slot>`: click phải;
- `wait:<ms>`;
- `inspect`;
- `close`.

Service in title, slot, display name, item và metadata liên quan ra terminal. Chỉ dùng khi không có workflow GUI khác chạy để tránh tranh chấp window.

### Control Panel

Control Panel có các nhóm thao tác:

- làm mới trạng thái;
- yêu cầu kết nối Minecraft;
- join SkyBlock;
- về island;
- chạy Collector, Dungeon, Fishing;
- dừng, pause, resume mode;
- bán kho NPC.

Handler cho `super-alloy` đã được đăng ký trong router; giao diện panel hiện tại có thể được mở rộng thêm nút tương ứng nếu muốn hiển thị trực tiếp.

## Recovery và reconnect

MCbot phân biệt lỗi theo phạm vi thay vì xử lý mọi lỗi như nhau.

### 1. Lỗi trong cùng connection

Ví dụ:

- chưa vào SkyBlock;
- GUI timeout;
- bị đưa khỏi island;
- Dungeon teleport bất ngờ;
- player chết;
- pathfinder không tới đích.

Service hoặc Mode sẽ retry, recover hoặc yêu cầu re-entry mà không nhất thiết tạo bot mới.

### 2. Socket bị đóng hoặc lỗi mạng

`index.js` tạo một Mineflayer bot và Framework mới. Delay retry dùng exponential backoff:

```text
minecraft.reconnectDelayMs × 2^attempt
```

và bị giới hạn bởi `minecraft.reconnectMaxDelayMs`.

### 3. Server kick

- Kick trong lúc workflow join SkyBlock đang chạy: dùng `skyblock.joinRetryDelayMs` để thử lại nhanh.
- Kick khi connection đang ổn định: dùng `minecraft.kickReconnectDelayMs`, mặc định 5 phút, để tránh reconnect loop.

### 4. Resume mode

Process giữ một mode-resume intent độc lập với Framework instance. Sau reconnect:

1. bot mới kết nối;
2. Discord Controller đổi sang Context mới;
3. bot join SkyBlock nếu cần;
4. mode trước đó được khởi động lại nếu không bị pause/stop có chủ ý.

Mode đang pause không tự resume qua reconnect.

### 5. Server reset

`serverReset.hours` định nghĩa các giờ reset theo `serverReset.timeZone`. Khi tới lịch:

- ứng dụng chủ động đóng connection;
- chờ qua cửa sổ reset;
- reconnect;
- join lại SkyBlock;
- resume mode nếu có.

Reconnect thông thường cũng tôn trọng cửa sổ reset để tránh tạo vòng lặp kết nối ngay lúc server chưa sẵn sàng.

### 6. Command queue và GUI

Mọi command bắt đầu bằng `/` đi qua hàng đợi chung của `ChatService`. Sau khi GUI đóng, command tiếp theo chờ ít nhất:

```text
minecraft.commandAfterGuiCloseDelayMs
```

Điều này giảm lỗi server bỏ qua command khi các workflow `/pv`, `/kho`, `/ks`, `/d` hoặc `/afk` chạy quá sát nhau.

## Viewer

Bật trong `config/config.json`:

```json
{
  "viewer": {
    "enabled": true,
    "port": 3000,
    "viewDistance": 6,
    "publicUrl": ""
  }
}
```

Viewer khởi động sau khi bot spawn và dùng góc nhìn first-person.

- Trên chính máy chạy bot, viewer thường truy cập bằng `http://localhost:3000`.
- `/viewer` chỉ trả URL khi `viewer.publicUrl` là một địa chỉ `https://` hợp lệ.
- `/view` hiện chưa hỗ trợ chụp ảnh và sẽ trả trạng thái thất bại có kiểm soát.

Không public port viewer trực tiếp ra Internet nếu chưa có authentication, firewall hoặc reverse proxy phù hợp.

## Kiểm thử

### Chạy toàn bộ

```bash
npm test
```

### Chỉ Discord

```bash
npm run test:discord
```

### Smoke test

```bash
npm run smoke
```

Test hiện bao phủ các nhóm chính:

- lifecycle của Framework, Manager, Service, Listener và Mode;
- ModeManager invariant và rollback;
- SkyBlock login/join/recovery;
- Collector, Storage, crafting và parser GUI;
- Dungeon/Fishing workflow;
- Discord registry, permission, middleware, command/component response;
- configuration persistence và secret boundary.

Các test dùng FakeBot nên phần lớn không cần kết nối tới Minecraft hoặc Discord thật.

## Cấu trúc dự án

```text
MCbot-main/
├── index.js                    # Process lifecycle, connection, reconnect, reset
├── Framework.js                # Composition root cho mỗi Minecraft connection
├── Architecture.md             # Tài liệu kiến trúc chi tiết
├── bootstrap/                  # Đăng ký manager/service/listener/mode
├── config/
│   ├── config.example.json     # Mẫu gameplay config
│   ├── location.json
│   └── profiles.json
├── core/
│   ├── base/                   # BaseManager/BaseService/BaseListener/BaseMode
│   ├── constants/              # Event, State, Result, Priority
│   ├── context/                # Context/service locator có kiểm soát
│   ├── engine/                 # Engine tick loop
│   ├── errors/                 # Error model và ErrorHandler
│   ├── managers/               # Event, Mode, Scheduler, Recovery, Watchdog, Logger
│   └── runtime/                # Runtime state và RuntimeFactory
├── listeners/                  # Mineflayer event → EventManager/Runtime
├── services/                   # API capability và domain workflow
├── modes/                      # Workflow dài hạn
├── discord/                    # Controller, router, commands, component, panel
├── scripts/                    # Register commands và smoke test
├── test/                       # Node tests + FakeBot
└── utils/                      # Item label/helper
```

Dependency direction tổng quát:

```text
index.js / Discord
        ↓
Framework / ModeManager
        ↓
Mode
        ↓
Service
        ↓
Mineflayer API
```

Listener nhận Mineflayer event và phát event nội bộ; Listener không nên chứa workflow dài hạn.

## Mở rộng dự án

### Thêm Service

1. Tạo file trong `services/` và kế thừa `BaseService`.
2. Chỉ expose API nghiệp vụ rõ ràng.
3. Đăng ký trong `bootstrap/registerServices.js`.
4. Export trong `services/index.js`.
5. Viết test với FakeBot.

Discord command nên gọi Service thay vì gọi thẳng `ctx.bot`.

### Thêm Listener

1. Tạo file trong `listeners/` và kế thừa `BaseListener`.
2. Bind Mineflayer event trong lifecycle của Listener.
3. Chuẩn hóa payload rồi emit qua `EventManager`.
4. Đăng ký tại `bootstrap/registerListeners.js`.
5. Cleanup toàn bộ handler khi stop.

### Thêm Mode

1. Tạo file trong `modes/` và kế thừa `BaseMode`.
2. Dùng Service cho Minecraft operation.
3. Implement `start`, `tick`, `pause`, `resume`, `recover`, `stop` khi cần.
4. Đăng ký tên public tại `bootstrap/registerModes.js`.
5. Export trong `modes/index.js`.
6. Điều khiển từ Discord qua `ModeManager.start(name)`.

Không tạo một tick loop riêng trong Mode; dùng Engine hiện có.

### Thêm Discord command

1. Tạo `*.command.js` trong đúng group.
2. Khai báo `data`, `group`, `permission`, `cooldown`, `execute`.
3. Gọi ModeManager hoặc Service API.
4. Đăng ký trong `DiscordController`.
5. Chạy lại `npm run discord:register`.
6. Thêm permission/router test.

## Xử lý sự cố

### `Missing Minecraft configuration: host, username`

Kiểm tra `config/config.json` hoặc:

```env
MINECRAFT_HOST=
MINECRAFT_USERNAME=
```

### `DISCORD_TOKEN is required when Discord is enabled`

Đặt token hợp lệ hoặc tắt Discord:

```env
DISCORD_ENABLED=false
```

### `DISCORD_OWNER_IDS is required when Discord is enabled`

Thêm ít nhất một Discord User ID:

```env
DISCORD_OWNER_IDS=123456789012345678
```

### Slash command không xuất hiện

- Kiểm tra `DISCORD_CLIENT_ID`, `DISCORD_TOKEN`, `DISCORD_GUILD_ID`.
- Chạy lại `npm run discord:register`.
- Dùng guild command trong lúc phát triển.
- Kiểm tra bot đã được mời với `applications.commands`.

### Bot Discord online nhưng panel không xuất hiện

- Kiểm tra channel ID.
- Bot phải xem, gửi và sửa message trong channel.
- Channel phải là text-based.
- Xem log lỗi khi `ControlPanelManager` hoặc `ConfigPanelManager` khởi động.

### Bot kết nối nhưng không vào SkyBlock

- Kiểm tra `SKYBLOCK_LOGIN_PASSWORD`.
- Kiểm tra `skyblock.serverSlot`, `islandSlot`, command và timeout.
- Bật log GUI có chọn lọc.
- Dùng `/gui-probe` khi không có mode khác chạy.

### GUI mở sai hoặc click sai slot

Server có thể đã đổi menu. Cập nhật:

- `skyblock.serverSlot`
- `dungeon.entrySlot`
- `fishing.afkSlots`
- `crafting.entrySlot`
- `crafting.targetSlot`
- `storage.smelting.menuSlot`
- `storage.conversion.menuSlot`
- recipe slot và alias

### Bot gửi command nhưng server không mở GUI

- Tăng `minecraft.commandAfterGuiCloseDelayMs`.
- Tăng GUI timeout tương ứng.
- Không chạy `/gui-probe` đồng thời với mode.
- Kiểm tra command server có đổi không.

### Collector đứng ở `INVENTORY_FULL`

- Kiểm tra `/kho` có mở được không.
- Kiểm tra chuyển block/phôi và smelting.
- Kiểm tra `storage.selectedOres`.
- Kiểm tra `/pv 2` còn chỗ.
- Giảm batch hoặc tăng `crafting.personalVault.reserveInventorySlots`.

### Viewer không mở

- Kiểm tra `viewer.enabled` và port.
- Port có thể đang bị process khác sử dụng.
- Viewer chỉ khởi động sau khi bot spawn.
- Không dùng `publicUrl` nếu URL chưa thật sự truy cập được từ nơi chạy Discord client.

### Test báo thiếu module

Chạy lại:

```bash
npm ci
```

Đảm bảo dùng Node.js 22+ và dependency native như `canvas` cài thành công trên hệ điều hành hiện tại.

## Bảo mật

- Không commit `.env` hoặc `config/config.json`.
- Không ghi Discord token, Minecraft password hoặc login password vào source code.
- Không gửi raw config/stack/log có secret vào Discord.
- Nếu token từng xuất hiện trong commit, terminal stream hoặc ảnh chụp, hãy rotate token.
- Chỉ cấp OWNER/ADMIN cho người thực sự cần quyền điều khiển bot.
- `/command`, `/chat`, inventory mutation, reconnect và config là thao tác có rủi ro; giữ role ID chặt chẽ.
- Không public viewer mà không có lớp bảo vệ.
- Giữ `DISCORD_VIEWER_ROLE_IDS` rõ ràng; user không có role không được quyền VIEWER mặc định.

Bảo đảm `.gitignore` loại trừ ít nhất:

```text
.env
config/config.json
node_modules/
```

Bản `.gitignore` hiện tại đã bỏ qua `.env` và `node_modules/`, nhưng chưa ghi rõ `config/config.json`; hãy bổ sung dòng này trước khi tạo gameplay config trong một repository Git.

## Tài liệu kiến trúc

Xem [`Architecture.md`](./Architecture.md) để đọc chi tiết về:

- application lifecycle và connection lifecycle;
- Context, Runtime và Engine;
- dependency rules;
- Manager, Listener, Service và Mode catalog;
- SkyBlock, Collector–Storage–Crafting, Dungeon và Fishing workflow;
- Discord control plane;
- recovery, concurrency, timeout và cleanup;
- testing strategy;
- technical debt và checklist review kiến trúc.
