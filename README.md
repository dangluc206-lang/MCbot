# Mineflayer Automation Framework

Bot Minecraft SkyBlock dùng Mineflayer, có Discord Controller để điều khiển và theo dõi từ xa. Discord chỉ là giao diện: command, button và modal luôn gọi vào `ModeManager` hoặc Service; không gọi Mineflayer trực tiếp.

```text
Discord interaction → DiscordController/Router → ModeManager hoặc Service → Mineflayer
```

## Yêu cầu

- Node.js 22+ và npm (Mineflayer hiện tại yêu cầu Node 22 trở lên).
- Một Discord Application/Bot nếu muốn bật Discord Controller.
- Tài khoản Minecraft và thông tin server.

## Cài đặt

1. Cài dependency: `npm install`.
2. Sao chép `config/config.example.json` thành `config/config.json`; đây chỉ là gameplay config, không đặt Discord token hay mật khẩu vào đây.
3. Sao chép `.env.example` thành `.env`, rồi điền mọi thông tin Discord và secret Minecraft.
4. Đăng ký slash command: `npm run discord:register`.
5. Chạy: `npm start`.

Trên PowerShell bị chặn npm script, dùng `npm.cmd run discord:register` hoặc `npm.cmd start`.

## `.env`

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

`DISCORD_ENABLED=false` (hoặc bỏ trống) vẫn cho Minecraft bot chạy nhưng không khởi tạo Discord. Discord token, role/user ID, channel ID và `SKYBLOCK_LOGIN_PASSWORD` chỉ đọc từ `.env`.

## Thiết lập Discord

1. Tạo Application tại Discord Developer Portal, tạo Bot và sao chép token vào `.env`.
2. Mời bot với scope `bot` và `applications.commands`.
3. Nếu phân quyền bằng role, bật Server Members Intent trong Bot settings.
4. Developer Mode của Discord cho phép Copy User ID, Role ID và Channel ID.
5. Dùng Guild ID khi phát triển để slash command xuất hiện gần như ngay; global command có thể mất thời gian đồng bộ.

## Kênh Discord

- `DISCORD_CONTROL_CHANNEL_ID`: một Control Panel duy nhất, tự cập nhật. Nút chỉ gồm kết nối Minecraft, vào SkyBlock, về đảo và điều khiển mode.
- `DISCORD_CONFIG_CHANNEL_ID`: một Config Panel duy nhất. Chỉnh slot SkyBlock/Dungeon, slot/tọa độ Fishing, ore cần bán và các gameplay config khác qua modal **Sửa config**.
- `DISCORD_NOTIFICATION_CHANNEL_ID`: spawn, disconnect, kick, mode state và các thông báo framework.
- `DISCORD_ERROR_CHANNEL_ID`: lỗi nghiêm trọng.

Panel Config chỉ chấp nhận các nhánh gameplay: `skyblock`, `storage`, `dungeon`, `fishing`, `crafting`, `guiProbe`, `viewer`, `logging`, `serverReset`, `mine`, `shop`. `discord` và `skyblock.loginPassword` luôn bị chặn. Giá trị modal là JSON, ví dụ `30000`, `true`, `"/d"`, `["DIAMOND"]`.

## Quyền

| Cấp | Quyền |
| --- | --- |
| VIEWER | Ping, help, status, position, health, players, inventory, view |
| MODERATOR | VIEWER + pause/resume, stop movement, logs/warnings |
| ADMIN | MODERATOR + điều khiển mode, chat/command, movement, inventory, reconnect/restart, Config Panel |
| OWNER | ADMIN + drop, shutdown, config nguy hiểm |

Không có `DISCORD_VIEWER_ROLE_IDS` nghĩa là người dùng không có role quản trị sẽ không có quyền xem. Đây là mặc định an toàn.

## Slash command chính

- Hệ thống: `/ping`, `/help`, `/status`, `/panel`, `/start`, `/stop`, `/restart`, `/shutdown`.
- Mode: `/mode list|start|stop|pause|resume|status`.
- Minecraft: `/chat`, `/command`, `/gui-probe`, `/position`, `/health`, `/players`, `/reconnect`.
- Movement: `/goto`, `/follow`, `/look`, `/jump`, `/movement-stop`.
- Inventory: `/inventory`, `/use`, `/equip`, `/swap`, `/drop`.
- Quan sát và log: `/view`, `/viewer`, `/logs`, `/errors`, `/warnings`.

## Mode và Storage

Mode hiện đăng ký: `collector`, `dungeon`, `fishing`.

Khi Minecraft kết nối, bot chỉ gửi `/login` một lần cho kết nối đó. Nếu menu/teleport SkyBlock lỗi hoặc timeout, luồng join sẽ tự đóng GUI cũ và thử lại `/skyblock` sau `skyblock.joinRetryDelayMs` (mặc định 5 giây), không gửi lại `/login`.

Recovery được phân biệt theo đúng phạm vi lỗi: (1) bị server kick khỏi Minecraft (`kicked`/socket đóng) khi bot đang ổn định chờ `minecraft.kickReconnectDelayMs` — mặc định 300000 ms = 5 phút — rồi reconnect, join SkyBlock và tiếp tục mode; nếu socket bị kick ngay trong workflow `/skyblock`, đó là lỗi join SkyBlock và chỉ chờ `skyblock.joinRetryDelayMs` (mặc định 5 giây); (2) vẫn online nhưng rời SkyBlock được xác nhận qua scoreboard thì chờ `skyblock.leaveRecoveryDelayMs` (mặc định 5 giây) rồi join SkyBlock, không reconnect và không gửi lại `/login`; (3) Dungeon nhận teleport bất ngờ hoặc `/spawn` thì chờ `dungeon.spawnReentryDelayMs` rồi vào lại `/d`, vẫn giữ AutoFarm. Teleport Dungeon chỉ kích hoạt khi chênh ít nhất `dungeon.unexpectedTeleportMinDistance` (mặc định 12 block), để bỏ qua correction vị trí nhỏ từ server. Lỗi mạng thông thường vẫn retry nhanh theo `minecraft.reconnectDelayMs`.

### Chế tạo Siêu Hợp Kim

Mode `super-alloy` mở `/ks` và click trái recipe theo cây craft: nguyên liệu thô → tinh luyện → khối tinh luyện → Cacbon/Titan/Volfram → Siêu Hợp Kim ở slot `33`. Mặc định tạo một SHK và click cách nhau `500 ms`; tiến độ hiện trên Control Panel.

Trước khi craft, bot gộp nguyên liệu từ toàn bộ inventory (bao gồm 9 ô hotbar/taskbar và tay phụ) và `/pv 2`; khi rút từ `/pv 2` luôn chừa `crafting.personalVault.reserveInventorySlots` slot để không làm đầy inventory. Crafting SHK không nung raw hoặc đổi khối. Mỗi lần đọc `/kho` thành công, `StorageService` lần lượt chạy `SmeltingService` (`/ks → click trái slot 12 → click slot nung`) rồi `MaterialConversionService` (`/ks → click trái slot 10 → click phôi`) cho mọi loại khối có số lượng trong `/kho`; cấu hình nằm tại `storage.smelting` và `storage.conversion`. Khi tạo thành công SHK, Collector cất stack SHK vừa tạo vào `/pv 2` (`crafting.personalVault.depositAfterCraft=true`). Tất cả lệnh `/...` hiện đi qua một hàng đợi chung: sau khi bất kỳ GUI nào đóng, lệnh `/` kế tiếp luôn chờ `minecraft.commandAfterGuiCloseDelayMs` (mặc định 6000 ms). Vì vậy `/pv → /ks`, `/kho → /ks`, `/autofarm → /d` và các mode khác không còn gửi lệnh quá sát khiến server bỏ qua GUI. Với `crafting.partialCraft.enabled=true` (mặc định), bot tách cây SHK thành các công đoạn: phần nào đang đủ nguyên liệu sẽ craft trước, phần thiếu được hoãn sang chu kỳ Collector sau thay vì chặn toàn bộ quy trình. Có thể bật `crafting.bulkCraft.enabled` để Shift+trái ở recipe SHK cuối cùng. Tùy chọn này mặc định tắt, chỉ chạy khi còn ít nhất `bulkCraft.minFreeSlots` slot trống và không dùng trong Collector, vì server sẽ craft cho đến khi inventory đầy.

Collector định kỳ mở `/kho`, đọc tooltip của item thông tin ở slot `49` và cập nhật **Kho NPC** trên Control Panel: tổng dung lượng, đã dùng, còn trống và phần trăm. Thanh `▮▯` chỉ là hiển thị, không quyết định automation.

Collector bắt đầu chu kỳ SHK ngay khi snapshot `/kho` có đủ toàn bộ nguyên liệu thô cần cho mục tiêu SHK đang cấu hình; dung lượng còn trống ở slot 49 chỉ hiển thị trên panel, không còn là điều kiện craft. Cây recipe luôn xử lý theo thứ tự phôi tinh luyện → khối tinh luyện, nên một loại phôi đủ 16 sẽ được nén thành khối trước khi bot chuyển sang nhánh tiếp theo. Sau một chu kỳ SHK thành công, bot cất SHK vào `/pv 2`, đọc `/kho` lại và chỉ bán kim cương, ngọc lục bảo, lapis (cả block) đạt `collector.postCraftSellMinimumAmount`.

```text
/kho sell DIAMOND
/kho sell IRON_BLOCK
```

Danh sách ore/block được lấy từ `storage.selectedOres` trong Config Panel. Chu kỳ Collector dùng `collector.storageGuiCheckIntervalMs`; sau khi bán, bot chờ `collector.afterSellGuiCheckDelayMs` trước khi đọc `/kho` lại. Nếu inventory đầy, Collector tạm ngừng nhặt thay vì tự bán toàn bộ inventory, để bảo vệ SHK và item vừa rút từ `/pv 2`.

## Cấu trúc

```text
core/        Context, Runtime, Engine, manager, event, error
services/    API Mineflayer tái sử dụng
listeners/   Mineflayer event → Runtime/EventManager
modes/       Workflow dài hạn: Collector, Dungeon, Fishing
discord/     Controller, command, component, panel, embed, permission
bootstrap/   Đăng ký manager, service, listener, mode
config/      Gameplay config mẫu
test/        Unit/integration test dùng FakeBot
```

Khi thêm Mode mới, đặt workflow ở `modes/`, đăng ký tại `bootstrap/registerModes.js`, và chỉ cho Discord gọi `ModeManager.start(name)`. Khi thêm Service mới, đăng ký tại `bootstrap/registerServices.js`; command Discord chỉ gọi API cấp Service đó.

## Kiểm thử

```text
npm test
npm run test:discord
npm run smoke
```

Test hiện kiểm tra framework lifecycle, Discord permission/router/response, SkyBlock workflow, Dungeon AutoFarm, parser dung lượng `/kho`, lệnh bán theo ore và rollback Mode.

### Rà GUI tùy ý

Lệnh Discord `/gui-probe` nhận script ngắn để dò GUI server mà không cần viết workflow riêng. Bước đầu là command Minecraft; các bước sau dùng `l<slot>` (chuột trái), `r<slot>` (chuột phải), `wait:<ms>`, `inspect` hoặc `close`.

```text
/gui-probe script:"/ks > l12 > r5 > inspect"
```

Mỗi bước in title, item, display name và NBT/lore của GUI vào terminal với nhãn `[GuiProbeService]`. Chỉ dùng khi không có mode chạy để tránh hai workflow cùng click GUI.

## Bảo mật

- Không commit `.env` hoặc `config/config.json`.
- Không gửi token/password/log raw chứa secret qua Discord.
- Nếu token từng xuất hiện ở terminal, ảnh hoặc commit, hãy tạo token Discord mới.
- Chỉ cấp role Viewer/Admin/Owner cho người tin cậy.
