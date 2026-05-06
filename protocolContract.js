'use strict';

/**
 * Canonical STOMP/WebSocket contract for stomp-fixed-income-server.
 * Refactors must preserve these frames, destinations, regexes, and completion text
 * so existing clients (stompjs, raw ws) require no code changes.
 *
 * @see STOMP_CLIENT_USAGE.md
 */

const STOMP_VERSION = '1.2';
const SERVER_NAME = 'stomp-fixed-income/1.0.0';
const HEART_BEAT = '0,0';

const DESTINATION_ERRORS = '/errors';

/** Client-specific trigger: /snapshot/{positions|trades}/{clientId}/{rate}[/{batchSize}] */
const TRIGGER_CLIENT_SPECIFIC =
    /^\/snapshot\/(positions|trades)\/([^/]+)\/(\d+)(?:\/(\d+))?$/;

/** Legacy trigger: /snapshot/{positions|trades}/{rate}[/{batchSize}] */
const TRIGGER_LEGACY =
    /^\/snapshot\/(positions|trades)\/(\d+)(?:\/(\d+))?$/;

/** Subscription path /snapshot/{positions|trades}/{clientId} (no rate segment) */
const CLIENT_TOPIC_REGEX = /^\/snapshot\/(positions|trades)\/[^/]+$/;

const SNAPSHOT_BATCH_INTERVAL_MS = 10;

const HEADER = {
    MESSAGE_TYPE: 'message-type',
    CONTENT_TYPE: 'content-type',
    BATCH_NUMBER: 'batch-number',
    CLIENT_ID: 'client-id',
    UPDATE_NUMBER: 'update-number',
    SUBSCRIPTION: 'subscription',
    MESSAGE_ID: 'message-id',
    DESTINATION: 'destination',
};

const MESSAGE_TYPE = {
    SNAPSHOT: 'snapshot',
    SNAPSHOT_COMPLETE: 'snapshot-complete',
    LIVE_UPDATE: 'live-update',
};

function connectedHeaders(sessionId) {
    return {
        version: STOMP_VERSION,
        session: sessionId,
        server: SERVER_NAME,
        'heart-beat': HEART_BEAT,
    };
}

function genericSubscriptionDestination(dataType) {
    return `/snapshot/${dataType}`;
}

function clientSubscriptionDestination(dataType, clientId) {
    return `/snapshot/${dataType}/${clientId}`;
}

function defaultBatchSize(rate) {
    return Math.max(1, Math.floor(rate / 10));
}

/** Legacy completion body — clients detect phase via body.startsWith('Success') */
function legacySnapshotCompleteText(totalRecords, dataType) {
    return `Success: All ${totalRecords} ${dataType} snapshot records delivered. Starting live updates...`;
}

/** Client-scoped completion body (same Success prefix for parsers) */
function clientSnapshotCompleteText(totalRecords, dataType, clientId) {
    return `Success: All ${totalRecords} ${dataType} records delivered to client '${clientId}'. Starting live updates...`;
}

module.exports = {
    STOMP_VERSION,
    SERVER_NAME,
    HEART_BEAT,
    DESTINATION_ERRORS,
    TRIGGER_CLIENT_SPECIFIC,
    TRIGGER_LEGACY,
    CLIENT_TOPIC_REGEX,
    SNAPSHOT_BATCH_INTERVAL_MS,
    HEADER,
    MESSAGE_TYPE,
    connectedHeaders,
    genericSubscriptionDestination,
    clientSubscriptionDestination,
    defaultBatchSize,
    legacySnapshotCompleteText,
    clientSnapshotCompleteText,
};
