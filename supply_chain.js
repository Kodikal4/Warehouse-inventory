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

// Serve frontend cleanly from root directory
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// NEW: 1. GET Aggregate Inventory Summary for Analytics Pulse
app.get('/api/inventory/summary', async (_req, res) => {
    try {
        const summaryQuery = `
            SELECT 
                COALESCE(SUM(i.quantityonhand * p.retailprice), 0) AS total_value,
                COUNT(DISTINCT i.warehouseid) AS active_warehouses,
                COUNT(CASE WHEN i.quantityonhand <= p.minimumstocklevel THEN 1 END) AS stockout_risks
            FROM public.partstable p
            LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid;
        `;
        const result = await db.query(summaryQuery);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Failed to compile executive summary metrics:", err);
        res.status(500).json({ error: "Internal analytics engine error." });
    }
});

// 2. GET: Fetch Dashboard Items
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        const queryText = `
            SELECT 
                p.partid, 
                p.sku, 
                p.name, 
                p.material_name, 
                p.retailprice,
                p.minimumstocklevel,
                COALESCE(i.warehouseid, 101) AS warehouseid, 
                COALESCE(i.binlocation, 'UNASSIGNED') AS binlocation, 
                COALESCE(i.quantityonhand, 0) AS quantityonhand,
                (SELECT max(timestamp) FROM public.stocktransactions WHERE partid = p.partid AND transactiontype = 'PICK') AS datecheckedout
            FROM public.partstable p
            LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid
            ORDER BY p.partid ASC;
        `;
        const result = await db.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Backend failed to read tracking views:", err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 3. POST: Adjust Stock Level 
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;
    try {
        await db.query('BEGIN'); 

        const updateQuery = `
            UPDATE public.inventorybalancestable 
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
            INSERT INTO public.stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
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

// 4. PUT: Structural Key Mutation
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;
    try {
        await db.query('BEGIN');

        const alterCatalogQuery = `
            UPDATE public.partstable
            SET partid = $1 
            WHERE partid = $2;
        `;
        const catalogResult = await db.query(alterCatalogQuery, [newPartId, oldPartId]);

        if (catalogResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: "Target Part ID not found in system table records." });
        }

        const alterBalanceLocationQuery = `
            UPDATE public.inventorybalancestable 
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
