# Mineflayer Automation Framework

Bot Minecraft SkyBlock dùng Mineflayer, có Discord Controller để điều khiển và theo dõi từ xa. Discord chỉ là giao diện: command, button và modal luôn gọi vào `ModeManager` hoặc Service; không gọi Mineflayer trực tiếp.

```text
Discord interaction → DiscordController/Router → ModeManager hoặc Service → Mineflayer
```

## Yêu cầu

- Node.js LTS và npm.
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

Panel Config chỉ chấp nhận các nhánh gameplay: `skyblock`, `storage`, `dungeon`, `fishing`, `viewer`, `logging`, `serverReset`, `mine`, `shop`. `discord` và `skyblock.loginPassword` luôn bị chặn. Giá trị modal là JSON, ví dụ `30000`, `true`, `"/d"`, `["DIAMOND"]`.

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
- Minecraft: `/chat`, `/command`, `/position`, `/health`, `/players`, `/reconnect`.
- Movement: `/goto`, `/follow`, `/look`, `/jump`, `/movement-stop`.
- Inventory: `/inventory`, `/use`, `/equip`, `/swap`, `/drop`.
- Quan sát và log: `/view`, `/viewer`, `/logs`, `/errors`, `/warnings`.

## Mode và Storage

Mode hiện đăng ký: `collector`, `dungeon`, `fishing`.

Collector định kỳ mở `/kho`, đọc title NBT dạng `▮▯` và cập nhật **Kho NPC** trên Control Panel. Khi đủ thanh (ví dụ `8/8`), bot gửi lần lượt:

```text
/kho sell diamond
/kho sell iron_block
```

Danh sách ore/block được lấy từ `storage.selectedOres` trong Config Panel. Chu kỳ kiểm tra là `storage.guiCheckIntervalMs`; dùng 5 giây chỉ để test, nên tăng lên 30–60 giây khi chạy lâu.

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
npm run smoke
```

Test hiện kiểm tra framework lifecycle, Discord permission/router/response, SkyBlock workflow, Dungeon AutoFarm, parser dung lượng `/kho`, lệnh bán theo ore và rollback Mode.

## Bảo mật

- Không commit `.env` hoặc `config/config.json`.
- Không gửi token/password/log raw chứa secret qua Discord.
- Nếu token từng xuất hiện ở terminal, ảnh hoặc commit, hãy tạo token Discord mới.
- Chỉ cấp role Viewer/Admin/Owner cho người tin cậy.
