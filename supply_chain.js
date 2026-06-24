const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); 

const db = new Pool({
    connectionString: process.env.WAREHOUSE_SQL_DATABASE,
    ssl: { rejectUnauthorized: false } 
});

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. GET: Fetch Dashboard Items using uppercase Views
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        const queryText = `
            SELECT 
                p."PartID", 
                p."SKU", 
                p."Name", 
                p."MaterialName", 
                p."RetailPrice",
                COALESCE(i."WarehouseID", 101) AS "WarehouseID", 
                COALESCE(i."BinLocation", 'UNASSIGNED') AS "BinLocation", 
                COALESCE(i."QuantityOnHand", 0) AS "QuantityOnHand",
                (SELECT max(timestamp) FROM stocktransactions WHERE partid = p."PartID" AND transactiontype = 'PICK') AS "DateCheckedOut"
            FROM "Parts" p
            LEFT JOIN "InventoryBalances" i ON p."PartID" = i."PartID";
        `;
        const result = await db.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Backend failed to read tracking views:", err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 2. POST: Adjust Stock Level 
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;

    try {
        await db.query('BEGIN'); 

        const updateQuery = `
            UPDATE "InventoryBalancesTable" 
            SET quantityonhand = quantityonhand + $1 
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const updateResult = await db.query(updateQuery, [quantityChanged, partId, warehouseId]);

        if (updateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: "Inventory record location target not found" });
        }

        const logQuery = `
            INSERT INTO stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
            VALUES ($1, $2, $3, $4);
        `;
        await db.query(logQuery, [partId, warehouseId, quantityChanged, transactiontype]);

        await db.query('COMMIT'); 
        res.json({ success: true, currentStock: updateResult.rows[0].quantityonhand });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Failed to alter physical inventory volumes:", err);
        res.status(500).json({ error: "Internal engine error processing transaction modification." });
    }
});

// 3. PUT: Structural Key Mutation (Fixed to leverage ON UPDATE CASCADE)
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;

    try {
        await db.query('BEGIN');

        // Step A: Modify central primary key catalog. This automatically updates InventoryBalancesTable's partid thanks to CASCADE!
        const alterCatalogQuery = `
            UPDATE "PartsTable" 
            SET partid = $1 
            WHERE partid = $2;
        `;
        await db.query(alterCatalogQuery, [newPartId, oldPartId]);

        // Step B: Now, update the warehouse location field cleanly using the newly cascaded Part ID
        const alterBalanceLocationQuery = `
            UPDATE "InventoryBalancesTable" 
            SET warehouseid = $1 
            WHERE partid = $2 AND warehouseid = $3;
        `;
        await db.query(alterBalanceLocationQuery, [newWarehouseId, newPartId, oldWarehouseId]);

        await db.query('COMMIT');
        res.json({ success: true });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Primary constraint cascade rejection:", err);
        res.status(500).json({ error: "Database rejected identifier adjustments due to key collision." });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Inventory Engine active on port ${PORT}`);
});
