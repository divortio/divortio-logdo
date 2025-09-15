# 6. Observability and Monitoring

The Divortio D1 Logger is designed for production use and includes several features to help you monitor its health,
debug issues, and gain insights into its performance. These features are primarily available through two KV namespaces
and the Workers Analytics Engine.

---

### A. Real-Time State Snapshots (`LOGDO_STATE`)

The `LOGDO_STATE` KV namespace provides a real-time view into the state of your `LogBatcher` Durable Objects.

- **Active Instances**: Keys prefixed with `active_do_` represent a currently active Durable Object instance. These keys
  have a short TTL, so they will automatically disappear if an instance becomes inactive.
- **Instance State**: Keys prefixed with `state_` contain a snapshot of a specific DO's in-memory state, including the
  number of pending logs and the size of each batch.
- **Recent Events**: The `last_firehose_event` key contains the single most recent log that was successfully written to
  the firehose table. The `last_firehose_batch` key contains the entire last batch.
- **Failures**: The `last_failed_batch` key will be populated if a D1 write fails, containing the batch and the error
  message.

You can inspect these values directly in the Cloudflare Dashboard by navigating to **Workers & Pages** > **KV** and
selecting the `LOGDO_STATE` namespace.

---

### B. Dead-Letter Queue (`LOGDO_DEAD_LETTER`)

If a batch of logs fails to write to D1 after multiple retries, it is moved to the `LOGDO_DEAD_LETTER` KV namespace.
This prevents a single malformed log from blocking the entire pipeline while ensuring no data is lost.

Each key in this namespace will be prefixed with `deadletter_` and will contain a JSON object with:

- The batch of logs that failed.
- The final error message from D1.
- The ID of the Durable Object that processed the batch.
- A timestamp.

Periodically reviewing this namespace is recommended to identify and resolve any persistent data or schema issues.

---

### C. Workers Analytics Engine Metrics

The service sends detailed operational metrics to three different Analytics Engine datasets, which you can query from
the Cloudflare Dashboard.

1. **`logdo_batch_writes`**:
    * **Description**: Tracks the performance and success rate of batch writes to D1.
    * **Key Metrics**: `batchSize`, `durationMs`, `writeCount`.
    * **Dimensions**: Indexed by `tableName`, with `outcome` (success/failure) and `colo` as blobs.

2. **`logdo_schema_migrations`**:
    * **Description**: Logs every time a schema change is detected and applied.
    * **Key Metrics**: `durationMs`, `migrationCount`.
    * **Dimensions**: Indexed by `tableName`, with `migrationType` (create/alter) and `schemaHash` as blobs.

3. **`logdo_data_pruning`**:
    * **Description**: Tracks the data retention and pruning operations.
    * **Key Metrics**: `rowsDeleted`, `durationMs`, `pruneCount`.
    * **Dimensions**: Indexed by `tableName`, with `outcome` (success/failure) as a blob.

To view these metrics, navigate to **Workers & Pages**, select your worker, and go to the **Analytics Engine** tab. Here
you can build custom dashboards to visualize the health and performance of your logging service over time.

---