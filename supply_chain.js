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

db.on('connect', (client) => {
    client.query('SET search_path TO public, money_schema, inventory_schema;');
});

// Serve frontend cleanly from root directory
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. GET: Fetch Dashboard Items
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        const queryText = `
            SELECT 
                p.partid, 
                p.sku, 
                p.name, 
                p.material_name, 
                CAST(p.retailprice AS FLOAT) as retailprice,
                COALESCE(i.warehouseid, 101) AS warehouseid, 
                COALESCE(i.binlocation, 'UNASSIGNED') AS binlocation, 
                COALESCE(i.quantityonhand, 0) AS quantityonhand,
                COALESCE(
                    (SELECT max(timestamp) FROM stocktransactions WHERE partid = p.partid AND transactiontype = 'PICK'), 
                    NULL
                ) AS datecheckedout
            FROM partstable p
            LEFT JOIN inventorybalancestable i ON p.partid = i.partid
            ORDER BY p.partid ASC;
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
            UPDATE inventorybalancestable 
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

// 3. PUT: Structural Key Mutation
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;

    try {
        await db.query('BEGIN');

        // Step 1: Update parent catalog primary key (Cascades to child balance table automatically)
        const alterCatalogQuery = `
            UPDATE partstable
            SET partid = $1 
            WHERE partid = $2;
        `;
        const catalogResult = await db.query(alterCatalogQuery, [newPartId, oldPartId]);

        if (catalogResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: "Target Part ID not found." });
        }

        // Step 2: Update warehouse context location separately to dodge multi-statement parser errors
        const alterBalanceLocationQuery = `
            UPDATE inventorybalancestable 
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
