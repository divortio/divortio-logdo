# 1. System Architecture

This document provides a high-level overview of the Divortio D1 Logger's architecture. The system is designed as a
high-performance, non-blocking logging service that has zero performance impact on the calling application.

---

### Core Design Principles

- **Asynchronous Processing**: The logging pipeline is entirely asynchronous, using a "fire-and-forget" model. A parent
  worker can send a log and immediately move on to its next task without waiting for a response.
- **High Throughput**: By using Durable Objects for in-memory batching, the service can handle a high volume of log
  events while minimizing the number of writes to the D1 database.
- **Resilience**: The system is designed with production hardening in mind, featuring a dead-letter queue for failed
  batches and a graceful shutdown mechanism to prevent data loss.
- **Scalability**: The sharding strategy for the Durable Objects ensures that the workload is distributed across
  multiple instances, allowing the service to scale horizontally as traffic increases.

---

### Architectural Flow

The system consists of three main components: the **Parent Worker**, the **Logging Worker**, and the **LogBatcher
Durable Object**.

1. **Parent Worker**: This is any user-facing Cloudflare Worker that needs to log requests. It uses a **Service
   Binding** to communicate with the logging service.
2. **Logging Worker (`src/worker.mjs`)**: This is the main entrypoint for the service. It receives the `Request` object
   from the parent worker, processes it into a structured log object, and forwards it to the appropriate Durable Object.
3. **LogBatcher Durable Object (`src/logDO.mjs`)**: This is the core of the system. It receives log objects, batches
   them in memory, and periodically writes them to a Cloudflare D1 database. It also handles schema migrations, data
   retention policies, and error handling.

### Request Flow Diagram

The following diagram illustrates the flow of a log event through the system:

```mermaid
graph TD
    subgraph Parent Application
        A[Client Request] --> B{Parent Worker};
    end

    subgraph Logging Service
        B -- "env.LOGGER.fetch(request)" --> C(Logging Worker);
        C -- "Processes & Enriches Log" --> D(LogBatcher Durable Object);
        D -- "Batches Logs in Memory" --> E(Cloudflare D1 Database);
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#ccf,stroke:#333,stroke-width:2px