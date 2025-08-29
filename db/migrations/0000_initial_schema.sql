-- Migration number: 0000
-- Created at: 2025-08-22 03:08:00
-- Description: Comprehensive schema for the RequestLogs table.

DROP TABLE IF EXISTS requestlogs;

CREATE TABLE requestlogs
    (
        -- Core & Session Identifiers
        logid                  TEXT
            PRIMARY KEY,
        rayid                  TEXT,
        fpid                   TEXT,
        devicehash             TEXT,
        connectionhash         TEXT,
        tlshash                TEXT,

        -- Timestamps & Performance
        requesttime            INTEGER,
        receivedat             DATETIME NOT NULL,
        processedat            DATETIME,
        processingdurationms   INTEGER,
        clienttcprtt           INTEGER,

        -- A/B Testing & User Bucketing
        sample10               INTEGER,
        sample100              INTEGER,

        -- Request Details
        requesturl             TEXT     NOT NULL,
        requestmethod          TEXT     NOT NULL,
        requestheaders         TEXT,
        requestbody            TEXT,
        requestmimetype        TEXT,
        urldomain              TEXT,
        urlpath                TEXT,
        urlquery               TEXT,

        -- Sizing Metrics
        headerbytes            INTEGER,
        bodybytes              INTEGER,
        bodytruncated          BOOLEAN  NOT NULL,

        -- Client & Connection Details
        clientip               TEXT,
        clientdevicetype       TEXT,
        clientcookies          TEXT,
        cid                    TEXT,
        sid                    TEXT,
        eid                    TEXT,
        uid                    TEXT,
        emid                   TEXT,
        ema                    TEXT,

        -- Cloudflare 'cf' Object Properties
        cfasn                  INTEGER,
        cfasorganization       TEXT,
        cfbotmanagement        TEXT,
        cfclientacceptencoding TEXT,
        cfcolo                 TEXT,
        cfcountry              TEXT,
        cfcity                 TEXT,
        cfcontinent            TEXT,
        cfhttpprotocol         TEXT,
        cflatitude             TEXT,
        cflongitude            TEXT,
        cfpostalcode           TEXT,
        cfregion               TEXT,
        cfregioncode           TEXT,
        cftimezone             TEXT,
        cftlscipher            TEXT,
        cftlsversion           TEXT,
        cftlsclientauth        TEXT,
        geoid                  TEXT,
        threatscore            INTEGER,
        ja3hash                TEXT,
        verifiedbot            BOOLEAN,

        -- Worker Environment
        workerenv              TEXT,
        data                   TEXT
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_receivedat ON requestlogs (receivedat);
CREATE INDEX IF NOT EXISTS idx_rayid ON requestlogs (rayid);
CREATE INDEX IF NOT EXISTS idx_fpid ON requestlogs (fpid);
CREATE INDEX IF NOT EXISTS idx_eID ON requestlogs (eid);
CREATE INDEX IF NOT EXISTS idx_geoid ON requestlogs (geoid);