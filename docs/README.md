# Divortio D1 Logger Documentation

Welcome to the complete documentation for the Divortio D1 Logger. These documents provide a comprehensive overview of
the system's architecture, setup, features, and observability.

---

### Table of Contents

1. [**System Architecture**](./1-architecture.md)
    * Core Principles
    * Request Flow
    * Diagram

2. [**Setup and Deployment**](./2-setup-and-deployment.md)
    * Prerequisites
    * Resource Creation
    * Wrangler & UI Deployment

3. [**Data Schema**](./3-data-schema.md)
    * Master Schema
    * Field Descriptions
    * Data Types

4. [**Log Routing and Filtering**](./4-routing-and-filtering.md)
    * Firehose Route
    * Custom Routes
    * Configuration

5. [**The LogBatcher Durable Object**](./5-durable-object.md)
    * In-Memory Batching
    * Sharding Strategy
    * Dead-Letter Queue

6. [**Observability and Monitoring**](./6-observability.md)
    * State Snapshots
    * Debugging Failures
    * Analytics Engine

7. [**Example Log Entry**](./7-example-log-entry.md)
    * Sample JSON
    * Complete Object