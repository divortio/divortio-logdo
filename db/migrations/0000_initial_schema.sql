-- Migration number: 0000
-- Created at: 2025-08-22 03:08:00
-- Description: Initial schema for the RequestLogs table.

DROP TABLE IF EXISTS requestlogs;

CREATE TABLE requestlogs
    (
        -- Core & Session Identifiers
        logid                  TEXT
            PRIMARY KEY,
        rayid                  TEXT,
        fpid                   TEXT,
        devicehash             TEXT,
        sessionhash            TEXT,
        tlshash                TEXT,
        serverid               TEXT,

        -- Timestamps & Performance
        requesttime            INTEGER,
        receivedat             DATETIME NOT NULL,
        processedat            DATETIME NOT NULL,
        queuetime              INTEGER,
        processingdurationms   INTEGER,
        clienttcprtt           INTEGER,

        -- A/B Testing & User Bucketing
        sessionbin10           INTEGER,
        sessionbin100          INTEGER,

        -- Request Details
        requesturl             TEXT     NOT NULL,
        requestmethod          TEXT     NOT NULL,
        requestheaders         TEXT     NOT NULL, -- Stored as a JSON string
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
        clientcookies          TEXT,              -- Stored as a JSON string
        cid                    TEXT,
        sid                    TEXT,
        eid                    TEXT,

        -- Cloudflare 'cf' Object Properties
        cfasn                  INTEGER,
        cfasorganization       TEXT,
        cfbotmanagement        TEXT,              -- Stored as a JSON string
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
        cftlsclientauth        TEXT,              -- Stored as a JSON string
        geoid                  TEXT,

        -- Ruleset Engine Fields
        threatscore            INTEGER,
        threatcategory         TEXT,
        ja3hash                TEXT,
        verifiedbot            BOOLEAN,
        wafscore               INTEGER,
        edgeserverip           TEXT,
        edgeserverport         INTEGER,
        clientport             INTEGER,
        zonename               TEXT,

        -- Worker Environment
        workerenv              TEXT,              -- Stored as a JSON string
        data                   TEXT
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_receivedat ON requestlogs (receivedat);
CREATE INDEX IF NOT EXISTS idx_rayid ON requestlogs (rayid);
CREATE INDEX IF NOT EXISTS idx_fpid ON requestlogs (fpid);
CREATE INDEX IF NOT EXISTS idx_devicehash ON requestlogs (devicehash);
CREATE INDEX IF NOT EXISTS idx_sessionhash ON requestlogs (sessionhash);
CREATE INDEX IF NOT EXISTS idx_geoid ON requestlogs (geoid);
CREATE INDEX IF NOT EXISTS idx_serverid ON requestlogs (serverid);