# 5. The LogBatcher Durable Object

The `LogBatcher` is the core of the logging service. It is a Durable Object responsible for receiving, batching, and
persisting log data to the D1 database. Its design ensures high throughput and resilience, making it the central
component of the entire architecture.

---

### Key Responsibilities

The `LogBatcher` handles several critical tasks:

#### A. In-Memory Batching

To avoid overwhelming the D1 database with a high volume of individual writes, the `LogBatcher` collects incoming log
entries in an in-memory `Map`. These batches are then written to D1 under one of two conditions:

1. **Batch Size**: A batch is written immediately when it reaches the `MAX_BATCH_SIZE` defined in `wrangler.toml`.
2. **Time Interval**: A recurring `alarm` is set to flush all pending batches at the interval defined
   by `BATCH_INTERVAL_MS`.

This batching strategy dramatically improves performance by converting thousands of small, individual writes into a few
large, efficient batch operations.

#### B. Sharding Strategy

Instead of using a single Durable Object, the system employs a sharding strategy to distribute the load across
multiple `LogBatcher` instances. A unique `shardId` is generated for each log based on the **Cloudflare colo** and a **
time bucket**.

For example, a `shardId` might look like this: `EWR-28749445`.

This ensures that all logs from the same geographic region within a given time window (e.g., one minute) are sent to the
same Durable Object instance, maximizing batching efficiency while scaling horizontally.

#### C. Schema Management

The `LogBatcher` is responsible for automatically managing the database schema. When it initializes, it compares the
schema hash of a given log route with a stored hash. If they do not match, it automatically applies the
necessary `CREATE TABLE` or `ALTER TABLE` statements. This allows for seamless schema evolution with zero manual
intervention.

#### D. Data Pruning and Retention

For routes with a `retentionDays` policy, the `LogBatcher` handles data pruning. Cron-triggered tasks call
the `runRetentionCheck` method, which deletes any records older than the specified retention period, ensuring that data
storage does not grow indefinitely.

#### E. Dead-Letter Queue

If a batch repeatedly fails to write to D1 (e.g., due to a malformed log entry), the `LogBatcher` will stop retrying
after a set number of attempts. To prevent data loss, it moves the failed batch to a dedicated **dead-letter
queue** (`LOGDO_DEAD_LETTER` KV namespace) for later inspection and analysis. This prevents a single "poison message"
from blocking the entire logging pipeline.

#### F. Graceful Shutdown

The `LogBatcher` implements the `destructor()` method. This is a lifecycle hook called by the Workers runtime just
before a Durable Object is shut down (for example, during a new deployment). The `destructor` performs a final,
best-effort flush of any logs still held in memory, minimizing the risk of data loss during updates.

---