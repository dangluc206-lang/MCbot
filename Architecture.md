# Architecture.md

# Mineflayer Automation Framework

Version: 1.0 (LOCK)

---

# 1. Goal

Xây dựng một Mineflayer Framework có khả năng mở rộng, ổn định, chạy 24/7 và điều khiển hoàn toàn thông qua Discord.

Framework phải có khả năng:

* Chạy nhiều Mode khác nhau.
* Dễ mở rộng.
* Không sửa API sau khi bắt đầu code.
* Không phụ thuộc vào một server Minecraft cụ thể.
* Có khả năng tự phục hồi khi xảy ra lỗi.
* Dễ bảo trì.

---

# 2. Design Philosophy

Framework được chia thành nhiều tầng.

Mỗi tầng chỉ có một trách nhiệm.

Không tầng nào được phá vỡ quy tắc phụ thuộc.

```
Discord
      │
      ▼
Controller
      │
      ▼
Engine
      │
      ▼
Mode
      │
      ▼
Service
      │
      ▼
Mineflayer
```

Runtime, Managers và Listeners hoạt động độc lập.

---

# 3. Dependency Rules

Chỉ được gọi xuống dưới.

Ví dụ hợp lệ

```
Mode
    ↓
MovementService
```

Ví dụ không hợp lệ

```
MovementService
    ↓
CollectorMode
```

Không được.

---

## Forbidden Dependency

Không được phép:

* Service gọi Engine.
* Service gọi Mode.
* Listener gọi Service.
* Listener gọi Mode.
* Discord gọi Mineflayer.
* Discord gọi Service nền.
* Manager gọi Mode.

---

# 4. Runtime

Runtime là State Store.

Runtime KHÔNG chứa:

* Logic
* Method
* Promise
* Event

Runtime chỉ chứa dữ liệu.

Ví dụ:

```
runtime.connection

runtime.player

runtime.gui

runtime.mode

runtime.collector

runtime.storage

runtime.dungeon

runtime.watchdog

runtime.task
```

---

# 5. Context

Toàn bộ dependency được inject thông qua Context.

Không import chéo giữa các module.

Context chứa:

```
ctx.bot

ctx.config

ctx.runtime

ctx.logger

ctx.managers

ctx.services

ctx.modes
```

---

# 6. Managers

Manager chỉ quản lý hạ tầng.

Không xử lý nghiệp vụ.

Danh sách:

* LoggerManager
* EventManager
* SchedulerManager
* PluginManager
* ModeManager
* RecoveryManager

---

# 7. Services

Service chỉ thực hiện một nhiệm vụ duy nhất.

Không chứa workflow.

Ví dụ:

Movement

* goto()
* follow()

Inventory

* items()
* count()

GUI

* click()
* open()

Player

* command()
* chat()

Storage

* sellInventory()
* sellStorage()

SkyBlock

* login()
* join()

Food

* eat()
* hasFood()

---

# 8. Modes

Mode là Workflow.

Ví dụ:

CollectorMode

```
Đi tới

↓

Nhặt Item

↓

Inventory Full

↓

Storage

↓

Quay lại
```

DungeonMode

```
Đi Dungeon

↓

Đánh

↓

Chết

↓

Respawn

↓

Tiếp tục
```

AFKMode

```
Đi AFK

↓

Treo
```

CraftMode

```
Chuẩn bị nguyên liệu

↓

Craft

↓

Storage

↓

Lặp
```

Mọi Mode đều kế thừa BaseMode.

---

# 9. Engine

Engine chỉ điều phối.

Engine KHÔNG biết:

* GUI
* Inventory
* NPC
* Storage
* Collector

Engine chỉ biết:

* Current Mode
* Current State

Engine gọi:

```
mode.start()

mode.stop()

mode.pause()

mode.resume()

mode.tick()

mode.recover()
```

---

# 10. Watchdog

Watchdog chỉ phát hiện lỗi.

Không xử lý lỗi.

Ví dụ:

ConnectionWatchdog

↓

Phát hiện disconnect

↓

Emit Event

↓

RecoveryManager

↓

Engine

---

Các Watchdog:

* ConnectionWatchdog
* PlayerWatchdog
* MovementWatchdog
* GUIWatchdog
* InventoryWatchdog
* CollectorWatchdog
* EngineWatchdog

---

# 11. Recovery

RecoveryManager chịu trách nhiệm khôi phục.

Ví dụ:

Reconnect

Respawn

Resume Mode

Join SkyBlock

RecoveryManager không biết Collector.

RecoveryManager không biết Dungeon.

RecoveryManager chỉ gọi API của Mode.

---

# 12. Listener

Listener chỉ:

* cập nhật Runtime
* emit Event

Không nghiệp vụ.

Không được gọi Service.

Không được gọi Mode.

---

# 13. Discord

Discord chỉ là Controller.

Discord chỉ gọi:

```
ModeManager

↓

Mode
```

Không thao tác trực tiếp Mineflayer.

Không gọi bot.chat()

Không click GUI.

---

# 14. GUI

GUIService chỉ cung cấp API.

Ví dụ:

```
click()

shiftClick()

waitOpen()

waitClose()
```

Các GUI cụ thể:

```
SkyBlockGUI

StorageGUI

DungeonGUI

CraftGUI
```

Không hardcode slot trong GUIService.

---

# 15. Config

Không hardcode.

Toàn bộ:

* Command
* Slot
* Delay
* Timeout
* Item
* Position

đều nằm trong Config.

---

# 16. Logger

Logger thống nhất.

Level:

* trace
* debug
* info
* success
* warn
* error

Không dùng console.log().

---

# 17. Error Handling

Mọi lỗi đều đi qua ErrorHandler.

Không swallow exception.

Không catch rỗng.

---

# 18. Scheduler

Không dùng:

* setTimeout()
* setInterval()

trực tiếp.

Chỉ dùng SchedulerManager.

---

# 19. Async Rule

Toàn bộ API sử dụng Promise.

Không callback.

Không event callback nội bộ.

Chuẩn:

```
await movement.goto()

await storage.sellInventory()

await dungeon.start()
```

---

# 20. Naming Convention

Class

```
MovementService

CollectorMode

EventManager
```

Method

camelCase

Constant

UPPER_CASE

Folder

lowercase

---

# 21. Coding Rules

* CommonJS
* JavaScript
* Một class một trách nhiệm.
* Một method một nhiệm vụ.
* Không placeholder.
* Không TODO.
* Không mock.
* Có comment cho logic phức tạp.
* Có validate đầu vào.
* Có timeout cho thao tác bất đồng bộ.
* Có retry khi hợp lý.
* Không circular dependency.

---

# 22. Mode Recovery

Mỗi Mode phải tự định nghĩa recover().

Ví dụ:

CollectorMode

```
Join SkyBlock

↓

Collector

↓

Continue
```

DungeonMode

```
Respawn

↓

/d

↓

Continue
```

Engine không biết recover như thế nào.

---

# 23. Future Modes

Framework phải hỗ trợ bổ sung Mode mà không cần sửa Engine.

Ví dụ:

* BossMode
* FishingMode
* AuctionMode
* QuestMode
* CraftMode
* FarmMode
* AFKMode
* DungeonMode

Chỉ cần đăng ký với ModeManager.

---

# 24. Architecture Lock

Sau khi bắt đầu code:

Không đổi:

* Runtime Structure
* Context
* Engine
* Service API
* Mode API
* Manager API
* Dependency Rule

Mọi tính năng mới phải mở rộng thông qua:

* Mode mới
* Service mới
* Watchdog mới
* GUI Action mới

Không sửa kiến trúc hiện có.

---

# 25. Development Order

1. Core
2. Config
3. Managers
4. Services
5. Watchdog
6. Modes
7. Listeners
8. Discord
9. Engine
10. Index

---

Architecture Status

LOCKED
Version 1.0
