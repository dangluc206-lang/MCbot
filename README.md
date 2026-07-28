# Mineflayer Automation Framework

## Discord Controller

Discord là lớp điều khiển từ xa; command không gọi Mineflayer trực tiếp. Tất cả thao tác đi qua `Context`, `ModeManager` hoặc Service. Controller dùng slash command, permission ở server-side, cooldown, audit log, dashboard và notification event-driven.

### Thiết lập Discord

1. Tạo Discord Application, thêm Bot và bật **Server Members Intent** nếu bạn cấu hình quyền theo role.
2. Mời bot với scope `bot` và `applications.commands`.
3. Sao chép `.env.example` thành `.env`, điền `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` và ít nhất `DISCORD_OWNER_IDS`.
4. Chạy `npm run discord:register`. Có `DISCORD_GUILD_ID` thì command được đăng ký riêng cho guild development; bỏ biến này hoặc đặt `DISCORD_REGISTER_GLOBAL_COMMANDS=true` để đăng ký global.
5. Chạy `npm start`, sau đó dùng `/help` hoặc `/status`.

Không gửi `.env`, token Discord, mật khẩu Minecraft hoặc URL viewer riêng tư lên Discord. `viewer.publicUrl` chỉ được hiển thị khi là URL HTTPS công khai.

### Quyền

| Cấp | Quyền chính |
| --- | --- |
| VIEWER | ping, help, status, position, health, players, inventory |
| MODERATOR | pause/resume, dừng di chuyển, logs |
| ADMIN | chat, command, mode start/stop, goto, reconnect, restart |
| OWNER | shutdown có bước xác nhận |

### Lệnh hiện có

`/ping`, `/help`, `/status`, `/panel`, `/start`, `/stop`, `/restart`, `/shutdown`, `/mode`, `/chat`, `/command`, `/position`, `/health`, `/players`, `/reconnect`, `/goto`, `/inventory`, `/logs`.

Dashboard `/status` có nút làm mới, chạy/dừng/tạm dừng/tiếp tục mode. Inventory có phiên phân trang 2 phút và chỉ người tạo phiên mới điều khiển được.

`/panel` là bảng điều khiển đầy đủ: kết nối Minecraft, chọn SkyBlock slot 12/14, về đảo, chạy Collector/Dungeon/Câu cá, quản lý mode và chọn ore/block được phép bán.

## Chạy dự án

1. Sao chép `config/config.example.json` thành `config/config.json` và điền thông tin Minecraft.
2. Sao chép `.env.example` thành `.env`, sau đó đặt `DISCORD_TOKEN` và `DISCORD_OWNER_ID` nếu muốn bật Discord.
3. Chạy `npm start`.

`config/config.json` và `.env` là cấu hình cục bộ, không đưa lên Git. Discord chỉ nhận lệnh/tương tác từ `DISCORD_OWNER_ID`.

Dùng slash command `/panel` trong Discord để mở bảng điều khiển bằng nút bấm, không cần chat lệnh Minecraft. Bảng có các nút: trạng thái, vào SkyBlock, về đảo `/is`, bật Dungeon, bật Collector, tạm dừng, tiếp tục và dừng mode.
Nếu muốn bot tự gửi bảng này sau mỗi lần khởi động, đặt ID kênh Discord vào `discord.controlChannelId` trong `config/config.json`.

Panel tự cập nhật máu, độ no và tọa độ mỗi 5 giây (đổi tại `discord.liveStatusIntervalMs`). Góc nhìn thứ nhất của bot chạy tại `http://localhost:3000` trên máy đang chạy bot. Để mở bằng nút trong Discord từ máy khác, tạo một URL HTTPS công khai trỏ tới cổng này rồi đặt URL đó vào `viewer.publicUrl`.

Khi Dungeon đang chạy, bot nhận diện thông báo chứa `spawn` và tự vào lại `/d` sau 2 giây, nhưng giữ nguyên AutoFarm. Có thể đổi từ khóa và thời gian bằng `dungeon.spawnPatterns` và `dungeon.spawnReentryDelayMs`; nếu server không gửi thông báo spawn, hãy cấu hình tọa độ `dungeon.spawnPosition`.

Mode Câu cá (`Bật Câu cá` hoặc `!start fishing`) gửi `/afk`, thử lần lượt slot `11`, `13`, `15` nếu slot trước đầy, tìm nước gần nhất, cầm `fishing_rod` và tự thả cần lặp lại. Các slot, bán kính tìm nước và tên cần câu nằm trong `fishing` của `config/config.json`.

Khi bị kick, `socketClosed` hoặc lỗi kết nối, bot tự tạo kết nối mới sau 5 giây; thời gian chờ tăng dần đến tối đa 60 giây nếu tiếp tục thất bại. Nó vào lại SkyBlock, thực hiện `/is` một lần rồi tiếp tục mode đang chạy. Dungeon giữ thời gian chờ vào lại theo `dungeon.reentryDelayMs` (mặc định 300 giây).

Các lệnh `!…` bên dưới vẫn được giữ để tương thích:

- `!status`
- `!start collector` hoặc `!start dungeon`
- `!stop`, `!pause`, `!resume`

Kiểm tra framework bằng `npm test` hoặc `npm run smoke`.

## Giới thiệu

Mineflayer Automation Framework là một framework được xây dựng bằng **Node.js** dựa trên thư viện **Mineflayer**, hướng tới việc tự động hóa các hoạt động trong máy chủ Minecraft SkyBlock.

Dự án được thiết kế theo kiến trúc nhiều tầng (Layered Architecture), giúp dễ mở rộng, dễ bảo trì và hỗ trợ phát triển nhiều chế độ (Mode) khác nhau mà không cần thay đổi kiến trúc lõi.

Framework không chỉ điều khiển Bot Minecraft mà còn tích hợp Discord để quản lý và giám sát từ xa.

---

# Mục tiêu

- Xây dựng framework Mineflayer có kiến trúc rõ ràng.
- Tự động hóa các hoạt động trong máy chủ SkyBlock.
- Hỗ trợ điều khiển Bot thông qua Discord.
- Dễ dàng mở rộng thêm nhiều chế độ hoạt động.
- Có khả năng tự phục hồi khi gặp lỗi hoặc mất kết nối.
- Tách biệt nghiệp vụ, giảm phụ thuộc giữa các thành phần.

---

# Chức năng chính

## 1. Quản lý kết nối

- Tự động kết nối đến máy chủ.
- Tự động reconnect khi bị kick hoặc mất kết nối.
- Tự động chấp nhận Resource Pack.
- Tự động `/login` sau mỗi lần reconnect.
- Tự động vào SkyBlock.
- Tự động tiếp tục công việc đang thực hiện trước khi bị ngắt.

---

## 2. Điều khiển người chơi

- Chat.
- Thực thi Command.
- Theo dõi HP.
- Theo dõi Food.
- Theo dõi Ping.
- Theo dõi Gamemode.
- Theo dõi vị trí.
- Điều khiển hướng nhìn.
- Jump.
- Swing.
- Theo dõi Respawn.

---

## 3. Di chuyển

- Pathfinding.
- Follow Player.
- Look At.
- Face Entity.
- Stop.
- Wait.
- Kiểm tra trạng thái di chuyển.

---

## 4. Inventory

- Đọc Inventory.
- Đếm vật phẩm.
- Chọn Item.
- Equip Tool.
- Unequip.
- Drop Item.
- Kiểm tra Inventory đầy.
- Kiểm tra số ô trống.

---

## 5. GUI

- Mở GUI.
- Đóng GUI.
- Đọc Title.
- Click Slot.
- Shift Click.
- Chờ GUI mở.
- Chờ GUI đóng.
- Chờ Slot thay đổi.

---

## 6. NPC

- Tìm NPC.
- Tìm NPC gần nhất.
- Tương tác NPC.
- Chờ GUI mở sau khi tương tác.

---

## 7. SkyBlock

- Accept Resource Pack.
- Login.
- Join SkyBlock.
- Điều hướng GUI.
- Teleport về đảo.
- Kiểm tra trạng thái đã vào SkyBlock.

---

## 8. Collector

- Di chuyển tới vị trí nhặt đồ.
- Tự động nhặt Item.
- Lưu vị trí làm việc.
- Quay lại vị trí làm việc.
- Pause.
- Resume.

---

## 9. Storage

### Bán Inventory

- Di chuyển tới NPC.
- Mở GUI.
- Click Sell All.

### Bán Kho

- Thực hiện lệnh:

```
/kho sell <ore>
```

Ví dụ:

```
/kho sell diamond
/kho sell emerald
```

Không sử dụng GUI.

---

## 10. Dungeon

- Auto Eat.
- Theo dõi trạng thái chết.
- Sau khi chết:
    - Respawn
    - Chờ 60 giây
    - Thực hiện `/d`
    - Tiếp tục treo Dungeon.

---

## 11. Watchdog

Theo dõi:

- Disconnect
- Kick
- Timeout
- Freeze
- Không di chuyển được
- GUI treo
- Lỗi Engine

Sau khi phát hiện lỗi sẽ kích hoạt Recovery.

---

## 12. Discord

Điều khiển Bot từ xa:

- `/panel`: Bảng điều khiển Discord bằng nút bấm (chỉ owner sử dụng được).

- Start
- Stop
- Chuyển Mode
- Theo dõi trạng thái
- Theo dõi Runtime
- Quản lý Collector
- Quản lý Storage
- Quản lý Dungeon

---

# Kiến trúc dự án

```
Discord

↓

Command

↓

Mode

↓

Service

↓

Mineflayer
```

Nguyên tắc:

- Service không biết Discord.
- Service không biết Engine.
- Service không biết Scheduler.
- Runtime chỉ lưu trạng thái.
- Listener chỉ cập nhật Runtime.
- Manager chỉ quản lý vòng đời.

---

# Các Mode

Framework được thiết kế để dễ dàng mở rộng.

Các Mode hiện có:

- Idle
- Dungeon
- Collector
- AFK
- Craft
- Farming

Dự kiến mở rộng:

- Fishing
- Mining
- Boss
- Quest
- Daily
- Event
- Trading
- ...

Không cần thay đổi kiến trúc Framework.

---

# Công nghệ sử dụng

## Ngôn ngữ

- JavaScript (ES2022)

---

## Runtime

- Node.js

---

## Thư viện

- Mineflayer
- mineflayer-pathfinder
- discord.js
- dotenv
- winston (Logging)

---

## Kiến trúc

- Layered Architecture
- Dependency Injection
- Service-Oriented Architecture
- Event Driven (Listener)
- Runtime State Management

---

## Mô hình thiết kế

- Factory Pattern
- Manager Pattern
- Base Class Pattern
- Context Pattern
- State Pattern

---

# Đặc điểm nổi bật

- Kiến trúc rõ ràng.
- Dễ bảo trì.
- Dễ mở rộng.
- Tự động Recovery.
- Tự động Reconnect.
- Quản lý Runtime tập trung.
- Tách biệt nghiệp vụ.
- Hạn chế Circular Dependency.
- Có Watchdog theo dõi toàn hệ thống.
- Hỗ trợ điều khiển từ Discord.

---

# Định hướng phát triển

- Hỗ trợ nhiều máy chủ SkyBlock.
- Hỗ trợ Plugin.
- Hỗ trợ Script API.
- Dashboard Web.
- Database lưu Runtime.
- Multi Bot.
- AI hỗ trợ điều khiển Bot.
