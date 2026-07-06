const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

require('dotenv').config();


const app = express();
app.use(cors());
app.use(express.json()); 

// FIXED: Consolidated into a single pool using your exact Azure variable mappings
const db = new Pool({
    connectionString: "postgresql://superman4:Postgre4231@superman4-db.postgres.database.azure.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

db.on('connect', (client) => {
    client.query('SET search_path TO public, assets, values;');
});

// Serve frontend cleanly from root directory
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. GET Aggregate Inventory Summary for Analytics Pulse
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

app.get('/api/inventory/low-stock', async (req, res) => {
    try {
        const { warehouse } = req.query; // Capture ?warehouse=101 from URL
        
        let queryText = `
            SELECT 
                p.sku, p.name, p.material_name, p.retailprice,
                i.warehouseid, i.quantityonhand, p.minimumstocklevel, p.partid,
                CASE 
                    WHEN i.warehouseid = 101 THEN '📍 Detroit Assembly Plant'
                    WHEN i.warehouseid = 202 THEN '📍 Chicago Distribution Hub'
                    ELSE '📍 Unknown Node (' || i.warehouseid || ')'
                END AS node_loc
            FROM public.partstable p
            LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid
        `;

        const queryParams = [];
        
        // Dynamic SQL filtering
        if (warehouse && warehouse !== 'all') {
            queryText += ` WHERE i.warehouseid = $1`;
            queryParams.push(parseInt(warehouse));
        }

        const result = await db.query(queryText, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 3. POST: Adjust Stock Level (FIXED: Safe Multi-Statement Transaction Handling)
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;
    
    // Check out a dedicated database worker from the pool
    const client = await db.connect();
    
    try {
        // Start the transaction safely on this dedicated client
        await client.query('BEGIN'); 

        const updateQuery = `
            UPDATE public.inventorybalancestable 
            SET quantityonhand = quantityonhand + $1 
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const updateResult = await client.query(updateQuery, [quantityChanged, partId, warehouseId]);

        if (updateResult.rows.length === 0) {
            // Rollback using the dedicated client
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Inventory record location target not found" });
        }

        const logQuery = `
            INSERT INTO public.stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(logQuery, [partId, warehouseId, quantityChanged, transactiontype]);

        // Commit the transaction safely on this dedicated client
        await client.query('COMMIT'); 
        
        res.json({ success: true, currentStock: updateResult.rows[0].quantityonhand });
    } catch (err) {
        // If anything fails above, rollback this specific worker's queries
        await client.query('ROLLBACK');
        console.error("Failed to alter physical inventory volumes:", err);
        res.status(500).json({ error: "Internal engine error processing transaction modification." });
    } finally {
        // CRITICAL: Always return the worker back to the pool, success or fail
        client.release();
    }
});

// 4. PUT: Structural Key Mutation
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, newPartId, newWarehouseId } = req.body;
    
    // FIXED: Properly checking out a single pool client to handle sequential transaction statements safely
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        if (oldPartId !== newPartId) {
            await client.query(`
                UPDATE public.partstable 
                SET partid = $1 
                WHERE partid = $2;
            `, [newPartId, oldPartId]);
        }

        const upsertInventoryQuery = `
            INSERT INTO public.inventorybalancestable (partid, warehouseid, binlocation, quantityonhand)
            VALUES ($1, $2, 'TRANSFER-ZONE', 1)
            ON CONFLICT (partid, warehouseid) 
            DO UPDATE SET 
                warehouseid = EXCLUDED.warehouseid,
                binlocation = 'RELOCATED-BAY';
        `;
        
        await client.query(upsertInventoryQuery, [newPartId, newWarehouseId]);

        await client.query('COMMIT');
        res.status(200).json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Logistics Update Failed:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Inventory Engine active on port ${PORT}`);
});
