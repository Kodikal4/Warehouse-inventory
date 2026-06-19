const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // Essential to parse incoming req.body JSON strings!

// Configure connection to Azure PostgreSQL flexible server
const db = new Pool({
    connectionString: process.env.WAREHOUSE_SQL_DATABASE,
    ssl: { rejectUnauthorized: false } // Required for secure Azure database links
});

// A. CRITICAL FIX: Explicitly serve index.html on the root domain path
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. GET: Fetch Dashboard Low Stock Items (Using our case-insensitive Views)
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        const queryText = `
            SELECT 
                p."PartID", p."SKU", p."Name", p."MaterialName", p."RetailPrice",
                i."WarehouseID", i."BinLocation", i."QuantityOnHand",
                (SELECT max(timestamp) FROM stocktransactions WHERE partid = p."PartID" AND transactiontype = 'PICK') AS "DateCheckedOut"
            FROM "Parts" p
            JOIN "InventoryBalances" i ON p."PartID" = i."PartID";
        `;
        const result = await db.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Backend failed to read tracking views:", err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 2. POST: Adjust Stock Level (Fires when the user clicks 'Pick 1 Unit')
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;

    try {
        await db.query('BEGIN'); // Start transaction block

        // Deduct/Add items from the physical database table
        const updateQuery = `
            UPDATE inventorybalances 
            SET quantityonhand = quantityonhand + $1 
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const updateResult = await db.query(updateQuery, [quantityChanged, partId, warehouseId]);

        if (updateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: "Inventory record location target not found" });
        }

        // Write to history log for warehouse audit tracking
        const logQuery = `
            INSERT INTO stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
            VALUES ($1, $2, $3, $4);
        `;
        await db.query(logQuery, [partId, warehouseId, quantityChanged, transactiontype]);

        await db.query('COMMIT'); // Finalize changes cleanly
        res.json({ success: true, currentStock: updateResult.rows[0].quantityonhand });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Failed to alter physical inventory volumes:", err);
        res.status(500).json({ error: "Internal engine error processing transaction modification." });
    }
});

// 3. PUT: Structural Key Mutation (Safely alters PartID and WarehouseID simultaneously)
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;

    try {
        await db.query('BEGIN');

        // Step A: Modify the central definition catalog identifier
        const alterCatalogQuery = `
            UPDATE parts 
            SET partid = $1 
            WHERE partid = $2;
        `;
        await db.query(alterCatalogQuery, [newPartId, oldPartId]);

        // Step B: Update the dependent regional location tracker balances
        const alterBalanceLocationQuery = `
            UPDATE inventorybalances 
            SET partid = $1, warehouseid = $2 
            WHERE partid = $1 AND warehouseid = $3;
        `;
        await db.query(alterBalanceLocationQuery, [newPartId, newWarehouseId, oldWarehouseId]);

        await db.query('COMMIT');
        res.json({ success: true });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Primary constraint cascade rejection:", err);
        res.status(500).json({ error: "Database rejected identifier adjustments due to key collision." });
    }
});

// Spin engine up on Azure container target port
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Inventory Engine active on port ${PORT}`);
});