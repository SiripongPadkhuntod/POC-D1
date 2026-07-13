# POC-D1

ระบบ multi-camera / multi-audio บน Ant Media D1 แบ่งเป็น service ชัดเจน โดย media วิ่งตรงระหว่าง browser กับ Ant Media และ Source Registry เก็บเฉพาะ metadata/heartbeat

Local stack นี้รวม Ant Media Server Enterprise จริงไว้ใน Docker Compose แล้ว

## Repository structure

```text
POC-D1/
├── services/
│   ├── frontend/                 # Next.js UI และ browser WebRTC
│   │   ├── src/app/              # routes และ page composition
│   │   ├── src/components/       # reusable UI / media components
│   │   ├── src/features/         # feature API และ feature types
│   │   └── src/shared/           # config และ shared utilities
│   └── source-registry/          # Go API service
│       ├── cmd/api/              # composition root / process startup
│       └── internal/
│           ├── domain/           # Source entity และ business validation
│           ├── application/      # use cases และ repository port
│           ├── infrastructure/   # Redis repository adapter
│           ├── transport/http/   # HTTP API adapter และ middleware
│           └── config/           # environment configuration
├── Caddyfile                    # edge routing
├── docker-compose.yml           # local service orchestration
└── Makefile                     # project-level commands
```

แต่ละ service มี `Dockerfile`, dependency manifest และ build command ของตัวเอง ไม่มี source code ของ frontend/backend ปนอยู่ที่ root

## Architecture

```text
Browser
  ├── WebRTC media ──────────────────────────────> Ant Media D1 (local container)
  └── /api/sources -> Caddy -> Source Registry -> Redis

Source Registry dependency direction:
transport/http -> application -> domain
infrastructure/redis -> application port + domain
cmd/api -> ประกอบ adapters และ start process
```

- `frontend` รับผิดชอบ UI, camera/microphone publishing, Studio playback และ audio mixing
- `source-registry` รับผิดชอบ register/list/delete source และ TTL เท่านั้น
- `redis` เป็น storage implementation ของ Source Repository
- `caddy` เป็น public gateway: `/api/*` ไป Source Registry และ path อื่นไป Frontend

## API contract

- `GET /api/sources?studioId=<studio-id>` รายการ source ที่ heartbeat อยู่
- `POST /api/sources` register/heartbeat source
- `DELETE /api/sources?studioId=<studio-id>&id=<stream-id>` unregister source
- `GET /healthz` readiness ของ Source Registry และ Redis

Source key มี TTL 15 วินาที Studio ID รองรับตัวอักษร ตัวเลข `_` และ `-`

## Run all services

คัดลอก environment template แล้วใส่ Ant Media Enterprise license key:

```bash
cp .env.example .env
```

บน Apple Silicon ค่าเริ่มต้นจะรัน image `linux/amd64` ผ่าน Docker emulation จากนั้นเริ่มทั้ง stack:

```bash
make up
```

- Ant Media dashboard: `http://localhost:5080`
- Ant Media publish sample: `http://localhost:5080/live`
- Frontend diagnostics: `http://localhost:3100`
- Source Registry health: `http://localhost:8085/healthz`
- LAN HTTPS gateway: `https://192.168.0.188:3543`
- Loopback HTTP gateway: `http://localhost:3544` (สำหรับ browser ที่ไม่ trust local CA)
- Local CA certificate: `http://192.168.0.188:8181/root.crt`

บน Mac ที่รัน Docker เองให้ใช้ `https://localhost:3543` เป็นหลัก ส่วน URL แบบ LAN IP ใช้สำหรับเครื่อง/โทรศัพท์เครื่องอื่นในวง LAN และต้องอนุญาต Camera, Microphone และ Local network ให้ origin นั้นใน browser ก่อน Frontend จะเปลี่ยน hostname ของ WebRTC WebSocket ให้ตรงกับ hostname ของหน้าเว็บอัตโนมัติ

ตั้งค่าได้ก่อน build:

```bash
ANT_MEDIA_LICENSE_KEY=your-license-key \
ANT_MEDIA_WEBSOCKET_URL=wss://example.com:3543/live/websocket \
ANT_MEDIA_PROGRAM_STREAM_ID=my-program \
POC_D1_LAN_IP=192.168.0.188 \
docker compose up -d --build
```

Compose เปิด TCP `5080`, `5443`, `1935` และ UDP `62000-62100` ให้ Ant Media แอป `live` ช่วง WebRTC แบบย่อเหมาะกับ local POC และหลีกเลี่ยง dynamic ports ของ Microsoft Teams บน macOS Caddy proxy `/live/*` ไปยัง Ant Media เพื่อให้ WebSocket ทำงานจากหน้า HTTPS เดียวกัน ดู logเฉพาะ media server ด้วย `make logs-antmedia`

Local smoke test ใช้ stock entrypoint ของ official Ant Media image เพื่อให้ runtime บน amd64 emulation เริ่มทำงานตามค่าเริ่มต้นของ image โดย service `antmedia-init` จะตั้งค่า ICE address, UDP range และ license จาก environment ให้ runtime ก่อนเริ่ม server ทุกครั้ง

`ANT_MEDIA_SERVER_NAME` ต้องเป็น LAN IP ของ Mac และ runtime `start.sh` จะประกาศค่านี้ใน ICE candidates แทน private IP ของ Docker การตั้งค่านี้ยังคงทำงานเมื่อสร้าง volume ใหม่

Ant Media runtime ใช้ volume `antmedia-runtime` ส่วน volume เก่า `poc-d1_antmedia-data` ถูกเก็บไว้นอก Compose เป็น backup และมี console database เดิมชื่อ `server.db.backup-20260713-1415`

## Develop services independently

Frontend:

```bash
cd services/frontend
npm install
npm run dev
```

Source Registry (ต้องมี Redis ที่เข้าถึงได้):

```bash
cd services/source-registry
REDIS_ADDR=localhost:6379 HTTP_ADDR=:8080 go run ./cmd/api
```

ตรวจทั้ง repository:

```bash
make test
```

## Usage

1. เปิด `/camera?studio=sell-01` หรือ `/microphone?studio=sell-01` และเริ่ม publish
2. เปิด `/studio?studio=sell-01` เพื่อดู source ของ Studio เดียวกัน
3. เลือก Preview แล้ว Cut เข้า Program
4. เลือกเสียงที่ต้องการ mix และเริ่ม Program ไป D1
5. เปิด `/viewer?id=sell-image` เพื่อรับชม Program จากหน้า Viewer ของ POC

หากไม่ระบุ `studio` ระบบใช้ `default` Program stream เริ่มต้นคือ `sell-image` และ Studio อื่นจะเติม Studio ID เพื่อป้องกันชื่อชนกัน
