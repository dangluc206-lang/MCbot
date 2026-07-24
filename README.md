# Mineflayer Automation Framework

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
