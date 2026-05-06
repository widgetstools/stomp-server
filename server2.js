const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const mongoDataAccess = require('./mongoDataAccess');
const protocol = require('./protocolContract');

// Load environment variables
require('dotenv').config({ path: './config.env' });

// Configuration
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_LOCAL_DATA = process.env.USE_LOCAL_DATA === 'true';

// Load data from MongoDB with local fallback
let positions = [];
let trades = [];

async function loadDataFromLocalFiles() {
    try {
        console.log('🔄 Loading data from local JSON files...');
        
        const positionsPath = path.join(__dirname, 'data', 'positions.json');
        const tradesPath = path.join(__dirname, 'data', 'trades.json');
        
        // Check if files exist
        if (!fs.existsSync(positionsPath) || !fs.existsSync(tradesPath)) {
            throw new Error('Local data files not found. Run "npm run generate-data" first.');
        }
        
        // Load positions
        const positionsData = fs.readFileSync(positionsPath, 'utf-8');
        positions = JSON.parse(positionsData);
        
        // Load trades  
        const tradesData = fs.readFileSync(tradesPath, 'utf-8');
        trades = JSON.parse(tradesData);
        
        console.log(`✅ Loaded ${positions.length} positions and ${trades.length} trades from local files`);
        console.log(`📁 Data source: Local JSON files`);
        
    } catch (error) {
        console.error('❌ Error loading data from local files:', error);
        throw error;
    }
}

async function loadDataFromMongoDB() {
    try {
        console.log('🔄 Loading data from MongoDB...');
        positions = await mongoDataAccess.getAllPositions();
        trades = await mongoDataAccess.getAllTrades();
        console.log(`✅ Loaded ${positions.length} positions and ${trades.length} trades from MongoDB`);
        console.log(`☁️ Data source: MongoDB Atlas`);
    } catch (error) {
        console.error('❌ Error loading data from MongoDB:', error);
        console.log('⚠️ Attempting to fall back to local JSON files...');
        
        try {
            await loadDataFromLocalFiles();
            console.log('✅ Successfully loaded data from local fallback');
        } catch (localError) {
            console.error('❌ Local fallback also failed:', localError);
            console.log('');
            console.log('🔧 To fix this issue:');
            console.log('  1. For MongoDB: Run "node migrateToMongoDB.js" to migrate data');
            console.log('  2. For local files: Run "npm run generate-data" to create local data');
            console.log('  3. Or check your MongoDB connection in config.env');
            process.exit(1);
        }
    }
}

async function loadData() {
    if (USE_LOCAL_DATA) {
        console.log('🏠 Forced local data loading (USE_LOCAL_DATA=true)');
        await loadDataFromLocalFiles();
    } else {
        await loadDataFromMongoDB();
    }
}

// Update dates to today
function updateDateToToday(record) {
    const today = moment().format('YYYY-MM-DD');
    const now = new Date().toISOString();
    
    const updated = JSON.parse(JSON.stringify(record));
    
    if (updated.asOfDate) updated.asOfDate = now;
    if (updated.tradeDate) updated.tradeDate = now;
    if (updated.metadata && updated.metadata.modifiedDate) {
        updated.metadata.modifiedDate = now;
    }
    if (updated.reporting && updated.reporting.reportingDate) {
        updated.reporting.reportingDate = today;
    }
    if (updated.marketData && updated.marketData.lastTradeTime) {
        updated.marketData.lastTradeTime = now;
    }
    if (updated.execution && updated.execution.executionTime) {
        updated.execution.executionTime = now;
    }
    
    return updated;
}

// Helper to generate updates
function generatePositionUpdate(basePosition) {
    const update = JSON.parse(JSON.stringify(basePosition));
    
    // Ensure positionId is preserved
    if (!update.positionId || update.positionId !== basePosition.positionId) {
        console.error(`❌ Position ID lost during cloning! Original: ${basePosition.positionId}, Clone: ${update.positionId}`);
        update.positionId = basePosition.positionId;
    }
    
    // Price updates
    update.currentPrice = update.currentPrice * (1 + (Math.random() - 0.5) * 0.02);
    update.marketValue = update.notionalAmount * update.currentPrice / 100;
    update.totalValue = update.marketValue + update.accruedInterest;
    
    // PnL updates
    update.pnl = Math.round(update.marketValue - update.bookValue);
    update.unrealizedPnl = Math.round(update.pnl * 0.8);
    update.realizedPnl = update.realizedPnl || 0;
    update.dailyPnl = Math.round((Math.random() - 0.5) * Math.abs(update.pnl) * 0.1);
    update.mtdPnl = Math.round(update.mtdPnl + update.dailyPnl);
    update.ytdPnl = Math.round(update.ytdPnl + update.dailyPnl);
    
    // Risk metrics updates
    if (update.riskMetrics) {
        update.riskMetrics.var95 = Math.round(update.riskMetrics.var95 * (1 + (Math.random() - 0.5) * 0.1));
        update.riskMetrics.var99 = Math.round(update.riskMetrics.var99 * (1 + (Math.random() - 0.5) * 0.1));
        update.riskMetrics.expectedShortfall = Math.round(update.riskMetrics.var99 * 1.2);
        update.riskMetrics.sharpeRatio = ((update.pnl / update.notionalAmount) / 0.16) * 252;
    }
    
    // Greeks and sensitivities
    update.dv01 = update.dv01 * (1 + (Math.random() - 0.5) * 0.05);
    update.pv01 = update.pv01 * (1 + (Math.random() - 0.5) * 0.05);
    update.cs01 = update.cs01 * (1 + (Math.random() - 0.5) * 0.05);
    update.convexity = update.convexity * (1 + (Math.random() - 0.5) * 0.03);
    
    // Spread updates
    update.spread = Math.round(update.spread + (Math.random() - 0.5) * 10);
    update.assetSwapSpread = Math.round(update.assetSwapSpread + (Math.random() - 0.5) * 10);
    update.zSpread = Math.round(update.zSpread + (Math.random() - 0.5) * 10);
    update.oas = Math.round(update.oas + (Math.random() - 0.5) * 10);
    
    // Market data updates
    if (update.marketData) {
        update.marketData.lastTradeTime = new Date().toISOString();
        update.marketData.lastTradePrice = update.currentPrice;
        update.marketData.bidPrice = update.currentPrice - Math.random() * 0.5;
        update.marketData.askPrice = update.currentPrice + Math.random() * 0.5;
        update.marketData.midPrice = (update.marketData.bidPrice + update.marketData.askPrice) / 2;
        update.marketData.volume = Math.round(update.marketData.volume * (0.8 + Math.random() * 0.4));
    }
    
    // Analytics updates
    if (update.analytics && update.analytics.greeks) {
        update.analytics.greeks.delta = update.analytics.greeks.delta * (1 + (Math.random() - 0.5) * 0.1);
        update.analytics.greeks.gamma = Math.abs(update.analytics.greeks.gamma * (1 + (Math.random() - 0.5) * 0.2));
        update.analytics.greeks.theta = -Math.abs(update.analytics.greeks.theta * (1 + (Math.random() - 0.5) * 0.1));
        update.analytics.greeks.vega = update.analytics.greeks.vega * (1 + (Math.random() - 0.5) * 0.15);
        update.analytics.greeks.rho = update.analytics.greeks.rho * (1 + (Math.random() - 0.5) * 0.1);
    }
    
    // Scenario analysis
    if (update.analytics && update.analytics.scenarioAnalysis) {
        const pnlChange = update.pnl - basePosition.pnl;
        update.analytics.scenarioAnalysis.parallelShiftUp100 = Math.round(-Math.abs(update.dv01) * 100);
        update.analytics.scenarioAnalysis.parallelShiftDown100 = Math.round(Math.abs(update.dv01) * 100);
        update.analytics.scenarioAnalysis.steepening50 = Math.round(pnlChange * (Math.random() - 0.5) * 2);
        update.analytics.scenarioAnalysis.flattening50 = Math.round(pnlChange * (Math.random() - 0.5) * 2);
    }
    
    // Liquidity metrics
    if (update.liquidity) {
        update.liquidity.bidAskSpread = Math.abs(update.marketData.askPrice - update.marketData.bidPrice);
        update.liquidity.liquidityScore = Math.max(1, Math.min(10, update.liquidity.liquidityScore + (Math.random() - 0.5) * 2));
        update.liquidity.marketDepth = Math.round(update.liquidity.marketDepth * (0.8 + Math.random() * 0.4));
    }
    
    // Performance metrics
    if (update.performance) {
        const dailyReturn = update.dailyPnl / update.notionalAmount;
        update.performance.dailyReturn = dailyReturn * 100;
        update.performance.mtdReturn = update.mtdPnl / update.notionalAmount * 100;
        update.performance.ytdReturn = update.ytdPnl / update.notionalAmount * 100;
    }
    
    // Compliance metrics
    if (update.compliance) {
        update.compliance.regulatoryCapital = Math.round(update.marketValue * 0.08);
        update.compliance.rwa = Math.round(update.marketValue * update.riskMetrics.var95 / update.notionalAmount);
        update.compliance.concentrationLimit = Math.abs(update.marketValue / 1000000000 * 100);
        update.compliance.breachStatus = update.compliance.concentrationLimit > 95;
    }
    
    // Update timestamps
    if (update.metadata) {
        update.metadata.modifiedDate = new Date().toISOString();
    }
    
    return updateDateToToday(update);
}

function generateTradeUpdate(baseTrade) {
    const update = JSON.parse(JSON.stringify(baseTrade));
    
    // Keep the same tradeId - this is an update to existing trade
    // update.tradeId stays the same
    
    // Update market data that affects PnL
    const currentMarketPrice = baseTrade.price * (1 + (Math.random() - 0.5) * 0.02);
    const currentYield = baseTrade.yield * (1 + (Math.random() - 0.5) * 0.02);
    
    // Calculate PnL based on side and current market price
    const priceMovement = currentMarketPrice - update.price;
    const positionMultiplier = update.side === 'BUY' ? 1 : -1;
    
    // Update PnL values
    if (update.analytics && update.analytics.pnl) {
        // For trades, unrealized PnL changes with market price
        update.analytics.pnl.unrealizedPnl = Math.round(
            update.quantity * 1000 * priceMovement * positionMultiplier
        );
        update.analytics.pnl.tradePnl = Math.round(
            update.analytics.pnl.realizedPnl + update.analytics.pnl.unrealizedPnl
        );
        update.analytics.pnl.dayOnePnl = Math.round(
            (Math.random() - 0.5) * Math.abs(update.analytics.pnl.unrealizedPnl) * 0.1
        );
    }
    
    // Update market data
    if (update.marketData) {
        update.marketData.bidPriceAtExecution = currentMarketPrice - Math.random() * 0.5;
        update.marketData.askPriceAtExecution = currentMarketPrice + Math.random() * 0.5;
        update.marketData.midPriceAtExecution = currentMarketPrice;
        update.marketData.vwap = currentMarketPrice + (Math.random() - 0.5) * 0.2;
        update.marketData.marketVolume = Math.round(update.marketData.marketVolume * (0.8 + Math.random() * 0.4));
    }
    
    // Update pricing info
    if (update.pricing) {
        update.pricing.markupMarkdown = (currentMarketPrice - update.price) * positionMultiplier;
        update.pricing.benchmarkPrice = currentMarketPrice - (Math.random() - 0.5) * 0.1;
        update.pricing.slippage = (update.pricing.executedPrice - update.pricing.benchmarkPrice) / update.pricing.benchmarkPrice * 10000; // bps
    }
    
    // Update risk metrics that change with market
    if (update.riskMetrics) {
        update.riskMetrics.var = Math.round(update.riskMetrics.var * (1 + (Math.random() - 0.5) * 0.1));
        update.riskMetrics.creditExposure = Math.round(
            Math.abs(update.analytics.pnl.unrealizedPnl) * 0.1
        );
        update.riskMetrics.dv01 = update.riskMetrics.dv01 * (1 + (Math.random() - 0.5) * 0.05);
        update.riskMetrics.duration = update.riskMetrics.duration * (1 + (Math.random() - 0.5) * 0.02);
        update.riskMetrics.convexity = update.riskMetrics.convexity * (1 + (Math.random() - 0.5) * 0.03);
    }
    
    // Update TCA metrics
    if (update.analytics && update.analytics.tca) {
        update.analytics.tca.implementationShortfall = Math.round((currentMarketPrice - update.analytics.tca.arrivalPrice) * positionMultiplier * 10000); // bps
        update.analytics.tca.marketImpact = Math.round((Math.random() - 0.5) * 50);
        update.analytics.tca.timingCost = Math.round((Math.random() - 0.5) * 20);
        update.analytics.tca.participationRate = Math.min(100, Math.max(0, update.analytics.tca.participationRate + (Math.random() - 0.5) * 10));
    }
    
    // Update spread and yield
    update.spread = Math.round(update.spread + (Math.random() - 0.5) * 10);
    update.yield = currentYield;
    
    // Update settlement status
    if (update.settlement) {
        const now = new Date();
        const settlementDate = new Date(update.settlementDate);
        if (now >= settlementDate && update.status !== 'SETTLED') {
            update.status = 'SETTLED';
            update.settlement.settlementStatus = 'Settled';
        }
    }
    
    // Update fees based on market movement
    if (update.fees) {
        const notionalChange = Math.abs(priceMovement * update.quantity * 1000 / 100);
        update.fees.marketImpactCost = Math.round(notionalChange * 0.0001); // 1bp of notional change
        update.fees.totalFees = update.fees.brokerCommission + update.fees.exchangeFee + 
                               update.fees.clearingFee + update.fees.settlementFee + 
                               update.fees.regulatoryFee + update.fees.marketImpactCost;
    }
    
    // Update collateral requirements
    if (update.collateral) {
        update.collateral.marginRequirement = Math.round(Math.abs(update.analytics.pnl.unrealizedPnl) * 0.1);
        update.collateral.collateralAmount = Math.round(update.collateral.marginRequirement * 1.2);
    }
    
    // Update compliance status
    if (update.compliance) {
        update.compliance.bestExecution = Math.abs(priceMovement) < 0.5; // within 50bps
        update.compliance.postTradeChecks = update.analytics.pnl.unrealizedPnl > -100000 ? 'Passed' : 'Warning';
    }
    
    // Update reporting
    if (update.reporting) {
        update.reporting.reportingTimestamp = new Date().toISOString();
        update.reporting.lastUpdateTime = new Date().toISOString();
    }
    
    // Update modification timestamp
    if (update.lifecycle) {
        update.lifecycle.modifiedDate = new Date().toISOString();
        if (!update.lifecycle.lastPriceUpdateTime) {
            update.lifecycle.lastPriceUpdateTime = new Date().toISOString();
        }
    }
    
    // Update metadata
    if (update.metadata) {
        update.metadata.lastMarketPrice = currentMarketPrice;
        update.metadata.lastUpdateTime = new Date().toISOString();
        update.metadata.priceChangePercent = (priceMovement / update.price) * 100;
    }
    
    return updateDateToToday(update);
}

// WebSocket server (will be attached to HTTP server)

// Client management - enhanced to track client-specific data streams
const clients = new Map();
const clientDataStreams = new Map(); // Track active data streams per client

// STOMP protocol implementation - Enhanced
class StompConnection {
    constructor(ws, id) {
        this.ws = ws;
        this.id = id;
        this.subscriptions = new Map();
        this.sessionId = `session-${id}`;
        this.connected = false;
        this.liveUpdateIntervals = new Map(); // Track intervals per client-specific topic
    }
    
    send(command, headers = {}, body = '') {
        let frame = `${command}\n`;
        Object.entries(headers).forEach(([key, value]) => {
            frame += `${key}:${value}\n`;
        });
        frame += '\n';
        if (body) {
            frame += body;
        }
        frame += '\0';
        
        try {
            this.ws.send(frame);
        } catch (error) {
            console.error(`Error sending frame to ${this.id}:`, error);
        }
    }
    
    handleFrame(frame) {
        const lines = frame.split('\n');
        const command = lines[0];
        const headers = {};
        let bodyStart = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '') {
                bodyStart = i + 1;
                break;
            }
            const [key, ...valueParts] = lines[i].split(':');
            if (key) {
                headers[key] = valueParts.join(':');
            }
        }
        
        const body = lines.slice(bodyStart).join('\n').replace(/\0$/, '');
        
        console.log(`Received ${command} from ${this.id}`);
        
        switch (command) {
            case 'CONNECT':
            case 'STOMP':
                this.handleConnect(headers);
                break;
            case 'SUBSCRIBE':
                this.handleSubscribe(headers);
                break;
            case 'SEND':
                this.handleSend(headers, body);
                break;
            case 'UNSUBSCRIBE':
                this.handleUnsubscribe(headers);
                break;
            case 'DISCONNECT':
                this.handleDisconnect();
                break;
        }
    }
    
    handleConnect(headers) {
        this.connected = true;
        this.send('CONNECTED', protocol.connectedHeaders(this.sessionId));
        console.log(`Client ${this.id} connected`);
    }
    
    handleSubscribe(headers) {
        const destination = headers.destination;
        const id = headers.id || `sub-${Date.now()}`;
        
        console.log(`Client ${this.id} subscribing to ${destination}`);
        
        this.subscriptions.set(id, {
            destination,
            id,
            ack: headers.ack || 'auto'
        });
        
        // For snapshot topics, just store the subscription
        if (destination.startsWith('/snapshot/')) {
            console.log(`Subscription recorded, waiting for trigger message...`);
            
            // Enhanced: Support client-specific subscriptions
            if (destination.match(/^\/snapshot\/(positions|trades)\/[^/]+$/)) {
                console.log(`🎯 Client-specific subscription detected: ${destination}`);
            }
        }
    }
    
    handleSend(headers, body) {
        const destination = headers.destination;
        console.log(`Client ${this.id} sending to ${destination}: ${body}`);
        
        // Log request to file
        const logEntry = {
            timestamp: new Date().toISOString(),
            clientId: this.id,
            destination: destination,
            headers: headers,
            body: body
        };
        
        fs.appendFileSync(path.join(__dirname, 'requests.log'), 
            JSON.stringify(logEntry, null, 2) + '\n---\n', 
            'utf-8'
        );
        
        // Enhanced trigger pattern: /snapshot/{dataType}/{clientId}/{rate}[/{batchSize}]
        const requestString = body && body.startsWith('/snapshot/') ? body : destination;
        const match = requestString.match(protocol.TRIGGER_CLIENT_SPECIFIC);
        
        if (match) {
            const [, dataType, clientId, rateStr, batchStr] = match;
            const rate = parseInt(rateStr, 10);
            const batchSize = batchStr ? parseInt(batchStr, 10) : protocol.defaultBatchSize(rate);
            
            console.log(`📝 Client-specific trigger pattern matched:`);
            console.log(`   DataType: ${dataType}, ClientId: ${clientId}, Rate: ${rate}, BatchSize: ${batchSize}`);
            
            // Look for client-specific subscription: /snapshot/{dataType}/{clientId}
            const clientSpecificTopic = protocol.clientSubscriptionDestination(dataType, clientId);
            let subscription = null;
            
            for (const sub of this.subscriptions.values()) {
                if (sub.destination === clientSpecificTopic) {
                    subscription = sub;
                    break;
                }
            }
            
            if (subscription) {
                console.log(`🎯 Found client-specific subscription: ${clientSpecificTopic}`);
                this.startClientSpecificDataDelivery(dataType, clientId, rate, batchSize, subscription);
            } else {
                console.log(`❌ No subscription found for client-specific topic: ${clientSpecificTopic}`);
                console.log(`💡 Client should subscribe to: ${clientSpecificTopic}`);
                
                // Send error message to client
                this.send('MESSAGE', {
                    [protocol.HEADER.DESTINATION]: protocol.DESTINATION_ERRORS,
                    [protocol.HEADER.MESSAGE_ID]: `error-${Date.now()}`
                }, `Error: No subscription found for ${clientSpecificTopic}. Please subscribe first.`);
            }
        } else {
            // Backward compatibility: Check for legacy pattern
            const legacyMatch = requestString.match(protocol.TRIGGER_LEGACY);
            if (legacyMatch) {
                const [, dataType, rateStr, batchStr] = legacyMatch;
                const rate = parseInt(rateStr, 10);
                const batchSize = batchStr ? parseInt(batchStr, 10) : protocol.defaultBatchSize(rate);
                
                console.log(`📝 Legacy pattern detected - using generic topic`);
                console.log(`   DataType: ${dataType}, Rate: ${rate}, BatchSize: ${batchSize}`);
                
                // Find generic subscription
                let subscription = null;
                for (const sub of this.subscriptions.values()) {
                    if (sub.destination === protocol.genericSubscriptionDestination(dataType)) {
                        subscription = sub;
                        break;
                    }
                }
                
                if (subscription) {
                    console.log(`Trigger received! Starting ${dataType} delivery at ${rate} msg/sec with batch size ${batchSize}`);
                    this.startDataDelivery(dataType, rate, batchSize, subscription);
                } else {
                    console.log(`❌ No subscription found for /snapshot/${dataType}`);
                }
            } else {
                console.log(`❓ Unrecognized trigger pattern: ${requestString}`);
            }
        }
    }
    
    startDataDelivery(dataType, rate, batchSize, subscription) {
        const data = dataType === 'positions' ? positions : trades;
        const interval = 1000 / rate;
        let index = 0;
        let batchNumber = 1;
        
        const snapshotBatchInterval = protocol.SNAPSHOT_BATCH_INTERVAL_MS;
        
        // Track delivered records for live updates
        const deliveredRecords = [];
        
        const sendBatch = () => {
            if (index >= data.length) {
                // Send success message
                this.send('MESSAGE', {
                    [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                    [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}`,
                    [protocol.HEADER.DESTINATION]: subscription.destination
                }, protocol.legacySnapshotCompleteText(data.length, dataType));
                
                console.log(`📊 SNAPSHOT COMPLETE: ${dataType}, Rate: ${rate}/sec, Batch Size: ${batchSize}, Total Batches: ${batchNumber - 1}`);
                
                // Log all delivered position IDs to file for debugging
                if (dataType === 'positions') {
                    const positionIds = deliveredRecords.map(r => r.positionId);
                    fs.writeFileSync(path.join(__dirname, 'delivered-positions.log'), 
                        JSON.stringify({
                            timestamp: new Date().toISOString(),
                            clientId: this.id,
                            totalCount: positionIds.length,
                            positionIds: positionIds
                        }, null, 2), 
                        'utf-8'
                    );
                    console.log(`   📝 Logged ${positionIds.length} delivered position IDs to delivered-positions.log`);
                }
                
                // Start live updates with only delivered records
                this.startLiveUpdates(dataType, rate, subscription, deliveredRecords);
                return;
            }
            
            // Use client-provided batch size
            const batch = data.slice(index, index + batchSize);
            const actualBatchSize = batch.length; // Last batch might be smaller
            
            const updatedBatch = batch.map(record => updateDateToToday(record));
            
            // Store the actual records that were sent (with updated dates)
            deliveredRecords.push(...updatedBatch);
            
            // Log position IDs being delivered
            if (dataType === 'positions' && batchNumber <= 3) {
                console.log(`   📋 Batch ${batchNumber} position IDs: ${updatedBatch.map(p => p.positionId).slice(0, 3).join(', ')}${updatedBatch.length > 3 ? '...' : ''}`);
            }
            
            this.send('MESSAGE', {
                [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
                [protocol.HEADER.DESTINATION]: subscription.destination,
                [protocol.HEADER.CONTENT_TYPE]: 'application/json',
                [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT
            }, JSON.stringify(updatedBatch));
            
            console.log(`📦 SNAPSHOT BATCH ${batchNumber}: ${dataType}, Rate: ${rate}/sec, Batch Size: ${actualBatchSize}, Progress: ${index + actualBatchSize}/${data.length} (${((index + actualBatchSize) / data.length * 100).toFixed(1)}%)`);
            
            index += batchSize;
            batchNumber++;
            setTimeout(sendBatch, snapshotBatchInterval);
        };
        
        sendBatch();
    }
    
    startLiveUpdates(dataType, rate, subscription, deliveredRecords) {
        const interval = 1000 / rate;
        let updateNumber = 1;
        
        console.log(`🟢 STARTING LIVE UPDATES: ${dataType}, Rate: ${rate}/sec, Pool size: ${deliveredRecords.length} records`);
        
        // Log first 5 position IDs from delivered records
        if (dataType === 'positions') {
            const sampleIds = deliveredRecords.slice(0, 5).map(r => r.positionId);
            console.log(`   🔍 Sample delivered position IDs: ${sampleIds.join(', ')}`);
        }
        
        const updateInterval = setInterval(() => {
            if (!this.connected || !this.subscriptions.has(subscription.id)) {
                clearInterval(updateInterval);
                console.log(`🔴 LIVE UPDATES STOPPED: ${dataType}, Rate: ${rate}/sec`);
                return;
            }
            
            // Select only from delivered records
            const randomIndex = Math.floor(Math.random() * deliveredRecords.length);
            const baseRecord = deliveredRecords[randomIndex];
            
            if (!baseRecord) {
                console.error(`❌ ERROR: No base record found at index ${randomIndex} from ${deliveredRecords.length} records`);
                return;
            }
            
            const update = dataType === 'positions' 
                ? generatePositionUpdate(baseRecord)
                : generateTradeUpdate(baseRecord);
                
            // Verify position ID hasn't changed
            if (dataType === 'positions' && update.positionId !== baseRecord.positionId) {
                console.error(`❌ ERROR: Position ID mismatch! Original: ${baseRecord.positionId}, Update: ${update.positionId}`);
            }
            
            this.send('MESSAGE', {
                [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
                [protocol.HEADER.DESTINATION]: subscription.destination,
                [protocol.HEADER.CONTENT_TYPE]: 'application/json',
                [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.LIVE_UPDATE
            }, JSON.stringify([update]));
            
            const recordId = dataType === 'positions' ? update.positionId : update.tradeId;
            
            // Log key fields for positions
            if (dataType === 'positions') {
                // Check if this positionId exists in delivered records
                const existsInDelivered = deliveredRecords.some(r => r.positionId === update.positionId);
                if (!existsInDelivered) {
                    console.error(`❌ CRITICAL ERROR: Position ${update.positionId} NOT in delivered records!`);
                }
                
                console.log(`🔄 LIVE UPDATE ${updateNumber}: ${dataType}, Rate: ${rate}/sec, Record: ${recordId} (from pool: ${existsInDelivered ? 'YES' : 'NO'})`);
                console.log(`   📊 Market: currentPrice=${update.currentPrice?.toFixed(2)}, marketValue=${update.marketValue?.toFixed(0)}, totalValue=${update.totalValue?.toFixed(0)}`);
                console.log(`   💰 PnL: pnl=${update.pnl}, unrealizedPnl=${update.unrealizedPnl}, dailyPnl=${update.dailyPnl}, mtdPnl=${update.mtdPnl}, ytdPnl=${update.ytdPnl}`);
                console.log(`   📈 Analytics: dv01=${update.dv01?.toFixed(4)}, modifiedDuration=${update.modifiedDuration?.toFixed(2)}, spread=${update.spread}, yield=${update.yield?.toFixed(3)}`);
                if (update.analytics?.greeks) {
                    console.log(`   🔢 Greeks: delta=${update.analytics.greeks.delta?.toFixed(4)}, gamma=${update.analytics.greeks.gamma?.toFixed(4)}, vega=${update.analytics.greeks.vega?.toFixed(4)}`);
                }
                if (update.riskMetrics) {
                    console.log(`   ⚠️ Risk: var95=${update.riskMetrics.var95}, var99=${update.riskMetrics.var99}, sharpeRatio=${update.riskMetrics.sharpeRatio?.toFixed(2)}`);
                }
            } else {
                console.log(`🔄 LIVE UPDATE ${updateNumber}: ${dataType}, Rate: ${rate}/sec, Record: ${recordId}, Price: ${update.price?.toFixed(2)}`);
            }
            updateNumber++;
        }, interval);
        
        // Store interval for cleanup
        subscription.updateInterval = updateInterval;
    }
    
    startClientSpecificDataDelivery(dataType, clientId, rate, batchSize, subscription) {
        const data = dataType === 'positions' ? positions : trades;
        let index = 0;
        let batchNumber = 1;
        
        const snapshotBatchInterval = protocol.SNAPSHOT_BATCH_INTERVAL_MS;
        const deliveredRecords = [];
        const streamKey = `${dataType}-${clientId}`;
        
        console.log(`🚀 Starting client-specific data delivery:`);
        console.log(`   Client: ${clientId}`);
        console.log(`   Data Type: ${dataType}`);
        console.log(`   Rate: ${rate} msg/sec`);
        console.log(`   Batch Size: ${batchSize}`);
        console.log(`   Publishing to: ${subscription.destination}`);
        
        // Track this stream for cleanup
        if (!clientDataStreams.has(this.id)) {
            clientDataStreams.set(this.id, new Map());
        }
        clientDataStreams.get(this.id).set(streamKey, { subscription, deliveredRecords });
        
        const sendBatch = () => {
            if (index >= data.length) {
                // Snapshot complete - send success message
                this.send('MESSAGE', {
                    [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                    [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}`,
                    [protocol.HEADER.DESTINATION]: subscription.destination,
                    [protocol.HEADER.CLIENT_ID]: clientId,
                    [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT_COMPLETE
                }, protocol.clientSnapshotCompleteText(data.length, dataType, clientId));
                
                console.log(`📊 SNAPSHOT COMPLETE for client '${clientId}': ${deliveredRecords.length} records delivered`);
                
                // Start client-specific live updates
                this.startClientSpecificLiveUpdates(dataType, clientId, rate, subscription, deliveredRecords);
                return;
            }
            
            const endIndex = Math.min(index + batchSize, data.length);
            const batch = data.slice(index, endIndex);
            deliveredRecords.push(...batch);
            
            // Send to client-specific topic
            this.send('MESSAGE', {
                [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-batch-${batchNumber}`,
                [protocol.HEADER.DESTINATION]: subscription.destination,
                [protocol.HEADER.CONTENT_TYPE]: 'application/json',
                [protocol.HEADER.BATCH_NUMBER]: String(batchNumber),
                [protocol.HEADER.CLIENT_ID]: clientId,
                [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT
            }, JSON.stringify(batch));
            
            console.log(`📦 Client '${clientId}' batch ${batchNumber}: ${batch.length} records (${index + 1}-${endIndex}/${data.length})`);
            
            index = endIndex;
            batchNumber++;
            
            setTimeout(sendBatch, snapshotBatchInterval);
        };
        
        sendBatch();
    }
    
    startClientSpecificLiveUpdates(dataType, clientId, rate, subscription, deliveredRecords) {
        let updateNumber = 1;
        const streamKey = `${dataType}-${clientId}`;
        
        console.log(`🔄 Starting live updates for client '${clientId}': ${dataType} at ${rate} msg/sec`);
        
        const updateInterval = setInterval(() => {
            // Check if client is still connected
            if (!this.connected || !clients.has(this.id)) {
                console.log(`🔌 Client ${clientId} disconnected - stopping live updates`);
                clearInterval(updateInterval);
                return;
            }
            
            // Select random record from delivered records
            const randomRecord = deliveredRecords[Math.floor(Math.random() * deliveredRecords.length)];
            
            let update;
            if (dataType === 'positions') {
                update = generatePositionUpdate(randomRecord);
            } else {
                update = generateTradeUpdate(randomRecord);
            }
            
            // Send to client-specific topic
            this.send('MESSAGE', {
                [protocol.HEADER.SUBSCRIPTION]: subscription.id,
                [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
                [protocol.HEADER.DESTINATION]: subscription.destination,
                [protocol.HEADER.CONTENT_TYPE]: 'application/json',
                [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.LIVE_UPDATE,
                [protocol.HEADER.CLIENT_ID]: clientId,
                [protocol.HEADER.UPDATE_NUMBER]: String(updateNumber)
            }, JSON.stringify([update]));
            
            const recordId = dataType === 'positions' ? update.positionId : update.tradeId;
            console.log(`🔄 Live update ${updateNumber} → client '${clientId}': ${recordId}`);
            
            updateNumber++;
        }, 1000 / rate);
        
        // Store interval for cleanup
        this.liveUpdateIntervals.set(streamKey, updateInterval);
    }
    
    handleUnsubscribe(headers) {
        const id = headers.id;
        const subscription = this.subscriptions.get(id);
        
        if (subscription) {
            // Stop any legacy live updates for this subscription
            if (subscription.updateInterval) {
                clearInterval(subscription.updateInterval);
            }
            
            // Stop any client-specific live updates for this subscription
            if (subscription.destination.match(protocol.CLIENT_TOPIC_REGEX)) {
                const parts = subscription.destination.split('/');
                const dataType = parts[2];
                const clientId = parts[3];
                const streamKey = `${dataType}-${clientId}`;
                
                if (this.liveUpdateIntervals.has(streamKey)) {
                    clearInterval(this.liveUpdateIntervals.get(streamKey));
                    this.liveUpdateIntervals.delete(streamKey);
                    console.log(`🛑 Stopped live updates for client '${clientId}' on ${dataType}`);
                }
            }
            
            this.subscriptions.delete(id);
            console.log(`Client ${this.id} unsubscribed from ${subscription.destination}`);
        }
    }
    
    handleDisconnect() {
        this.cleanup();
        this.ws.close();
    }
    
    cleanup() {
        console.log(`🧹 Cleaning up client ${this.id}...`);
        
        // Clear all legacy live update intervals
        for (const subscription of this.subscriptions.values()) {
            if (subscription.updateInterval) {
                clearInterval(subscription.updateInterval);
            }
        }
        
        // Clear all client-specific live update intervals
        for (const [streamKey, interval] of this.liveUpdateIntervals.entries()) {
            clearInterval(interval);
            console.log(`🛑 Stopped live updates for stream: ${streamKey}`);
        }
        this.liveUpdateIntervals.clear();
        
        // Clear client data streams tracking
        if (clientDataStreams.has(this.id)) {
            const streams = clientDataStreams.get(this.id);
            console.log(`🗑️ Removing ${streams.size} data streams for client ${this.id}`);
            clientDataStreams.delete(this.id);
        }
        
        this.subscriptions.clear();
        this.connected = false;
        
        console.log(`✅ Client ${this.id} cleanup complete`);
    }
}

// Create HTTP server for health checks
const http = require('http');
const httpServer = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/health') {
        try {
            // Check MongoDB connection by trying to get positions count
            await mongoDataAccess.getPositionsCount();
            
            const healthStatus = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: USE_LOCAL_DATA ? 'local' : 'connected',
                dataSource: USE_LOCAL_DATA ? 'Local JSON Files' : 'MongoDB Atlas',
                memory: process.memoryUsage(),
                environment: NODE_ENV,
                positionsCount: positions.length,
                tradesCount: trades.length,
                mongodbConnected: !USE_LOCAL_DATA,
                useLocalData: USE_LOCAL_DATA
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(healthStatus, null, 2));
        } catch (error) {
            console.error('Health check failed:', error);
            
            // If we're using local data and have positions/trades loaded, we're still healthy
            if (USE_LOCAL_DATA && positions.length > 0 && trades.length > 0) {
                const healthStatus = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    database: 'local',
                    dataSource: 'Local JSON Files',
                    memory: process.memoryUsage(),
                    environment: NODE_ENV,
                    positionsCount: positions.length,
                    tradesCount: trades.length,
                    mongodbConnected: false,
                    useLocalData: USE_LOCAL_DATA,
                    note: 'MongoDB unavailable but using local data'
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(healthStatus, null, 2));
            } else {
                const errorStatus = {
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: error.message,
                    database: 'disconnected',
                    dataSource: 'None',
                    mongodbConnected: false,
                    useLocalData: USE_LOCAL_DATA
                };

                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(errorStatus, null, 2));
            }
        }
    } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'STOMP Fixed Income Server',
            version: '1.0.0',
            environment: NODE_ENV,
            endpoints: {
                health: '/health',
                websocket: `ws://localhost:${PORT}`
            }
        }, null, 2));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start server after loading data
async function startServer() {
    // Load data from MongoDB first
    await loadData();
    
    // Start HTTP server for health checks
    httpServer.listen(PORT, () => {
        console.log(`📋 HTTP server running on port ${PORT} (health checks)`);
    });
    
    // Attach WebSocket server to HTTP server
    const wss = new WebSocket.Server({ server: httpServer });
    
    // WebSocket connection handling
    wss.on('connection', (ws) => {
        const clientId = Date.now();
        const client = new StompConnection(ws, clientId);
        clients.set(clientId, client);
        
        console.log(`WebSocket connection established: ${clientId}`);
        
        ws.on('message', (data) => {
            const message = data.toString();
            const frames = message.split('\0').filter(f => f.trim());
            
            frames.forEach(frame => {
                if (frame.trim()) {
                    client.handleFrame(frame);
                }
            });
        });
        
        ws.on('close', () => {
            console.log(`Client ${clientId} disconnected`);
            client.cleanup();
            clients.delete(clientId);
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error);
        });
    });

    console.log(`🚀 Enhanced STOMP Fixed Income Server running on port ${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('🎯 Enhanced Usage (Client-Specific Streaming):');
    console.log('1. Client subscribes to: /snapshot/{dataType}/{clientId}');
    console.log('2. Client sends trigger to: /snapshot/{dataType}/{clientId}/{rate}[/{batchSize}]');
    console.log('3. Server delivers data to that specific client only');
    console.log('4. Automatic cleanup when client disconnects');
    console.log('');
    console.log('📡 Examples:');
    console.log('  Subscribe to: /snapshot/positions/TRADER001');
    console.log('  Trigger: /snapshot/positions/TRADER001/1000');
    console.log('  Subscribe to: /snapshot/trades/HFT_CLIENT');
    console.log('  Trigger: /snapshot/trades/HFT_CLIENT/5000/100');
    console.log('');
    console.log('🔄 Legacy Support:');
    console.log('  Subscribe to: /snapshot/positions');
    console.log('  Trigger: /snapshot/positions/1000');
    console.log('');
}

// Start the server
startServer().catch(console.error);