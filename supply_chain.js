const express = require('express');
const { Pool } = require('pg'); // 🐘 Clean PostgreSQL integration
const cors = require('cors');
const path = require('path');
const app = express();
require('dotenv').config();

app.use(cors({ origin: '*' })); 
app.use(express.json());

// 🔐 PostgreSQL Absolute URI Mapping Configuration
const dbConfig = {
    // Directly parsing your valid Azure connection string
    connectionString: process.env.WAREHOUSE_SQL_DATABASE || 'postgresql://superman4:postgre4231@postgres:5432/superman4',
    ssl: {
        rejectUnauthorized: false // Required for secure Azure PostgreSQL connections
    }
};

// Initialize the PostgreSQL central pool connection
const pool = new Pool(dbConfig);

// 🆕 ENDPOINT: Register a New Part & Initialize Starting Balances
app.post('/api/inventory/create-part', async (req, res) => {
    // Grab a client from the connection pool to run a secure multi-query transaction
    const client = await pool.connect();
    try {
        const { 
            sku, 
            partName, 
            description, 
            unitCost, 
            retailPrice, 
            minimumStockLevel, 
            initialWarehouseId, 
            initialQty 
        } = req.body;

        if (!sku || !partName || unitCost === undefined || retailPrice === undefined) {
            return res.status(400).json({ error: "Missing required core product metadata parameters." });
        }

        // Begin Transaction block
        await client.query('BEGIN');

        // 1. Insert the part metadata profile (PostgreSQL uses RETURNING instead of OUTPUT INSERTED)
        const partQuery = `
            INSERT INTO "Parts" ("SKU", "Name", "Description", "UnitCost", "RetailPrice", "MinimumStockLevel")
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING "PartID";
        `;
        const partResult = await client.query(partQuery, [
            sku, 
            partName, 
            description || "", 
            unitCost, 
            retailPrice, 
            minimumStockLevel || 10
        ]);
        
        const newPartId = partResult.rows[0].partid;

        // 2. Initialize warehouse allocations if present
        if (initialWarehouseId && initialQty !== undefined) {
            const balanceQuery = `
                INSERT INTO "InventoryBalances" ("PartID", "WarehouseID", "BinLocation", "QuantityOnHand")
                VALUES ($1, $2, 'RECEIVING-DOCK', $3);
            `;
            await client.query(balanceQuery, [newPartId, initialWarehouseId, initialQty]);

            const logQuery = `
                INSERT INTO "StockTransactions" ("PartID", "WarehouseID", "QuantityChanged", "TransactionType", "Timestamp")
                VALUES ($1, $2, $3, 'INITIAL_INTAKE', NOW());
            `;
            await client.query(logQuery, [newPartId, initialWarehouseId, initialQty]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Asset profile and pricing structure initialized.", partId: newPartId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Asset onboarding processing failure:", err.message);
        res.status(500).json({ error: "Failed to create parts allocation record." });
    } finally {
        client.release(); // Return client back to the pool
    }
});

// 📦 ENDPOINT: Fast-Scan Stock Reduction (Picking)
app.post('/api/inventory/pick', async (req, res) => {
    const client = await pool.connect();
    try {
        const { partId, warehouseId } = req.body;

        if (!partId || !warehouseId) {
            return res.status(400).json({ error: "Missing partId or warehouseId parameters." });
        }

        await client.query('BEGIN');

        // Decrement target item inventory allocation matrix
        const updateQuery = `
            UPDATE "InventoryBalances" 
            SET "QuantityOnHand" = "QuantityOnHand" - 1 
            WHERE "PartID" = $1 AND "WarehouseID" = $2
        `;
        await client.query(updateQuery, [partId, warehouseId]);

        // Audit transaction log tracing
        const logQuery = `
            INSERT INTO "StockTransactions" ("PartID", "WarehouseID", "QuantityChanged", "TransactionType", "Timestamp")
            VALUES ($1, $2, -1, 'PICK_SHORT', NOW())
        `;
        await client.query(logQuery, [partId, warehouseId]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Item successfully decremented from inventory matrix." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Pick processing failure:", err.message);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 📉 ENDPOINT: Fetch Low Stock Alerts
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        // Query syntax executing against pg core pooling engine directly
        const result = await pool.query(`
            SELECT p."PartID", p."SKU", p."Name", b."QuantityOnHand", b."WarehouseID"
            FROM "Parts" p
            JOIN "InventoryBalances" b ON p."PartID" = b."PartID"
            WHERE b."QuantityOnHand" <= p."MinimumStockLevel"
        `);

        console.log(`Successfully fetched ${result.rows.length} low-stock inventory items.`);
        res.json(result.rows); // pg hands array arrays back on .rows matrix
    } catch (err) {
        console.error("Failed to fetch low stock alerts:", err.message);
        res.status(500).json({ error: "Internal database query failure." });
    }
});

// 📂 Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '.')));
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Express server deployment initiation
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Inventory Engine active on port ${PORT}`));