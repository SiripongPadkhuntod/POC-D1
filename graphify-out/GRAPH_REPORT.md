# Graph Report - .  (2026-07-14)

## Corpus Check
- Corpus is ~7,705 words - fits in a single context window. You may not need a graph.

## Summary
- 232 nodes · 335 edges · 17 communities (11 shown, 6 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Studio Media Frontend
- Registry Domain Storage
- Docker Deployment Stack
- Frontend Runtime Dependencies
- TypeScript Compiler Configuration
- WebRTC Media Workflow
- Redis Registry Bootstrap
- Frontend Development Tooling
- HTTP Registry Transport
- TypeScript Project Scope
- Ant Media Initialization
- ESLint Configuration
- Next.js Root Layout
- Next.js Configuration
- Next.js Type Declarations
- Source Registry Go Module

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Source` - 10 edges
3. `NewHandler()` - 10 edges
4. `Registry` - 9 edges
5. `Handler` - 9 edges
6. `StudioPage()` - 7 edges
7. `browserWebSocketURL()` - 7 edges
8. `writeJSON()` - 7 edges
9. `memoryRepository` - 7 edges
10. `Source Registry` - 7 edges

## Surprising Connections (you probably didn't know these)
- `15-Second Source TTL` --semantically_similar_to--> `TTL-Based Offline Cleanup`  [INFERRED] [semantically similar]
  README.md → flow.md
- `Frontend` --semantically_similar_to--> `frontend Service`  [INFERRED] [semantically similar]
  README.md → docker-compose.yml
- `Source Registry` --semantically_similar_to--> `source-registry Service`  [INFERRED] [semantically similar]
  README.md → docker-compose.yml
- `Caddy Public Gateway` --semantically_similar_to--> `caddy Service`  [INFERRED] [semantically similar]
  README.md → docker-compose.yml
- `Redis Source Repository` --semantically_similar_to--> `redis Service`  [INFERRED] [semantically similar]
  README.md → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Source Registration and Discovery** — flow_registry_heartbeat, flow_caddy_gateway, flow_source_registry, flow_redis_metadata_store, flow_source_discovery [EXTRACTED 1.00]
- **Studio Program Composition** — flow_webrtc_source_players, flow_preview, flow_web_audio_mixer, flow_program_media_stream, flow_program_publisher [EXTRACTED 1.00]
- **Compose Gateway Routing Stack** — docker_compose_caddy, docker_compose_antmedia, docker_compose_frontend, docker_compose_source_registry [EXTRACTED 1.00]

## Communities (17 total, 6 thin omitted)

### Community 0 - "Studio Media Frontend"
Cohesion: 0.07
Nodes (25): AudioSetting, initialStudioID(), programStreamForStudio(), sameSourceList(), StudioPage(), StudioStatus, initialStreamID(), ViewerPage() (+17 more)

### Community 1 - "Registry Domain Storage"
Cohesion: 0.13
Nodes (18): Registry, SourceRepository, Source, memoryRepository, Mutex, Context, Time, NewRegistry() (+10 more)

### Community 2 - "Docker Deployment Stack"
Cohesion: 0.12
Nodes (25): antmedia Service, antmedia-init Service, antmedia-runtime Volume, caddy Service, caddy-config Volume, caddy-data Volume, frontend Service, POC-D1 Docker Compose Stack (+17 more)

### Community 3 - "Frontend Runtime Dependencies"
Cohesion: 0.09
Nodes (21): @antmedia/webrtc_adaptor, lucide-react, next, react, react-dom, dependencies, @antmedia/webrtc_adaptor, lucide-react (+13 more)

### Community 4 - "TypeScript Compiler Configuration"
Cohesion: 0.10
Nodes (21): dom, dom.iterable, esnext, ./src/*, compilerOptions, allowJs, esModuleInterop, incremental (+13 more)

### Community 5 - "WebRTC Media Workflow"
Cohesion: 0.13
Nodes (19): Ant Media Program Stream, Ant Media Source Streams, Caddy Gateway, Live CUT Track Replacement, Preview, Program MediaStream, Program Monitor, WebRTC Program Publisher (+11 more)

### Community 6 - "Redis Registry Bootstrap"
Cohesion: 0.20
Nodes (10): Client, Config, SourceRepository, main(), env(), Load(), Context, Duration (+2 more)

### Community 7 - "Frontend Development Tooling"
Cohesion: 0.13
Nodes (15): eslint, eslint-config-next, @eslint/eslintrc, devDependencies, eslint, eslint-config-next, @eslint/eslintrc, @types/node (+7 more)

### Community 8 - "HTTP Registry Transport"
Cohesion: 0.40
Nodes (10): HandlerFunc, Handler, Logger, Request, ResponseWriter, NewHandler(), withAccessLog(), withCORS() (+2 more)

### Community 9 - "TypeScript Project Scope"
Cohesion: 0.22
Nodes (8): .next-build/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx, exclude, include

## Knowledge Gaps
- **64 isolated node(s):** `compat`, `eslintConfig`, `nextConfig`, `name`, `version` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Source` connect `Registry Domain Storage` to `Redis Registry Bootstrap`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `NewHandler()` connect `HTTP Registry Transport` to `Registry Domain Storage`, `Redis Registry Bootstrap`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `main()` connect `Redis Registry Bootstrap` to `HTTP Registry Transport`, `Registry Domain Storage`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `NewHandler()` (e.g. with `main()` and `TestRejectsInvalidSource()`) actually correct?**
  _`NewHandler()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `compat`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Studio Media Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.07149758454106281 - nodes in this community are weakly interconnected._
- **Should `Registry Domain Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.12698412698412698 - nodes in this community are weakly interconnected._